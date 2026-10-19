import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { createRenderer, ref } from 'vue'
import { AxiosError } from 'axios'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

let server, http, configureAuth, createPinia, useAuthStore, useCheckoutPayment, fixture
const entries = new Map()
const requests = []
const item = (overrides = {}) => ({
  cartItemId: '101',
  productId: '9007199254740993123',
  name: '接收机',
  model: null,
  coverUrl: null,
  price: 1000,
  quantity: 2,
  stock: 8,
  availability: 'AVAILABLE',
  ...overrides,
})
const selection = () => [
  { ...item(), priceFen: 1000 },
  { ...item({ cartItemId: '102', productId: '43', quantity: 1 }), priceFen: 1000 },
]
const reply = (config, items) => ({
  config,
  status: 200,
  statusText: 'OK',
  headers: {},
  data: { code: 200, data: { items } },
})
const flush = () => new Promise((resolve) => setImmediate(resolve))
function saveSession(token = 'checkout-token') {
  entries.set(
    'nesmartmall.auth',
    JSON.stringify({
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
      user: { id: token, account: token, nickname: '测试用户', role: 1 },
    }),
  )
}
before(async () => {
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/cart' },
  })
  server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  try {
    ;({ useCheckoutPayment } = await server.ssrLoadModule('/src/composables/useCheckoutPayment.ts'))
  } catch (error) {
    if (error.code !== 'ERR_LOAD_URL') throw error
  }
})
beforeEach(() => {
  entries.clear()
  requests.length = 0
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(config, [
      item({ price: 1999 }),
      item({ cartItemId: '102', productId: '43', price: 0, quantity: 1 }),
      item({ cartItemId: '103', productId: '44', price: 999999 }),
    ])
  }
})
afterEach(() => {
  fixture?.app.unmount()
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
async function mount(authenticated = true) {
  assert.equal(typeof useCheckoutPayment, 'function', 'checkout requires a price-confirmation flow')
  if (authenticated) saveSession()
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  const visible = ref(true)
  const selected = ref(selection())
  let payment
  const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = renderer.createApp({
    setup() {
      payment = useCheckoutPayment(visible, () => selected.value)
      return () => null
    },
  })
  app.use(pinia)
  app.mount({})
  fixture = { app, auth }
  return { app, auth, visible, selected, payment }
}

test('simulation queries fresh backend prices for selected rows and requires explicit confirmation', async () => {
  const { payment, selected } = await mount()
  payment.confirm()
  assert.equal(payment.paid.value, false)
  await payment.requestConfirmation()
  assert.equal(payment.confirmVisible.value, true)
  assert.equal(payment.totalFen.value, 3998)
  assert.deepEqual(
    payment.quoteItems.value.map((i) => i.priceFen),
    [1999, 0],
  )
  assert.equal(payment.paid.value, false)
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'get')
  assert.equal(requests[0].url, '/api/cart')
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer checkout-token')
  payment.confirm()
  payment.confirm()
  assert.equal(payment.paid.value, true)
  assert.equal(payment.confirmVisible.value, false)
  assert.equal(requests.length, 1)
  assert.equal(selected.value.length, 2)
})

test('cancel returns unpaid and a second attempt queries again rather than trusting the previous price', async () => {
  const { payment } = await mount()
  await payment.requestConfirmation()
  payment.cancel()
  payment.confirm()
  assert.equal(payment.paid.value, false)
  assert.equal(payment.confirmVisible.value, false)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(config, [
      item({ price: 2500 }),
      item({ cartItemId: '102', productId: '43', price: 100, quantity: 1 }),
    ])
  }
  await payment.requestConfirmation()
  assert.equal(payment.totalFen.value, 5100)
  assert.equal(requests.length, 2)
})

test('pending price lookup blocks duplicate queries and early payment', async () => {
  const { payment } = await mount()
  let release
  http.defaults.adapter = (config) => {
    requests.push(config)
    return new Promise((resolve) => {
      release = () => resolve(reply(config, selection()))
    })
  }
  const pending = payment.requestConfirmation()
  await flush()
  assert.equal(payment.loading.value, true)
  payment.confirm()
  await payment.requestConfirmation()
  assert.equal(payment.paid.value, false)
  assert.equal(payment.totalFen.value, null)
  assert.equal(requests.length, 1)
  release()
  await pending
  assert.equal(payment.loading.value, false)
})

for (const invalid of [
  [],
  [item({ price: null })],
  [item({ availability: 'OFF_SHELF' })],
  [item({ stock: 1 })],
  [item({ quantity: 1 })],
  [item({ price: Number.MAX_SAFE_INTEGER })],
]) {
  test(`unconfirmed goods cannot simulate payment: ${JSON.stringify(invalid)}`, async () => {
    const { payment } = await mount()
    http.defaults.adapter = async (config) =>
      reply(config, [...invalid, item({ cartItemId: '102', productId: '43', quantity: 1 })])
    await payment.requestConfirmation()
    payment.confirm()
    assert.equal(payment.paid.value, false)
    assert.equal(payment.totalFen.value, null)
    assert.ok(payment.error.value)
  })
}

