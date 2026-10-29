import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { readFileSync } from 'node:fs'
import { effectScope } from 'vue'

let server, createPinia, useAuthStore, useCustomerServiceStore, http, configureAuth, fixture
let respond
const entries = new Map()
const requests = []
const user = { id: 'customer-1', account: 'demo', nickname: '用户', role: 1 }
const delta = (text) => `data: ${JSON.stringify({ type: 'delta', payload: { text } })}\n\n`
const done = 'data: {"type":"done","payload":{}}\n\n'
const encoder = new TextEncoder()
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
function sse(text) {
  return new Response(text, { headers: { 'Content-Type': 'text/event-stream; charset=utf-8' } })
}
function controlledStream() {
  let controller,
    cancelled = false
  const body = new ReadableStream({
    start(value) {
      controller = value
    },
    cancel() {
      cancelled = true
    },
  })
  return {
    respond(request) {
      request.signal.addEventListener(
        'abort',
        () => {
          cancelled = true
          controller.error(new DOMException('Aborted', 'AbortError'))
        },
        { once: true },
      )
      return sse(body)
    },
    push: (text) => controller.enqueue(encoder.encode(text)),
    end: () => controller.close(),
    get cancelled() {
      return cancelled
    },
  }
}
async function settle(predicate) {
  for (let i = 0; i < 100; i++) {
    if (predicate()) return
    await new Promise(setImmediate)
  }
  assert.ok(predicate(), 'Expected asynchronous state to settle')
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
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  http.defaults.baseURL = 'https://mall.example.test'
  http.defaults.env.fetch = async (request) => {
    requests.push(request)
    return respond(request)
  }
})
beforeEach(() => {
  http.defaults.adapter = 'fetch'
  entries.clear()
  requests.length = 0
  respond = () => sse(delta('回答') + done)
})
afterEach(() => {
  fixture?.orderScope?.stop()
  fixture?.support?.$dispose()
  fixture?.auth.logout()
  fixture?.auth.$dispose()
  fixture = undefined
})

const orderResponse = JSON.parse(
  readFileSync(new URL('./fixtures/order-list-response.json', import.meta.url), 'utf8'),
)
async function mountOrderPicker(authenticated = true, response = async () => orderResponse) {
  const mounted = await mount(authenticated)
  const orderRequests = []
  http.defaults.adapter = async (config) => {
    orderRequests.push(config)
    return { data: await response(config), status: 200, statusText: 'OK', headers: {}, config }
  }
  const { setActivePinia } = await server.ssrLoadModule('pinia')
  setActivePinia(mounted.pinia)
  const { useCustomerServiceOrders } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceOrders.ts',
  )
  mounted.orderScope = effectScope()
  const picker = mounted.orderScope.run(() => useCustomerServiceOrders())
  return { ...mounted, picker, orderRequests }
}

test('support entry loads every order and reopening refreshes without loading in guide', async () => {
  const { support, picker, orderRequests } = await mountOrderPicker()
  support.open('guide')
  await new Promise(setImmediate)
  assert.equal(orderRequests.length, 0)
  support.open('support')
  await settle(() => picker.state.value === 'success')
  assert.equal(orderRequests[0].url, '/api/orders')
  assert.equal(orderRequests[0].headers.get('Authorization'), 'Bearer customer-token')
  assert.deepEqual(
    picker.orders.value.map((order) => order.orderNo),
    [
      'JW1980123456789012300',
      'JW1980123456789012301',
      'JW1980123456789012302',
      'JW1980123456789012304',
      'JW1980123456789012303',
    ],
  )
  support.close()
  await new Promise(setImmediate)
  support.open('support')
  await settle(() => orderRequests.length === 2 && picker.state.value === 'success')
})

test('selecting an order sends its number to support once and preserves the typed draft', async () => {
  const { support, picker } = await mountOrderPicker()
  support.open('support')
  await settle(() => picker.state.value === 'success')
  support.draft = '我还想询问发货时间'
  const source = controlledStream()
  respond = (request) => source.respond(request)
  assert.equal(picker.consultOrder('not-an-order'), false)
  assert.equal(picker.consultOrder('JW1980123456789012301'), true)
  assert.equal(picker.consultOrder('JW1980123456789012301'), false)
  await settle(() => requests.length === 1)
  assert.equal(new URL(requests[0].url).pathname, '/api/support/turns/stream')
  assert.equal((await requests[0].json()).text, '我想咨询JW1980123456789012301订单')
  assert.equal(support.messages.at(-1).text, '我想咨询JW1980123456789012301订单')
  assert.equal(support.draft, '我还想询问发货时间')
  assert.equal(picker.showPicker.value, false)
})

test('manual dismissal hides only order selection until the next support visit', async () => {
  const { support, picker } = await mountOrderPicker()
  support.open('support')
  await settle(() => picker.state.value === 'success')
  assert.equal(picker.showPicker.value, true)
  support.draft = '保留我的问题'
  picker.dismiss()
  assert.equal(picker.showPicker.value, false)
  assert.equal(support.visible, true)
  assert.equal(support.draft, '保留我的问题')
  support.open('guide')
  support.open('support')
  assert.equal(picker.showPicker.value, true)
})

test('only accepted support messages dismiss order selection and old history does not hide it', async () => {
  const { support, picker } = await mountOrderPicker()
  support.open('support')
  await settle(() => picker.state.value === 'success')
  assert.equal(support.sendText(), false)
  assert.equal(picker.showPicker.value, true)
  support.draft = '我想查询物流'
  assert.equal(support.sendText(), true)
  assert.equal(picker.showPicker.value, false)
  await settle(() => !support.isReplying)
  support.open('guide')
  support.open('support')
  assert.equal(picker.showPicker.value, true)
})

