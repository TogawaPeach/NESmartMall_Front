import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'
import { createRenderer } from 'vue'

let server, http, configureAuth, createPinia, useAuthStore, fixture
const entries = new Map()
const requests = []
const user = { id: 'cart-user', account: 'cart-user', nickname: '测试用户', role: 1 }
const item = (overrides = {}) => ({
  cartItemId: '101',
  productId: '9007199254740993123',
  name: 'GNSS 接收机',
  model: 'RTK-01',
  coverUrl: null,
  price: 129900,
  quantity: 2,
  stock: 8,
  availability: 'AVAILABLE',
  ...overrides,
})
const body = (items = [item()]) => ({ code: 200, message: 'OK', data: { items } })
const reply = (config, data, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config,
})
const flush = () => new Promise((resolve) => setImmediate(resolve))

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
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
})
beforeEach(() => {
  entries.clear()
  requests.length = 0
  configureAuth({ getAuthorization: () => 'Bearer cart-token', logout: () => {} })
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(config, body())
  }
})
afterEach(() => {
  fixture?.app?.unmount()
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
async function query() {
  const { queryCart } = await server.ssrLoadModule('/src/api/cart.ts')
  return queryCart()
}
function respond(data) {
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(config, data)
  }
}
function saveSession(token = 'cart-token') {
  entries.set(
    'nesmartmall.auth',
    JSON.stringify({
      accessToken: token,
      tokenType: 'Bearer',
      expiresAt: Date.now() + 3600_000,
      user: { ...user, id: token },
    }),
  )
}
async function mount({ authenticated = true, adapter } = {}) {
  if (authenticated) saveSession()
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  fixture = { auth }
  configureAuth(auth)
  if (adapter)
    http.defaults.adapter = async (config) => {
      requests.push(config)
      return adapter(config)
    }
  const { useCart } = await server.ssrLoadModule('/src/composables/useCart.ts')
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let cart
  const app = renderer.createApp({
    setup() {
      cart = useCart()
      return () => null
    },
  })
  app.use(pinia)
  fixture = { app, auth }
  app.mount({})
  await flush()
  return { ...fixture, cart }
}

test('cart uses one aggregate GET with Bearer, no user identity, and preserves large string IDs', async () => {
  const items = await query()
  assert.equal(items[0].productId, '9007199254740993123')
  assert.equal(items[0].priceFen, 129900)
  assert.deepEqual(
    requests.map((r) => [r.method, r.url, r.params, r.data]),
    [['get', '/api/cart', undefined, undefined]],
  )
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer cart-token')
  assert.equal(requests[0].headers.has('user-info'), false)
})

test('only an explicit empty array becomes an empty cart; malformed data fails', async () => {
  respond(body([]))
  assert.deepEqual(await query(), [])
  for (const data of [
    null,
    {},
    { code: 200 },
    { code: 200, data: {} },
    { code: 200, data: { items: null } },
    body([item({ price: 1.1 })]),
    body([item({ quantity: 0 })]),
    body([item({ stock: -1 })]),
    body([item({ availability: 'OTHER' })]),
    body([item({ productId: 9007199254740992 })]),
    body([item(), item()]),
    body([item({ coverUrl: 'javascript:alert(1)' })]),
    body([item({ name: null })]),
  ]) {
    respond(data)
    await assert.rejects(query(), { name: 'CartResponseError' })
  }
})

test('nullable fields and unavailable records remain distinct from zero prices and stock', async () => {
  respond(
    body([
      item({ price: 0, stock: 0, availability: 'OUT_OF_STOCK' }),
      item({
        cartItemId: '102',
        name: null,
        model: null,
        price: null,
        stock: null,
        availability: 'DELETED',
      }),
    ]),
  )
  const items = await query()
  assert.equal(items[0].priceFen, 0)
  assert.equal(items[0].stock, 0)
  assert.equal(items[1].priceFen, null)
  assert.equal(items[1].name, null)
})

test('selection totals use integer fen, support deselection and exclude unavailable items', async () => {
  const { cart } = await mount({
    adapter: async (config) =>
      reply(
        config,
        body([
          item(),
          item({ cartItemId: '102', price: 1, quantity: 3 }),
          item({ cartItemId: '103', price: 0, quantity: 1 }),
          ...['OUT_OF_STOCK', 'OFF_SHELF', 'DELETED'].map((availability, index) =>
            item({ cartItemId: String(104 + index), availability }),
          ),
          item({ cartItemId: '107', quantity: 9 }),
          item({ cartItemId: '108', price: null }),
          item({ cartItemId: '109', stock: null }),
          item({ cartItemId: '110', price: Number.MAX_SAFE_INTEGER }),
        ]),
      ),
  })
  assert.equal(cart.totalFen.value, 0)
  cart.setSelected('101', true)
  assert.equal(cart.totalFen.value, 259800)
  assert.equal(cart.partiallySelected.value, true)
  cart.setSelected('104', true)
  assert.equal(cart.selectedCount.value, 1)
  cart.selectAll(true)
  assert.equal(cart.allSelected.value, true)
  assert.equal(cart.selectedCount.value, 3)
  assert.equal(cart.selectedQuantity.value, 6)
  assert.equal(cart.totalFen.value, 259803)
  cart.setSelected('101', false)
  assert.equal(cart.totalFen.value, 3)
  cart.selectAll(false)
  assert.equal(cart.totalFen.value, 0)
})

test('combined amount overflow is reported without rounding or displaying zero', async () => {
  const { cart } = await mount({
    adapter: async (config) =>
      reply(
        config,
        body([
          item({ price: Number.MAX_SAFE_INTEGER, quantity: 1 }),
          item({ cartItemId: '102', price: 1, quantity: 1 }),
        ]),
      ),
  })
  cart.selectAll(true)
  assert.equal(cart.totalFen.value, null)
})

test('anonymous cart sends no requests, and successful login loads once', async () => {
  const { cart, auth } = await mount({ authenticated: false })
  assert.equal(cart.state.value, 'login-required')
  assert.equal(requests.length, 0)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(
      config,
      config.url === '/api/auth/login'
        ? {
            code: 200,
            data: { accessToken: 'cart-token', tokenType: 'Bearer', expiresIn: 3600, user },
          }
        : body(),
    )
  }
  await auth.signIn({ account: 'cart-user', password: 'test-only' })
  await flush()
  assert.equal(cart.state.value, 'success')
  assert.equal(requests.filter((r) => r.url === '/api/cart').length, 1)
  cart.selectAll(true)
  auth.logout()
  assert.deepEqual(cart.items.value, [])
  assert.equal(cart.selectedCount.value, 0)
  assert.equal(cart.state.value, 'login-required')
})