test('zero total is payable and a closed receipt resets simulation success', async () => {
  const { payment, visible } = await mount()
  http.defaults.adapter = async (config) =>
    reply(
      config,
      selection().map((i) => ({ ...i, price: 0 })),
    )
  await payment.requestConfirmation()
  assert.equal(payment.totalFen.value, 0)
  payment.confirm()
  assert.equal(payment.paid.value, true)
  visible.value = false
  visible.value = true
  assert.equal(payment.paid.value, false)
  assert.equal(payment.totalFen.value, null)
})

test('network failure stays unpaid and permits an explicit retry', async () => {
  const { payment } = await mount()
  const adapter = http.defaults.adapter
  http.defaults.adapter = async () => {
    throw new AxiosError('offline', 'ERR_NETWORK')
  }
  await payment.requestConfirmation()
  payment.confirm()
  assert.equal(payment.paid.value, false)
  assert.ok(payment.error.value)
  http.defaults.adapter = adapter
  await payment.requestConfirmation()
  assert.equal(payment.error.value, '')
  assert.equal(payment.totalFen.value, 3998)
})

for (const change of ['cancel', 'close', 'selection', 'logout', 'account', 'unmount']) {
  test(`${change} aborts lookup and ignores its late response`, async () => {
    const { app, auth, payment, visible, selected } = await mount()
    let release, signal
    http.defaults.adapter = (config) => {
      signal = config.signal
      return new Promise((resolve) => {
        release = () => resolve(reply(config, selection()))
      })
    }
    const pending = payment.requestConfirmation()
    await flush()
    if (change === 'cancel') payment.cancel()
    if (change === 'close') visible.value = false
    if (change === 'selection') selected.value[0].quantity = 3
    if (change === 'logout') auth.logout()
    if (change === 'account') {
      saveSession('another-token')
      auth.getAuthorization()
    }
    if (change === 'unmount') app.unmount()
    assert.equal(signal.aborted, true)
    release()
    await pending
    payment.confirm()
    assert.equal(payment.confirmVisible.value, false)
    assert.equal(payment.totalFen.value, null)
    assert.equal(payment.paid.value, false)
    assert.equal(payment.error.value, '')
  })
}

test('anonymous users cannot query a price or confirm payment', async () => {
  const { payment } = await mount(false)
  await payment.requestConfirmation()
  payment.confirm()
  assert.equal(requests.length, 0)
  assert.equal(payment.paid.value, false)
})

test('receipt preserves success when the confirmation dialog emits false after its closing transition', async () => {
  saveSession()
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  const source = await readFile(
    new URL('../src/components/storefront/CheckoutReceipt.vue', import.meta.url),
    'utf8',
  )
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, {
    id: 'checkout-lifecycle',
    inlineTemplate: true,
    genDefaultAs: 'Receipt',
  })
  const { outputText } = ts.transpileModule(compiled.content, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS },
  })
  let payment, tree
  const modules = {
    vue: await import('vue'),
    'element-plus': await import('element-plus'),
    '@/utils/price': await server.ssrLoadModule('/src/utils/price.ts'),
    '@/utils/cart': await server.ssrLoadModule('/src/utils/cart.ts'),
    '@/composables/useCheckoutPayment': {
      useCheckoutPayment(...args) {
        payment = useCheckoutPayment(...args)
        return payment
      },
    },
  }
  const component = new Function('require', 'exports', `${outputText}\nreturn Receipt`)(
    (name) => modules[name],
    {},
  )
  const renderer = createRenderer({
    createComment: () => ({}),
    insert() {},
    remove() {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  // Render the real SFC template to VNodes without mounting browser-only dialogs.
  // Element Plus emits this update after any closing transition, including a programmatic close.
  const app = renderer.createApp(
    {
      props: component.props,
      setup(props, context) {
        const render = component.setup(props, context)
        return () => {
          tree = render({}, [])
          return null
        }
      },
    },
    {
      modelValue: true,
      items: selection(),
      totalFen: 3000,
      quantity: 3,
      'onUpdate:modelValue': () => {},
    },
  )
  app.use(pinia)
  fixture = { app, auth }
  app.mount({})
  await payment.requestConfirmation()
  payment.confirm()
  await flush()
  assert.equal(tree.children[0].props.title, '模拟支付成功')
  tree.children[1].props['onUpdate:modelValue'](false)
  await flush()
  assert.equal(tree.children[0].props.title, '模拟支付成功')
  assert.equal(payment.totalFen.value, 3998)
})