test('order query failure can be retried and empty results stay empty', async () => {
  let fail = true
  const { support, picker } = await mountOrderPicker(true, async () => {
    if (fail) throw new Error('offline')
    return { code: 200, data: [] }
  })
  support.open('support')
  await settle(() => picker.state.value === 'error')
  fail = false
  await picker.load()
  assert.equal(picker.state.value, 'empty')
  assert.deepEqual(picker.orders.value, [])
})

test('logged out support does not request orders', async () => {
  const { support, picker, orderRequests } = await mountOrderPicker(false)
  support.open('support')
  await settle(() => picker.state.value === 'login-required')
  assert.equal(orderRequests.length, 0)
  assert.equal(picker.consultOrder('JW1980123456789012301'), false)
})

test('logout cancels an order query and its late response cannot restore old orders', async () => {
  let resolve
  const { support, auth, picker, orderRequests } = await mountOrderPicker(
    true,
    () =>
      new Promise((done) => {
        resolve = done
      }),
  )
  support.open('support')
  await settle(() => orderRequests.length === 1 && resolve)
  auth.logout()
  resolve(orderResponse)
  await new Promise(setImmediate)
  assert.equal(orderRequests[0].signal.aborted, true)
  assert.deepEqual(picker.orders.value, [])
  assert.equal(picker.consultOrder('JW1980123456789012301'), false)
})
after(async () => {
  await server?.close()
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  delete globalThis.window
})
async function mount(authenticated = true, withStore = true) {
  if (authenticated) session()
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  fixture = { auth, pinia }
  if (withStore) {
    ;({ useCustomerServiceStore } = await server.ssrLoadModule('/src/stores/customerService.ts'))
    fixture.support = useCustomerServiceStore(pinia)
  }
  return fixture
}
async function stream(entry = 'guide', text = '本轮问题', options = {}) {
  const { streamCustomerServiceTurn } = await server.ssrLoadModule('/src/api/customerService.ts')
  return streamCustomerServiceTurn(entry, text, {
    expectedAuthorization: 'Bearer customer-token',
    onDelta: () => {},
    ...options,
  })
}

for (const [entry, path] of [
  ['guide', '/api/guide/turns/stream'],
  ['support', '/api/support/turns/stream'],
]) {
  test(`${entry} POST uses its fixed Gateway path, Bearer and only this turn's text`, async () => {
    await mount(true, false)
    const chunks = []
    await stream(entry, '我想买户外测量设备', { onDelta: (value) => chunks.push(value) })
    assert.equal(requests.length, 1)
    const request = requests[0]
    assert.equal(new URL(request.url).pathname, path)
    assert.equal(request.method, 'POST')
    assert.equal(request.headers.get('Authorization'), 'Bearer customer-token')
    assert.equal(request.headers.get('Content-Type'), 'application/json')
    assert.equal(request.headers.get('Accept'), 'text/event-stream')
    assert.deepEqual(await request.json(), { text: '我想买户外测量设备' })
    assert.deepEqual(chunks, ['回答'])
  })
}
test('SSE incrementally decodes split UTF-8, CRLF, heartbeat and multiline data', async () => {
  await mount(true, false)
  let controller
  respond = () =>
    sse(
      new ReadableStream({
        start(c) {
          controller = c
        },
      }),
    )
  const chunks = []
  const result = stream('guide', '问题', { onDelta: (value) => chunks.push(value) })
  await settle(() => controller)
  const bytes = encoder.encode(
    ': heartbeat\r\n\r\ndata: {"type":"delta",\r\ndata: "payload":{"text":"中文🙂\\n下一行"}}\r\n\r\n',
  )
  for (const byte of bytes) controller.enqueue(Uint8Array.of(byte))
  await settle(() => chunks.length === 1)
  assert.deepEqual(chunks, ['中文🙂\n下一行'])
  controller.enqueue(encoder.encode(delta('尾段') + done + delta('不能出现')))
  await result
  assert.deepEqual(chunks, ['中文🙂\n下一行', '尾段'])
})
test('done stops and cancels the upstream stream without waiting for EOF', async () => {
  await mount(true, false)
  const source = controlledStream()
  respond = (request) => source.respond(request)
  const result = stream()
  await settle(() => requests.length === 1)
  source.push(done)
  await result
  await settle(() => source.cancelled)
})
for (const [name, body] of [
  ['EOF without done', delta('部分回答')],
  ['truncated final frame', delta('部分回答') + 'data: {"type":"done","payload":{}}'],
  ['malformed JSON', 'data: {broken}\n\n'],
  ['malformed delta', 'data: {"type":"delta","payload":{"text":9}}\n\n'],
  ['unknown event', 'data: {"type":"other","payload":{}}\n\n'],
  ['error event', delta('部分回答') + 'data: {"type":"error","payload":{"message":"failure"}}\n\n'],
]) {
  test(`${name} fails instead of claiming completion`, async () => {
    await mount(true, false)
    respond = () => sse(body)
    await assert.rejects(stream())
    assert.equal(requests.length, 1)
  })
}
test('a non-SSE JSON response is rejected and not rendered as an answer', async () => {
  await mount(true, false)
  respond = () => Response.json({ code: 500, message: 'failed' })
  await assert.rejects(stream())
})
test('HTTP 401 clears only the rejected login', async () => {
  const { auth } = await mount(true, false)
  respond = () => Response.json({ code: 401 }, { status: 401 })
  await assert.rejects(stream())
  assert.equal(auth.isAuthenticated, false)
})
test('an old request HTTP 401 does not clear a new account', async () => {
  const { auth } = await mount(true, false)
  let resolve
  respond = () =>
    new Promise((r) => {
      resolve = r
    })
  const result = stream()
  await settle(() => resolve)
  session('new-token', 'customer-2')
  auth.getAuthorization()
  resolve(Response.json({ code: 401 }, { status: 401 }))
  await assert.rejects(result)
  assert.equal(auth.getAuthorization(), 'Bearer new-token')
})
test('a stale request is cancelled before transport and never borrows a new token', async () => {
  await mount(true, false)
  session('new-token', 'customer-2')
  await assert.rejects(stream())
  assert.equal(requests.length, 0)
})
test('aborting a waiting stream releases its reader and rejects', async () => {
  await mount(true, false)
  const source = controlledStream()
  respond = (request) => source.respond(request)
  const controller = new AbortController()
  const result = stream('guide', '问题', { signal: controller.signal })
  await settle(() => requests.length === 1)
  controller.abort()
  await assert.rejects(result)
  await settle(() => source.cancelled)
})