for (const transport of ['business', 'http']) {
  for (const [status, state] of [
    [401, 'login-required'],
    [403, 'forbidden'],
    [404, 'unavailable'],
    [500, 'error'],
  ]) {
    test(`${transport} ${status} shows ${state} without fake items or unnecessary logout`, async () => {
      const { cart, auth } = await mount({
        adapter: async (config) => {
          if (transport === 'http')
            throw new AxiosError(
              'request failed',
              'ERR_BAD_RESPONSE',
              config,
              null,
              reply(config, { code: 200 }, status),
            )
          return reply(config, { code: status })
        },
      })
      assert.equal(cart.state.value, state)
      assert.deepEqual(cart.items.value, [])
      assert.equal(auth.accessToken, status === 401 ? null : 'cart-token')
    })
  }
}

test('refresh clears selection, prevents concurrent duplicates, and recovers failures', async () => {
  let release
  const { cart } = await mount()
  cart.selectAll(true)
  http.defaults.adapter = (config) => {
    requests.push(config)
    return new Promise((resolve) => {
      release = () => resolve(reply(config, body([])))
    })
  }
  const pending = cart.retry()
  assert.equal(cart.state.value, 'loading')
  assert.equal(cart.selectedCount.value, 0)
  await cart.retry()
  await flush()
  assert.equal(requests.length, 2)
  release()
  await pending
  assert.equal(cart.state.value, 'empty')
  respond({ code: 500 })
  await cart.retry()
  assert.equal(cart.state.value, 'error')
  respond(body())
  await cart.retry()
  assert.equal(cart.state.value, 'success')
})

