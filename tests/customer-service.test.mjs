import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'

let server,
  createPinia,
  useAuthStore,
  useCustomerServiceStore,
  useCustomerServiceContext,
  useCustomerServiceComposer,
  fixture
const entries = new Map()
const requests = []
const user = { id: 'customer-1', account: 'demo', nickname: '演示用户', role: 1 }
const product = {
  id: '9007199254740993123',
  name: 'GNSS 接收机',
  model: 'RTK-01',
  imageUrl: null,
  priceFen: 0,
  sales: 12,
  stock: 3,
  detailImages: [],
}
const order = {
  id: '9007199254740993101',
  orderNo: 'JW202610160001',
  status: 'PENDING_PAYMENT',
  payableAmountFen: 129900,
  paidAmountFen: null,
  recipient: { name: 'private-name', phone: '13812345678', address: 'private-address' },
  items: [],
}
function session(token = 'customer-token', id = 'customer-1') {
  entries.set(
    'nesmartmall.auth',
    JSON.stringify({
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600000,
      user: { ...user, id },
    }),
  )
}
before(async () => {
  globalThis.localStorage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: (k) => entries.delete(k),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/' },
  })
  server = await createServer({
    configFile: false,
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  // Keep missing modules inside each test so RED still releases the loader and timers.
})
beforeEach(() => {
  entries.clear()
  requests.length = 0
})
afterEach(() => {
  fixture?.support.$dispose()
  fixture?.auth.logout()
  fixture?.auth.$dispose()
  fixture = undefined
})
after(async () => {
  await server?.close()
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  delete globalThis.window
})
async function mount(authenticated = false) {
  ;({ useCustomerServiceStore } = await server.ssrLoadModule('/src/stores/customerService.ts'))
  const pinia = createPinia()
  if (authenticated) session()
  const auth = useAuthStore(pinia),
    support = useCustomerServiceStore(pinia)
  const { http } = await server.ssrLoadModule('/src/api/http.ts')
  http.defaults.adapter = async (config) => {
    requests.push(config)
    throw new Error('Customer service must not make network requests')
  }
  fixture = { auth, support, pinia }
  return fixture
}
function clock(context) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.now() })
}