test('guest send opens the existing login dialog without network or local fake reply', async () => {
  const { support, pinia } = await mount(false)
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  support.open()
  support.draft = '想了解商品'
  assert.equal(support.sendText(), false)
  assert.equal(useLoginPromptStore(pinia).visible, true)
  assert.equal(support.messages.length, 1)
  assert.equal(requests.length, 0)
})
test('text is trimmed and the real incremental answer replaces simulated replies', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.open()
  support.draft = '  户外测量  '
  assert.equal(support.sendText(), true)
  assert.equal(support.draft, '')
  assert.equal(support.isReplying, true)
  await settle(() => requests.length === 1)
  assert.deepEqual(await requests[0].json(), { text: '户外测量' })
  source.push(delta('先看'))
  await settle(() => support.messages.at(-1).text === '先看')
  source.push(delta('精度') + done)
  await settle(() => !support.isReplying)
  assert.equal(support.messages.at(-1).text, '先看精度')
  assert.equal(support.error, '')
})
test('guide and product support have separate drafts, histories and endpoints', async () => {
  const { support } = await mount()
  support.open()
  support.draft = '导购问题'
  support.sendText()
  await settle(() => !support.isReplying)
  support.draft = '导购草稿'
  const guideHistory = support.messages.map((item) => item.text)
  support.open('support')
  assert.equal(support.entry, 'support')
  assert.equal(support.draft, '')
  assert.equal(support.messages.length, 1)
  support.draft = '售后问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(new URL(requests[1].url).pathname, '/api/support/turns/stream')
  support.open()
  assert.equal(support.entry, 'guide')
  assert.equal(support.draft, '导购草稿')
  assert.deepEqual(
    support.messages.map((item) => item.text),
    guideHistory,
  )
})
test('each entry rejects duplicate sends and quick questions while its answer is pending', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '第一条'
  support.sendText()
  support.draft = '第二条'
  assert.equal(support.sendText(), false)
  support.sendQuestion('shipping')
  await settle(() => requests.length === 1)
  assert.equal(support.draft, '第二条')
  assert.equal(support.messages.filter((item) => item.sender === 'visitor').length, 1)
  source.push(delta('回复') + done)
  await settle(() => !support.isReplying)
})
test('empty or oversized text does not send and exactly 500 characters does', async () => {
  const { support } = await mount()
  support.draft = ' \n '
  assert.equal(support.sendText(), false)
  support.draft = '字'.repeat(501)
  assert.equal(support.sendText(), false)
  assert.ok(support.error)
  assert.equal(requests.length, 0)
  support.draft = '字'.repeat(500)
  assert.equal(support.sendText(), true)
  await settle(() => !support.isReplying)
  assert.equal((await requests[0].json()).text.length, 500)
})
test('close preserves a draft and counts one unread answer, not one per delta', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.open()
  support.draft = '问题'
  support.sendText()
  support.draft = '草稿'
  support.close()
  await settle(() => requests.length === 1)
  source.push(delta('一') + delta('二') + done)
  await settle(() => !support.isReplying)
  assert.equal(support.unreadCount, 1)
  assert.equal(support.draft, '草稿')
  support.open()
  assert.equal(support.unreadCount, 0)
  assert.equal(support.messages.at(-1).text, '一二')
})
test('deltas from a hidden entry never append into the visible entry', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '导购问题'
  support.sendText()
  await settle(() => requests.length === 1)
  support.open('support')
  source.push(delta('导购回答') + done)
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  support.open()
  assert.equal(support.messages.at(-1).text, '导购回答')
})
test('clear cancels the current stream and late data cannot restore cleared messages', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '问题'
  support.sendText()
  await settle(() => requests.length === 1)
  support.clearConversation()
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  assert.equal(support.isReplying, false)
  assert.equal(support.error, '')
})
test('logout clears both entries and cancels in-flight replies', async () => {
  const { support, auth } = await mount()
  support.draft = '导购隐私'
  support.sendText()
  await settle(() => !support.isReplying)
  support.open('support')
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '客服隐私'
  support.sendText()
  await settle(() => requests.length === 2)
  auth.logout()
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  assert.equal(support.visible, false)
  support.open()
  assert.equal(support.messages.length, 1)
  assert.equal(support.draft, '')
})
test('account switch discovered on an incoming delta prevents old content leaking', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '旧问题'
  support.sendText()
  await settle(() => requests.length === 1)
  session('other-token', 'customer-2')
  source.push(delta('旧回答'))
  await settle(() => !support.isReplying)
  assert.equal(support.messages.length, 1)
  assert.equal(support.draft, '')
})
test('same-account token renewal keeps history but cancels the old pending turn', async () => {
  const { support, auth } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '问题'
  support.sendText()
  await settle(() => requests.length === 1)
  session('renewed-token')
  auth.getAuthorization()
  await settle(() => source.cancelled)
  assert.equal(support.messages[1].text, '问题')
  assert.equal(support.isReplying, false)
  assert.ok(support.error)
})
test('disconnect preserves a partial answer with a visible error and no automatic retry', async () => {
  const { support } = await mount()
  respond = () => sse(delta('已收到的部分'))
  support.draft = '问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(support.messages.at(-1).text, '已收到的部分')
  assert.ok(support.error)
  assert.equal(requests.length, 1)
})
test('products select guide and orders select support, with context kept out of the request', async () => {
  const { support, pinia } = await mount()
  useCustomerServiceStore(pinia)
  const { useCustomerServiceContext } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceContext.ts',
  )
  const entry = useCustomerServiceContext()
  entry.consultProduct({ id: '9007199254740993123', name: '仪器', model: 'RTK', priceFen: 0 })
  assert.equal(support.entry, 'guide')
  assert.equal(support.pendingContext.name, '仪器')
  assert.equal(requests.length, 0)
  support.draft = '型号怎么选'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.deepEqual(await requests[0].json(), { text: '型号怎么选' })
  assert.equal(new URL(requests[0].url).pathname, '/api/guide/turns/stream')
  entry.consultOrder({
    orderNo: 'JW123',
    status: 'PENDING_PAYMENT',
    paidAmountFen: null,
    payableAmountFen: 100,
    recipient: { name: 'private' },
  })
  assert.equal(support.entry, 'support')
  assert.equal(JSON.stringify(support.pendingContext).includes('private'), false)
})