test('cross-tab account changes clear data synchronously and ignore late old responses and 401s', async () => {
  let release, oldSignal
  const { cart, auth } = await mount()
  cart.selectAll(true)
  http.defaults.adapter = (config) => {
    requests.push(config)
    if (config.headers.get('Authorization') === 'Bearer new-cart-token')
      return Promise.resolve(reply(config, body([item({ name: '新账号商品' })])))
    oldSignal = config.signal
    return new Promise((_resolve, reject) => {
      release = () =>
        reject(
          new AxiosError(
            'old 401',
            'ERR_BAD_RESPONSE',
            config,
            null,
            reply(config, { code: 401 }, 401),
          ),
        )
    })
  }
  const pending = cart.retry()
  await flush()
  saveSession('new-cart-token')
  auth.getAuthorization()
  assert.deepEqual(cart.items.value, [])
  assert.equal(cart.selectedCount.value, 0)
  assert.equal(oldSignal.aborted, true)
  await flush()
  assert.equal(cart.items.value[0].name, '新账号商品')
  release()
  await pending
  assert.equal(auth.accessToken, 'new-cart-token')
  assert.equal(cart.items.value[0].name, '新账号商品')
})

test('unmount aborts pending loads and late results cannot repopulate the page', async () => {
  let release, signal
  const { cart, app } = await mount({
    adapter: (config) => {
      signal = config.signal
      return new Promise((resolve) => {
        release = () => resolve(reply(config, body()))
      })
    },
  })
  app.unmount()
  fixture.app = undefined
  assert.equal(signal.aborted, true)
  release()
  await flush()
  assert.deepEqual(cart.items.value, [])
})

test('explicit dev middleware scopes mock replies to cart GET and distinguishes failures', async () => {
  const { cartMockPlugin } = await server.ssrLoadModule('/dev/cartMock.ts')
  for (const [scenario, authorization, expectedStatus, expectedItems] of [
    ['normal', 'Bearer test-only', 200, 3],
    ['mixed', 'Bearer test-only', 200, 9],
    ['empty', 'Bearer test-only', 200, 0],
    ['normal', undefined, 401, undefined],
    ['forbidden', 'Bearer test-only', 403, undefined],
    ['unavailable', 'Bearer test-only', 404, undefined],
    ['error', 'Bearer test-only', 500, undefined],
    ['malformed', 'Bearer test-only', 200, undefined],
  ]) {
    let handler,
      result,
      nextCalls = 0
    const plugin = cartMockPlugin(scenario)
    assert.equal(plugin.apply, 'serve')
    plugin.configureServer({
      middlewares: {
        use(fn) {
          handler = fn
        },
      },
    })
    const response = {
      setHeader() {},
      end(raw) {
        result = JSON.parse(raw)
      },
    }
    handler(
      { method: 'GET', url: '/api/cart', headers: { authorization } },
      response,
      () => nextCalls++,
    )
    assert.equal(response.statusCode, expectedStatus)
    assert.equal(result.data?.items?.length, expectedItems)
    handler({ method: 'POST', url: '/api/cart', headers: {} }, response, () => nextCalls++)
    handler({ method: 'GET', url: '/api/products', headers: {} }, response, () => nextCalls++)
    assert.equal(nextCalls, 2)
  }
})