test('guest text is trimmed, renders locally and receives a clearly simulated response without network or persistence', async (context) => {
  clock(context)
  const { support } = await mount()
  support.open()
  support.draft = '  想了解这个商品  '
  assert.equal(support.sendText(), true)
  assert.equal(support.messages.at(-1).text, '想了解这个商品')
  assert.equal(support.messages.at(-1).sender, 'visitor')
  assert.equal(support.draft, '')
  assert.equal(support.isReplying, true)
  context.mock.timers.tick(1000)
  assert.equal(support.messages.at(-1).sender, 'service')
  assert.match(support.messages.at(-1).text, /演示/)
  assert.equal(support.isReplying, false)
  assert.equal(support.unreadCount, 0)
  assert.equal(requests.length, 0)
  assert.equal([...entries.keys()].filter((k) => /support|customerService|chat/i.test(k)).length, 0)
})
test('empty and oversized messages do not send, while the 500 character boundary works', async (context) => {
  clock(context)
  const { support } = await mount()
  const length = support.messages.length
  support.draft = ' \n '
  assert.equal(support.sendText(), false)
  assert.equal(support.messages.length, length)
  support.draft = '字'.repeat(501)
  assert.equal(support.sendText(), false)
  assert.ok(support.error)
  assert.equal(support.messages.length, length)
  support.draft = '字'.repeat(500)
  assert.equal(support.sendText(), true)
  assert.equal(support.messages.at(-1).text.length, 500)
})
test('closing preserves draft and history; closed replies add unread and opening consumes them', async (context) => {
  clock(context)
  const { support } = await mount()
  support.open()
  support.draft = '物流怎么查'
  support.sendText()
  support.draft = '下一条草稿'
  support.close()
  context.mock.timers.tick(1000)
  assert.equal(support.unreadCount, 1)
  assert.equal(support.draft, '下一条草稿')
  const count = support.messages.length
  support.open()
  assert.equal(support.unreadCount, 0)
  assert.equal(support.messages.length, count)
})
test('a second consumer gets the same conversation across page lifetimes', async () => {
  const { support, pinia } = await mount()
  support.open()
  support.draft = '保留草稿'
  support.close()
  const other = useCustomerServiceStore(pinia)
  assert.equal(other.draft, '保留草稿')
  other.open()
  assert.equal(support.visible, true)
})
test('clear cancels late replies and removes text, draft, context and unread', async (context) => {
  clock(context)
  const { support } = await mount()
  support.open({
    kind: 'product',
    id: product.id,
    name: product.name,
    model: product.model,
    priceFen: 0,
  })
  support.draft = 'hello'
  support.sendText()
  support.draft = 'private draft'
  support.close()
  support.clearConversation()
  context.mock.timers.tick(2000)
  assert.equal(support.messages.length, 1)
  assert.equal(support.messages[0].sender, 'service')
  assert.equal(support.draft, '')
  assert.equal(support.pendingContext, null)
  assert.equal(support.unreadCount, 0)
  assert.equal(support.isReplying, false)
})
test('logout immediately removes private conversations and prevents delayed replies', async (context) => {
  clock(context)
  const { support, auth } = await mount(true)
  support.open()
  support.draft = 'private text'
  support.sendText()
  support.draft = 'private draft'
  auth.logout()
  assert.equal(support.messages.length, 1)
  assert.equal(support.draft, '')
  assert.equal(support.visible, false)
  context.mock.timers.tick(2000)
  assert.equal(support.messages.length, 1)
})
test('account changes detected at response time cannot append old replies to the new account', async (context) => {
  clock(context)
  const { support } = await mount(true)
  support.open()
  support.draft = 'old account'
  support.sendText()
  session('other-token', 'customer-2')
  context.mock.timers.tick(1000)
  assert.equal(support.messages.length, 1)
  assert.equal(support.draft, '')
  assert.equal(support.isReplying, false)
})
test('guest-to-user login clears guest history; same-account token renewal preserves it', async (context) => {
  clock(context)
  const { support, auth } = await mount()
  support.draft = 'guest question'
  support.sendText()
  session()
  auth.getAuthorization()
  assert.equal(support.messages.length, 1)
  support.draft = 'same account'
  support.sendText()
  session('renewed-token')
  auth.getAuthorization()
  assert.equal(support.messages.length, 2)
  context.mock.timers.tick(1000)
  assert.equal(support.messages.length, 3)
})
test('expired auth clears messages even when the timer detects expiry before a storage event', async (context) => {
  clock(context)
  const { support } = await mount(true)
  support.draft = 'private order'
  support.sendText()
  const data = JSON.parse(entries.get('nesmartmall.auth'))
  data.expiresAt = Date.now() - 1
  entries.set('nesmartmall.auth', JSON.stringify(data))
  context.mock.timers.tick(1000)
  assert.equal(support.messages.length, 1)
  assert.equal(support.pendingContext, null)
})
test('context is previewed and must be explicitly sent, snapshot copies cannot be mutated later', async (context) => {
  clock(context)
  const { support } = await mount()
  const card = {
    kind: 'product',
    id: product.id,
    name: product.name,
    model: product.model,
    priceFen: 0,
  }
  support.open(card)
  card.name = 'mutated'
  assert.equal(support.messages.length, 1)
  assert.equal(support.pendingContext.name, 'GNSS 接收机')
  assert.equal(support.sendContext(), true)
  assert.equal(support.messages.at(-1).context.name, 'GNSS 接收机')
  assert.equal(support.pendingContext, null)
  assert.equal(support.sendContext(), false)
  context.mock.timers.tick(1000)
  assert.equal(support.messages.at(-1).sender, 'service')
})
test('removing a context preview does not send or erase the typed question', async () => {
  const { support } = await mount()
  support.open({ kind: 'product', id: '1', name: '仪器', model: null, priceFen: null })
  support.draft = '问题'
  support.removeContext()
  assert.equal(support.pendingContext, null)
  assert.equal(support.draft, '问题')
  assert.equal(support.messages.length, 1)
})
test('product and order entry carry only safe consultation fields and distinguish zero from unknown amounts', async () => {
  const { support, pinia } = await mount(true)
  ;({ useCustomerServiceContext } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceContext.ts',
  ))
  // Composables use the active Pinia set by store access, as they do inside app setup.
  useCustomerServiceStore(pinia)
  const entry = useCustomerServiceContext()
  entry.consultProduct(product)
  assert.deepEqual(support.pendingContext, {
    kind: 'product',
    id: '9007199254740993123',
    name: 'GNSS 接收机',
    model: 'RTK-01',
    priceFen: 0,
  })
  entry.consultProduct({ ...product, priceFen: null })
  assert.equal(support.pendingContext.priceFen, null)
  entry.consultOrder(order)
  assert.deepEqual(support.pendingContext, {
    kind: 'order',
    id: '9007199254740993101',
    orderNo: 'JW202610160001',
    status: 'PENDING_PAYMENT',
    amountFen: 129900,
    amountLabel: '应付金额',
  })
  assert.equal(JSON.stringify(support.pendingContext).includes('private'), false)
  entry.consultOrder({ ...order, paidAmountFen: 0 })
  assert.equal(support.pendingContext.amountFen, 0)
  assert.equal(support.pendingContext.amountLabel, '实付金额')
})
test('quick questions select the relevant simulated answer without claiming actual logistics or shipping commitments', async (context) => {
  clock(context)
  const { support } = await mount()
  support.sendQuestion('logistics')
  context.mock.timers.tick(1000)
  assert.match(support.messages.at(-1).text, /物流/)
  assert.match(support.messages.at(-1).text, /演示/)
  const count = support.messages.length
  support.sendQuestion('unknown')
  assert.equal(support.messages.length, count)
})
test('Enter sends once but composition, keyCode 229, Shift+Enter and other keys remain editor input', async () => {
  const { support } = await mount()
  ;({ useCustomerServiceComposer } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceComposer.ts',
  ))
  const composer = useCustomerServiceComposer()
  let prevented = 0
  const event = (overrides = {}) => ({
    key: 'Enter',
    shiftKey: false,
    isComposing: false,
    keyCode: 13,
    preventDefault: () => prevented++,
    ...overrides,
  })
  support.draft = '键盘消息'
  for (const overrides of [
    { isComposing: true },
    { keyCode: 229 },
    { shiftKey: true },
    { key: 'a' },
  ])
    composer.handleKeydown(event(overrides))
  assert.equal(support.messages.length, 1)
  assert.equal(prevented, 0)
  composer.handleKeydown(event())
  assert.equal(support.messages.length, 2)
  assert.equal(prevented, 1)
  assert.equal(support.draft, '')
  composer.handleKeydown(event())
  assert.equal(support.messages.length, 2)
})

test('a quick-question click after an account switch never restores the old private draft', async () => {
  const { support } = await mount(true)
  support.draft = 'private old draft'
  session('other-token', 'customer-2')
  support.sendQuestion('shipping')
  assert.equal(support.draft, '')
  assert.equal(JSON.stringify(support.messages).includes('private old draft'), false)
})
test('an order entry from stale page content cannot carry old account context into a new session', async () => {
  const { support } = await mount(true)
  session('other-token', 'customer-2')
  support.open({
    kind: 'order',
    id: order.id,
    orderNo: order.orderNo,
    status: order.status,
    amountFen: 129900,
    amountLabel: '应付金额',
  })
  assert.equal(support.pendingContext, null)
  assert.equal(support.messages.length, 1)
})