test('product consultation opens guide without fetching or showing orders', async () => {
  const { support, picker, orderRequests } = await mountOrderPicker()
  const { useCustomerServiceContext } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceContext.ts',
  )
  useCustomerServiceContext().consultProduct({
    id: '23',
    name: '碳纤杆',
    model: '华测',
    priceFen: 13440,
  })
  await new Promise(setImmediate)
  assert.equal(support.entry, 'guide')
  assert.equal(support.pendingContext.id, '23')
  assert.equal(picker.showPicker.value, false)
  assert.equal(orderRequests.length, 0)
})

test('closing clears product context from both entries while preserving drafts and messages', async () => {
  const { support } = await mount()
  support.open('support', {
    kind: 'product',
    id: 'old',
    name: '旧商品',
    model: null,
    priceFen: 100,
  })
  support.draft = '客服草稿'
  support.open('guide', {
    kind: 'product',
    id: '23',
    name: '碳纤杆',
    model: '华测',
    priceFen: 13440,
  })
  support.draft = '导购草稿'
  support.close()
  assert.equal(support.pendingContext, null)
  assert.equal(support.draft, '导购草稿')
  support.open('support')
  assert.equal(support.pendingContext, null)
  assert.equal(support.draft, '客服草稿')
  support.open('guide')
  assert.equal(support.pendingContext, null)
  assert.equal(support.messages.length, 1)
})

test('a generic entry replaces any old product context even if the drawer is already open', async () => {
  const { support } = await mount()
  support.open('guide', { kind: 'product', id: '23', name: '碳纤杆', model: null, priceFen: 13440 })
  support.open('guide')
  assert.equal(support.pendingContext, null)
})
test('quick question keeps the unsent draft and posts only the selected question', async () => {
  const { support } = await mount()
  support.draft = '还在编辑'
  support.sendQuestion('shipping')
  assert.equal(support.draft, '还在编辑')
  await settle(() => !support.isReplying)
  assert.deepEqual(await requests[0].json(), { text: '购买后什么时候发货？' })
})
test('a quick question after an account change never restores the old private draft', async () => {
  const { support } = await mount()
  support.draft = '旧草稿'
  session('other-token', 'customer-2')
  support.sendQuestion('shipping')
  assert.equal(support.draft, '')
  assert.equal(JSON.stringify(support.messages).includes('旧草稿'), false)
})
test('Enter sends once while composition, keyCode 229 and Shift+Enter remain editor input', async () => {
  const { support } = await mount()
  const { useCustomerServiceComposer } = await server.ssrLoadModule(
    '/src/composables/useCustomerServiceComposer.ts',
  )
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
  composer.handleKeydown(event())
  assert.equal(support.messages[1].text, '键盘消息')
  assert.equal(prevented, 1)
  await settle(() => !support.isReplying)
  assert.equal(requests.length, 1)
})

test('idle timeout resets on heartbeats and aborts a stalled stream without retry', async (context) => {
  await mount(true, false)
  context.mock.timers.enable({ apis: ['setTimeout'] })
  const source = controlledStream()
  respond = (request) => source.respond(request)
  const result = stream()
  const rejection = assert.rejects(result, (error) => error.kind === 'timeout')
  await settle(() => requests.length === 1)
  context.mock.timers.tick(50_000)
  source.push(': heartbeat\n\n')
  await new Promise(setImmediate)
  context.mock.timers.tick(59_000)
  assert.equal(requests[0].signal.aborted, false)
  context.mock.timers.tick(1_000)
  await rejection
  assert.equal(requests[0].signal.aborted, true)
  assert.equal(requests.length, 1)
  context.mock.timers.reset()
})

test('a JSON business 401 clears the matching session and prompts login', async () => {
  const { support, auth, pinia } = await mount()
  respond = () => Response.json({ code: 401, message: 'expired', data: null })
  support.draft = '问题'
  support.sendText()
  await settle(() => !auth.isAuthenticated)
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  assert.equal(useLoginPromptStore(pinia).visible, true)
  assert.equal(support.messages.length, 1)
})

test('HTTP 403 shows failure without clearing the login or retrying', async () => {
  const { support, auth } = await mount()
  respond = () => Response.json({ code: 403 }, { status: 403 })
  support.draft = '问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.ok(support.error)
  assert.equal(auth.isAuthenticated, true)
  assert.equal(requests.length, 1)
})

test('clearing support leaves a concurrent guide answer running and isolated', async () => {
  const { support } = await mount()
  const guide = controlledStream(),
    service = controlledStream()
  respond = (request) =>
    request.url.includes('/guide/') ? guide.respond(request) : service.respond(request)
  support.draft = '导购问题'
  support.sendText()
  support.open('support')
  support.draft = '客服问题'
  support.sendText()
  await settle(() => requests.length === 2)
  support.clearConversation()
  await settle(() => service.cancelled)
  assert.equal(guide.cancelled, false)
  guide.push(delta('导购仍然完成') + done)
  await settle(() => guide.cancelled)
  assert.equal(support.messages.length, 1)
  support.open()
  assert.equal(support.messages.at(-1).text, '导购仍然完成')
})

test('clearing all on widget teardown cancels both conversations and removes local context', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.draft = '导购问题'
  support.sendText()
  await settle(() => requests.length === 1)
  support.open('support', { kind: 'product', id: '123', name: '商品', model: null, priceFen: null })
  support.draft = '客服草稿'
  support.clearAllConversations()
  await settle(() => source.cancelled)
  assert.equal(support.messages.length, 1)
  assert.equal(support.pendingContext, null)
  assert.equal(support.draft, '')
  support.open()
  assert.equal(support.messages.length, 1)
  assert.equal(support.isReplying, false)
})

test('HTTP 401 during a store turn still opens login after the auth watcher cancels the stream', async () => {
  const { support, auth, pinia } = await mount()
  respond = () => Response.json({ code: 401 }, { status: 401 })
  support.open()
  support.draft = '问题'
  support.sendText()
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  await settle(() => !support.isReplying)
  assert.equal(auth.isAuthenticated, false)
  assert.equal(useLoginPromptStore(pinia).visible, true)
})

const transferAction = (actionId = 'action-1') =>
  `data: ${JSON.stringify({
    type: 'action',
    payload: { kind: 'transfer_human', label: '转人工', actionId },
  })}\n\n`

test('SSE dispatches structured actions between deltas and stops at done', async () => {
  await mount(true, false)
  respond = () => sse(delta('前') + transferAction() + delta('后') + done + transferAction('late'))
  const events = []
  await stream('support', '问题', {
    onDelta: (text) => events.push(text),
    onAction: (action) => events.push(action),
  })
  assert.deepEqual(events, [
    '前',
    { kind: 'transfer_human', label: '转人工', actionId: 'action-1' },
    '后',
  ])
})

for (const payload of [
  null,
  { kind: 'other', label: '转人工', actionId: 'a' },
  { kind: 'transfer_human', label: '', actionId: 'a' },
  { kind: 'transfer_human', label: '转人工', actionId: ' ' },
  { kind: 'transfer_human', label: '转人工', actionId: 123 },
]) {
  test(`malformed action is a protocol error: ${JSON.stringify(payload)}`, async () => {
    await mount(true, false)
    respond = () => sse(`data: ${JSON.stringify({ type: 'action', payload })}\n\n` + done)
    await assert.rejects(stream('support'), (error) => error.kind === 'protocol')
  })
}

test('action-first reply receives later text without creating another message or unread count', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.open('support')
  support.draft = '需要人工处理'
  support.sendText()
  support.close()
  await settle(() => requests.length === 1)
  source.push(transferAction())
  await settle(() => support.messages.at(-1).actions?.length === 1 || !support.isReplying)
  const reply = support.messages.at(-1)
  assert.equal(reply.sender, 'service')
  assert.equal(reply.text, '')
  assert.equal(reply.actions[0].submission.status, 'idle')
  assert.equal(support.unreadCount, 1)
  source.push(delta('申请入口在下方') + transferAction() + done)
  await settle(() => !support.isReplying)
  assert.equal(support.messages.length, 3)
  assert.equal(support.messages.at(-1).id, reply.id)
  assert.equal(reply.text, '申请入口在下方')
  assert.equal(reply.actions.length, 1)
  assert.equal(support.unreadCount, 1)
  assert.equal(support.error, '')
})

test('action-only replies are valid and a replay in a later turn stays with its original reply', async () => {
  const { support } = await mount()
  support.open('support')
  respond = () => sse(transferAction() + done)
  support.draft = '人工'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(support.error, '')
  const original = support.messages.at(-1)
  assert.equal(original.actions?.length, 1)

  respond = () => sse(delta('新回复') + transferAction() + transferAction('action-2') + done)
  support.draft = '再问一次'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(original.actions[0].actionId, 'action-1')
  assert.deepEqual(
    support.messages.at(-1).actions.map((item) => item.actionId),
    ['action-2'],
  )
})

test('mentioning transfer in text does not create an action', async () => {
  const { support } = await mount()
  support.open('support')
  respond = () => sse(delta('可以转人工') + done)
  support.draft = '问题'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(support.messages.at(-1).text, '可以转人工')
  assert.equal(support.messages.at(-1).actions, undefined)
})

test('an action-only replay does not duplicate a reply or report an empty-answer error', async () => {
  const { support } = await mountTransferAction()
  const originalId = support.messages.at(-1).id
  respond = () => sse(transferAction() + done)
  support.draft = '重复申请'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(support.error, '')
  assert.equal(support.messages.length, 4)
  const actions = support.messages.filter((message) => message.actions?.length)
  assert.equal(actions.length, 1)
  assert.equal(actions[0].id, originalId)
})

test('concurrent guide actions cannot populate support or consume its action ID', async () => {
  const { support } = await mount()
  const guide = controlledStream()
  const service = controlledStream()
  respond = (request) =>
    request.url.includes('/guide/') ? guide.respond(request) : service.respond(request)
  support.draft = '导购问题'
  support.sendText()
  support.open('support')
  support.draft = '客服问题'
  support.sendText()
  await settle(() => requests.length === 2)
  guide.push(transferAction() + delta('导购回答') + done)
  await settle(() => guide.cancelled)
  assert.equal(support.messages.length, 2)
  service.push(delta('客服回答') + transferAction() + done)
  await settle(() => !support.isReplying)
  assert.equal(support.messages.at(-1).actions?.[0].actionId, 'action-1')
  support.open('guide')
  assert.equal(support.messages.at(-1).text, '导购回答')
  assert.equal(support.messages.at(-1).actions, undefined)
})

test('an account switch discovered by an action discards old reply content', async () => {
  const { support } = await mount()
  const source = controlledStream()
  respond = (request) => source.respond(request)
  support.open('support')
  support.draft = '旧问题'
  support.sendText()
  await settle(() => requests.length === 1)
  session('other-token', 'customer-2')
  source.push(transferAction() + delta('旧回答'))
  await settle(() => !support.isReplying)
  assert.equal(support.messages.length, 1)
  assert.equal(support.error, '')
  assert.equal(support.messages[0].actions, undefined)
})

const demoMessage = '人工服务申请已记录。本项目为演示系统，暂无真人接待。'
const ticketResponse = (ticketNo = '9223372036854775807') =>
  Response.json({ code: 200, message: 'OK', data: { ticketNo, message: demoMessage } })

async function mountTransferAction(ticketRespond = () => ticketResponse()) {
  const mounted = await mount()
  mounted.support.open('support')
  respond = (request) =>
    new URL(request.url).pathname === '/api/support/tickets'
      ? ticketRespond(request)
      : sse(delta('申请入口') + transferAction() + done)
  mounted.support.draft = '请人工处理'
  mounted.support.sendText()
  await settle(() => !mounted.support.isReplying)
  const reply = mounted.support.messages.at(-1)
  const action = reply.actions?.[0]
  assert.ok(action, 'Expected the action on its support reply')
  return { ...mounted, action, reply }
}

for (const question of ['我要投诉', '我要转人工']) {
  test(`${question}: action receipt alone never creates a ticket`, async () => {
    const { support } = await mount()
    support.open('support')
    respond = () => sse(delta('申请入口') + transferAction() + done)
    support.draft = question
    support.sendText()
    await settle(() => !support.isReplying)
    assert.equal(support.messages.at(-1).actions[0].kind, 'transfer_human')
    assert.equal(support.messages.at(-1).actions.length, 1)
    assert.equal(requests.length, 1)
  })
}

test('ticket click POSTs only the original actionId with auth and a local 130-second timeout', async (context) => {
  const { support, action } = await mountTransferAction()
  const configs = []
  const interceptor = http.interceptors.request.use((config) => {
    if (config.url === '/api/support/tickets') configs.push(config)
    return config
  })
  context.after(() => http.interceptors.request.eject(interceptor))
  assert.equal(requests.length, 1)
  assert.equal(http.defaults.timeout, 10_000)
  assert.equal(await support.submitTransferHuman('action-1'), true)
  assert.equal(requests.length, 2)
  const request = requests[1]
  assert.equal(new URL(request.url).pathname, '/api/support/tickets')
  assert.equal(request.method, 'POST')
  assert.deepEqual(await request.json(), { actionId: 'action-1' })
  assert.equal(request.headers.get('Authorization'), 'Bearer customer-token')
  assert.equal(request.headers.get('Content-Type'), 'application/json')
  assert.equal(configs[0].timeout, 130_000)
  assert.equal(configs[0].expectedAuthorization, 'Bearer customer-token')
  assert.equal(configs[0].signal.aborted, false)
  assert.equal(http.defaults.timeout, 10_000)
  assert.deepEqual(action.submission, {
    status: 'submitted',
    ticketNo: '9223372036854775807',
    message: demoMessage,
  })
})

test('action-first submission is blocked until its own reply receives done', async () => {
  const { support } = await mount()
  support.open('support')
  const source = controlledStream()
  respond = (request) =>
    new URL(request.url).pathname === '/api/support/tickets'
      ? ticketResponse()
      : source.respond(request)
  support.draft = '人工'
  support.sendText()
  await settle(() => requests.length === 1)
  source.push(transferAction())
  await settle(() => support.messages.at(-1).actions?.length === 1 || !support.isReplying)
  const reply = support.messages.at(-1)
  assert.equal(reply.replyStatus, 'streaming')
  assert.equal(await support.submitTransferHuman('action-1'), false)
  assert.equal(requests.length, 1)
  source.push(delta('稍后出现的文字') + done)
  await settle(() => !support.isReplying)
  assert.equal(reply.replyStatus, 'done')
  assert.equal(await support.submitTransferHuman('action-1'), true)
  assert.equal(requests.length, 2)
})

for (const ending of ['error', 'EOF', 'token']) {
  test(`${ending} leaves a partial reply ineligible for ticket submission`, async () => {
    const { support, auth } = await mount()
    support.open('support')
    const source = controlledStream()
    respond = (request) => source.respond(request)
    support.draft = '人工'
    support.sendText()
    await settle(() => requests.length === 1)
    source.push(transferAction())
    await settle(() => support.messages.at(-1).actions?.length === 1 || !support.isReplying)
    const reply = support.messages.at(-1)
    if (ending === 'error') source.push('data: {"type":"error"}\n\n')
    if (ending === 'EOF') source.end()
    if (ending === 'token') {
      session('renewed-token')
      auth.getAuthorization()
    }
    await settle(() => !support.isReplying)
    assert.equal(reply.replyStatus, 'interrupted')
    assert.equal(await support.submitTransferHuman('action-1'), false)
    assert.equal(requests.length, 1)
  })
}

test('a completed old reply remains eligible while another reply is streaming', async () => {
  const { support, reply, action } = await mountTransferAction()
  const nextSource = controlledStream()
  respond = (request) =>
    new URL(request.url).pathname === '/api/support/tickets'
      ? ticketResponse()
      : nextSource.respond(request)
  support.draft = '后来的问题'
  support.sendText()
  await settle(() => requests.length === 2)
  assert.equal(support.isReplying, true)
  assert.equal(reply.replyStatus, 'done')
  assert.equal(await support.submitTransferHuman('action-1'), true)
  assert.equal(action.submission.status, 'submitted')
  assert.equal(support.isReplying, true)
})

test('pending and submitted tickets block repeat clicks and unknown action IDs', async () => {
  let finish
  const { support, action } = await mountTransferAction(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  assert.equal(await support.submitTransferHuman('unknown'), false)
  const pending = support.submitTransferHuman('action-1')
  assert.equal(action.submission.status, 'submitting')
  assert.equal(await support.submitTransferHuman('action-1'), false)
  await settle(() => finish)
  assert.equal(requests.length, 2)
  finish(ticketResponse())
  assert.equal(await pending, true)
  assert.equal(action.submission.status, 'submitted')
  assert.equal(await support.submitTransferHuman('action-1'), false)
  assert.equal(requests.length, 2)
})

test('submission preserves the original opaque action ID without trimming or adding fields', async () => {
  const { support } = await mount()
  const actionId = '  backend-action-原始标识  '
  respond = (request) =>
    new URL(request.url).pathname === '/api/support/tickets'
      ? ticketResponse()
      : sse(transferAction(actionId) + done)
  support.open('support')
  support.draft = '人工处理'
  support.sendText()
  await settle(() => !support.isReplying)
  assert.equal(await support.submitTransferHuman(actionId), true)
  assert.deepEqual(await requests[1].json(), { actionId: '  backend-action-原始标识  ' })
})

for (const status of ['submitted', 'expired']) {
  test(`replayed action events preserve a ${status} button and never allow resubmission`, async () => {
    const { support, action } = await mountTransferAction(() =>
      status === 'expired' ? new Response('', { status: 410 }) : ticketResponse(),
    )
    await support.submitTransferHuman('action-1')
    assert.equal(action.submission.status, status)
    const snapshot = JSON.stringify(action.submission)
    support.draft = '后来的消息'
    support.sendText()
    await settle(() => !support.isReplying)
    assert.equal(JSON.stringify(action.submission), snapshot)
    assert.equal(support.messages.filter((message) => message.actions?.length).length, 1)
    assert.equal(await support.submitTransferHuman('action-1'), false)
    assert.equal(requests.length, 3)
  })
}

test('503 failure hides upstream details and retries the same action ID', async () => {
  let calls = 0
  const { support, action } = await mountTransferAction(() => {
    calls++
    return calls === 1
      ? new Response('private upstream traceback', { status: 503 })
      : ticketResponse('000123')
  })
  assert.equal(await support.submitTransferHuman('action-1'), false)
  assert.equal(action.submission.status, 'failed')
  assert.equal(action.submission.error.includes('private'), false)
  assert.equal(action.submission.ticketNo, undefined)
  assert.equal(await support.submitTransferHuman('action-1'), true)
  assert.equal(action.submission.ticketNo, '000123')
  assert.deepEqual(await requests[1].json(), { actionId: 'action-1' })
  assert.deepEqual(await requests[2].json(), { actionId: 'action-1' })
})

test('network failure stays unconfirmed and can retry the same action', async () => {
  let calls = 0
  const { support, action } = await mountTransferAction(() => {
    if (++calls === 1) throw new TypeError('private network internals')
    return ticketResponse()
  })
  assert.equal(await support.submitTransferHuman('action-1'), false)
  assert.equal(action.submission.status, 'failed')
  assert.equal(action.submission.error.includes('private'), false)
  assert.equal(await support.submitTransferHuman('action-1'), true)
  assert.deepEqual(await requests[2].json(), { actionId: 'action-1' })
})

test('130-second timeout leaves outcome unconfirmed and retry retains its action ID', async (context) => {
  let calls = 0
  const { support, action } = await mountTransferAction((request) => {
    if (++calls > 1) return ticketResponse()
    return new Promise((_resolve, reject) => {
      request.signal.addEventListener('abort', () => reject(request.signal.reason), { once: true })
    })
  })
  context.mock.timers.enable({ apis: ['setTimeout'] })
  try {
    const pending = support.submitTransferHuman('action-1')
    await settle(() => requests.length === 2)
    context.mock.timers.tick(129_999)
    assert.equal(action.submission.status, 'submitting')
    context.mock.timers.tick(1)
    assert.equal(await pending, false)
    assert.equal(action.submission.status, 'failed')
    assert.match(action.submission.error, /超时/)
    assert.equal(await support.submitTransferHuman('action-1'), true)
    assert.deepEqual(await requests[2].json(), { actionId: 'action-1' })
  } finally {
    // Restore real clearTimeout before afterEach disposes the real auth expiry timer.
    context.mock.timers.reset()
  }
})

for (const body of [
  { code: 200, data: { ticketNo: 123, message: demoMessage } },
  { code: 200, data: { ticketNo: null, message: demoMessage } },
  { code: 200, data: { ticketNo: '', message: demoMessage } },
  { code: 200, data: { ticketNo: ' ', message: demoMessage } },
  { code: 200, data: { ticketNo: '123' } },
  { code: 200, data: { ticketNo: '123', message: '' } },
  { code: 200, data: null },
  { code: 500, message: 'private business error', data: { ticketNo: '123', message: demoMessage } },
  { code: '200', data: { ticketNo: '123', message: demoMessage } },
]) {
  test(`invalid ticket response never claims submission: ${JSON.stringify(body)}`, async () => {
    const { support, action } = await mountTransferAction(() => Response.json(body))
    assert.equal(await support.submitTransferHuman('action-1'), false)
    assert.equal(action.submission.status, 'failed')
    assert.equal(action.submission.ticketNo, undefined)
    assert.equal(action.submission.error.includes('private'), false)
  })
}

for (const transport of ['HTTP', 'business']) {
  test(`${transport} 410 expires the action without another request on retry`, async () => {
    const { support, action } = await mountTransferAction(() =>
      transport === 'HTTP'
        ? new Response('private expired details', { status: 410 })
        : Response.json({ code: 410, message: 'private expired details' }),
    )
    assert.equal(await support.submitTransferHuman('action-1'), false)
    assert.equal(action.submission.status, 'expired')
    assert.match(action.submission.error, /重新提出人工服务请求/)
    assert.equal(action.submission.error.includes('private'), false)
    assert.equal(await support.submitTransferHuman('action-1'), false)
    assert.equal(requests.length, 2)
  })
  for (const status of [401, 403]) {
    test(`${transport} ${status} uses existing login and permission handling`, async () => {
      const { support, action, auth, pinia } = await mountTransferAction(() =>
        Response.json(
          { code: status, message: 'private auth details' },
          { status: transport === 'HTTP' ? status : 200 },
        ),
      )
      assert.equal(await support.submitTransferHuman('action-1'), false)
      const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
      if (status === 401) {
        assert.equal(auth.isAuthenticated, false)
        assert.equal(useLoginPromptStore(pinia).visible, true)
        assert.equal(support.messages.length, 1)
      } else {
        assert.equal(auth.isAuthenticated, true)
        assert.equal(action.submission.status, 'failed')
        assert.match(action.submission.error, /无权/)
      }
      assert.equal(action.submission.error?.includes('private'), false)
    })
  }
}

for (const change of ['clear', 'clearAll', 'logout', 'account', 'token', 'dispose']) {
  test(`${change} cancels submission and late results cannot update the conversation`, async () => {
    let finish
    const { support, auth, action } = await mountTransferAction(
      () =>
        new Promise((resolve) => {
          finish = resolve
        }),
    )
    const pending = support.submitTransferHuman('action-1')
    await settle(() => finish)
    const signal = requests[1].signal
    if (change === 'clear') support.clearConversation()
    if (change === 'clearAll') support.clearAllConversations()
    if (change === 'logout') auth.logout()
    if (change === 'dispose') support.$dispose()
    if (change === 'account' || change === 'token') {
      session('next-token', change === 'account' ? 'customer-2' : 'customer-1')
      auth.getAuthorization()
    }
    assert.equal(signal.aborted, true)
    const snapshot = JSON.stringify(support.messages)
    finish(ticketResponse('old-ticket'))
    assert.equal(await pending, false)
    assert.equal(JSON.stringify(support.messages), snapshot)
    assert.notEqual(action.submission.status, 'submitted')
    if (change === 'token') assert.equal(action.submission.status, 'failed')
  })
}

test('clearing guide leaves a pending support submission running', async () => {
  let finish
  const { support, action } = await mountTransferAction(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = support.submitTransferHuman('action-1')
  await settle(() => finish)
  support.open('guide')
  assert.equal(await support.submitTransferHuman('action-1'), false)
  support.clearConversation()
  assert.equal(requests[1].signal.aborted, false)
  finish(ticketResponse('support-ticket'))
  assert.equal(await pending, true)
  support.open('support')
  assert.equal(action.submission.ticketNo, 'support-ticket')
})

test('a cleared reply cannot update or release a newer submission with the same action ID', async () => {
  const completions = []
  const { support, action: oldAction } = await mountTransferAction(
    () => new Promise((resolve) => completions.push(resolve)),
  )
  const oldPending = support.submitTransferHuman('action-1')
  await settle(() => completions.length === 1)
  support.clearConversation()
  support.draft = '新会话问题'
  support.sendText()
  await settle(() => !support.isReplying)
  const newAction = support.messages.at(-1).actions[0]
  const newPending = support.submitTransferHuman('action-1')
  await settle(() => completions.length === 2)
  assert.equal(requests[1].signal.aborted, true)
  assert.equal(requests[3].signal.aborted, false)
  completions[0](ticketResponse('old-ticket'))
  assert.equal(await oldPending, false)
  assert.equal(newAction.submission.status, 'submitting')
  assert.equal(await support.submitTransferHuman('action-1'), false)
  completions[1](ticketResponse('new-ticket'))
  assert.equal(await newPending, true)
  assert.equal(newAction.submission.ticketNo, 'new-ticket')
  assert.notEqual(oldAction.submission.status, 'submitted')
})

test('a submission completion itself discovers an account switch and discards its result', async () => {
  let finish
  const { support, auth } = await mountTransferAction(
    () =>
      new Promise((resolve) => {
        finish = resolve
      }),
  )
  const pending = support.submitTransferHuman('action-1')
  await settle(() => finish)
  session('other-token', 'customer-2')
  finish(ticketResponse('old-ticket'))
  assert.equal(await pending, false)
  assert.equal(support.messages.length, 1)
  assert.equal(support.messages[0].actions, undefined)
  assert.equal(auth.user.id, 'customer-2')
})

test('switching account before dispatch never sends the old ticket request', async () => {
  const { support, auth } = await mountTransferAction()
  const pending = support.submitTransferHuman('action-1')
  session('other-token', 'customer-2')
  auth.getAuthorization()
  assert.equal(await pending, false)
  assert.equal(requests.length, 1)
})

for (const change of ['clear', 'logout', 'account']) {
  test(`a buffered action cannot reappear after ${change} and a new support turn`, async () => {
    const { support, auth } = await mount()
    const oldSource = controlledStream()
    respond = (request) => oldSource.respond(request)
    support.open('support')
    support.draft = '旧问题'
    support.sendText()
    await settle(() => requests.length === 1)
    oldSource.push(transferAction('old-action') + delta('旧回答') + done)
    if (change === 'clear') support.clearConversation()
    if (change === 'logout') {
      auth.logout()
      session('next-token', 'customer-1')
    }
    if (change === 'account') session('next-token', 'customer-2')
    support.open('support')
    respond = () => sse(transferAction('new-action') + delta('新回答') + done)
    support.draft = '新问题'
    support.sendText()
    await settle(() => !support.isReplying)
    assert.equal(support.messages.length, 3)
    assert.equal(support.messages.at(-1).text, '新回答')
    assert.equal(support.messages.at(-1).actions[0].actionId, 'new-action')
    assert.equal(JSON.stringify(support.messages).includes('旧回答'), false)
    assert.equal(JSON.stringify(support.messages).includes('old-action'), false)
  })
}
