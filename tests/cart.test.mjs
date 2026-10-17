import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'
import { createRenderer } from 'vue'
import { EventEmitter } from 'node:events'
import { readFile } from 'node:fs/promises'
import { parse, compileScript } from '@vue/compiler-sfc'
import ts from 'typescript'

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
    optimizeDeps: { noDiscovery: true, include: [] },
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

test('DELETE sends productId with Bearer and removes selected and invalid rows only after success', async () => {
  let saved = [
    item(),
    item({ cartItemId: '102', productId: '43', price: 100, quantity: 1 }),
    item({ cartItemId: '103', productId: '44', availability: 'DELETED' }),
  ]
  const { cart } = await mount({
    adapter: async (config) => {
      if (config.method === 'delete') {
        const productId = config.url.split('/').at(-1)
        saved = saved.filter((entry) => entry.productId !== productId)
        return reply(config, { code: 200, data: null })
      }
      return reply(config, body(saved))
    },
  })
  cart.selectAll(true)
  assert.equal(typeof cart.removeItem, 'function')
  const pending = cart.removeItem('101')
  assert.equal(cart.items.value.length, 3)
  assert.equal(cart.deletingIds.value.has('101'), true)
  await pending
  assert.equal(requests[1].method, 'delete')
  assert.equal(requests[1].url, '/api/cart/9007199254740993123')
  assert.equal(requests[1].data, undefined)
  assert.equal(requests[1].headers.get('Authorization'), 'Bearer cart-token')
  assert.deepEqual(
    cart.items.value.map((entry) => entry.cartItemId),
    ['102', '103'],
  )
  assert.equal(cart.selectedIds.value.has('101'), false)
  assert.equal(cart.selectedCount.value, 1)
  assert.equal(cart.totalFen.value, 100)
  await cart.removeItem('103')
  await cart.removeItem('102')
  assert.equal(cart.state.value, 'empty')
  assert.equal(cart.totalFen.value, 0)
  assert.equal(requests.length, 4)
  await cart.retry()
  assert.equal(cart.state.value, 'empty')
  assert.equal(cart.items.value.length, 0)
})

test('removing one row cancels only its queued quantity edit', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cart } = await mount({
    adapter: async (config) =>
      reply(config, body([item(), item({ cartItemId: '102', productId: '43' })])),
  })
  respond({ code: 200 })
  cart.scheduleQuantity('101', 3)
  cart.scheduleQuantity('102', 5)
  assert.equal(typeof cart.removeItem, 'function')
  const pending = cart.removeItem('101')
  assert.equal(cart.queuedIds.value.has('101'), false)
  assert.equal(cart.queuedIds.value.has('102'), true)
  t.mock.timers.tick(800)
  await pending
  await flush()
  assert.equal(requests.length, 3)
  assert.equal(requests.find((request) => request.method === 'put').url, '/api/cart/43/quantity')
  assert.equal(cart.items.value[0].quantity, 5)
})

test('removing a row aborts its quantity write and ignores late feedback', async () => {
  const { cart } = await mount()
  let release, signal
  http.defaults.adapter = (config) => {
    requests.push(config)
    if (config.method === 'delete') return Promise.resolve(reply(config, { code: 200 }))
    signal = config.signal
    return new Promise((resolve) => {
      release = () => resolve(reply(config, { code: 400, message: '库存不足' }))
    })
  }
  const pending = cart.updateQuantity('101', 3)
  await flush()
  assert.equal(typeof cart.removeItem, 'function')
  await cart.removeItem('101')
  assert.equal(signal.aborted, true)
  release()
  await pending
  assert.deepEqual(cart.items.value, [])
  assert.deepEqual(cart.quantityErrors.value, {})
  assert.equal(cart.updatingIds.value.size, 0)
  assert.equal(cart.state.value, 'empty')
  assert.equal(requests.filter((request) => request.method === 'delete').length, 1)
})

for (const failure of ['business', 'http', 'network', 'malformed']) {
  test(`DELETE ${failure} failure keeps the row and selection and displays an error`, async () => {
    const { cart, auth } = await mount()
    cart.selectAll(true)
    http.defaults.adapter = async (config) => {
      requests.push(config)
      if (failure === 'http')
        throw new AxiosError(
          'forbidden',
          'ERR_BAD_RESPONSE',
          config,
          null,
          reply(config, { code: 403, message: '不能删除该商品' }, 403),
        )
      if (failure === 'network') throw new AxiosError('timeout', 'ECONNABORTED', config)
      return reply(config, failure === 'business' ? { code: 400, message: '删除失败' } : {})
    }
    await cart.removeItem('101')
    assert.equal(cart.items.value.length, 1)
    assert.equal(cart.selectedCount.value, 1)
    assert.equal(cart.totalFen.value, 259800)
    assert.ok(cart.removeErrors.value['101'])
    assert.equal(cart.deletingIds.value.size, 0)
    assert.equal(auth.accessToken, 'cart-token')
    assert.equal(requests.length, 2)
    respond({ code: 200 })
    await cart.removeItem('101')
    assert.equal(cart.state.value, 'empty')
    assert.deepEqual(cart.removeErrors.value, {})
  })
}

test('pending DELETE prevents duplicate deletion, quantity edits and refresh until completion', async () => {
  const { cart } = await mount()
  let release
  http.defaults.adapter = (config) => {
    requests.push(config)
    return new Promise((resolve) => {
      release = () => resolve(reply(config, { code: 200 }))
    })
  }
  const pending = cart.removeItem('101')
  await cart.removeItem('101')
  await cart.updateQuantity('101', 4)
  cart.scheduleQuantity('101', 5)
  await cart.retry()
  await flush()
  assert.equal(cart.queuedIds.value.size, 0)
  assert.equal(requests.length, 2)
  release()
  await pending
  assert.equal(cart.state.value, 'empty')
})

for (const change of ['account', 'unmount']) {
  test(`${change} aborts DELETE and ignores its late response`, async () => {
    const { cart, auth, app } = await mount()
    let release, signal
    http.defaults.adapter = (config) => {
      requests.push(config)
      if (config.method === 'get')
        return Promise.resolve(reply(config, body([item({ name: '新账号商品' })])))
      signal = config.signal
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
    const pending = cart.removeItem('101')
    await flush()
    if (change === 'account') {
      saveSession('another-cart-token')
      auth.getAuthorization()
    } else {
      app.unmount()
      fixture.app = undefined
    }
    assert.equal(signal.aborted, true)
    await flush()
    release()
    await pending
    assert.deepEqual(cart.removeErrors.value, {})
    assert.equal(cart.deletingIds.value.size, 0)
    if (change === 'account') {
      assert.equal(auth.accessToken, 'another-cart-token')
      assert.equal(cart.items.value[0].name, '新账号商品')
    } else assert.deepEqual(cart.items.value, [])
  })
}

test('current-session DELETE 401 clears the cart and enters login-required', async () => {
  const { cart } = await mount()
  respond({ code: 401 })
  await cart.removeItem('101')
  assert.equal(cart.state.value, 'login-required')
  assert.deepEqual(cart.items.value, [])
  assert.deepEqual(cart.removeErrors.value, {})
})

test('setting quantity sends an absolute PUT with Bearer and rejects invalid input before transport', async () => {
  const { setCartItemQuantity } = await server.ssrLoadModule('/src/api/cart.ts')
  assert.equal(typeof setCartItemQuantity, 'function')
  respond({ code: 200, data: null })
  await setCartItemQuantity('9007199254740993123', 6)
  assert.equal(requests[0].method, 'put')
  assert.equal(requests[0].url, '/api/cart/9007199254740993123/quantity')
  assert.deepEqual(JSON.parse(requests[0].data), { quantity: 6 })
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer cart-token')
  for (const quantity of [undefined, null, 0, -1, 1.5, NaN, Infinity, 2147483648]) {
    await assert.rejects(setCartItemQuantity('101', quantity))
  }
  await assert.rejects(setCartItemQuantity('../101', 2))
  assert.equal(requests.length, 1)
})

test('quantity changes wait 0.8 seconds after the last edit and send only the final value', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cart } = await mount()
  respond({ code: 200 })
  assert.equal(typeof cart.scheduleQuantity, 'function')
  cart.scheduleQuantity('101', 3)
  assert.equal(cart.queuedIds.value.has('101'), true)
  assert.equal(cart.updatingIds.value.has('101'), false)
  t.mock.timers.tick(400)
  cart.scheduleQuantity('101', 6)
  await cart.retry()
  t.mock.timers.tick(799)
  await flush()
  assert.equal(requests.length, 1)
  assert.equal(cart.items.value[0].quantity, 2)
  t.mock.timers.tick(1)
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].url, '/api/cart/9007199254740993123/quantity')
  assert.deepEqual(JSON.parse(requests[1].data), { quantity: 6 })
  assert.equal(cart.items.value[0].quantity, 6)
  assert.equal(cart.queuedIds.value.size, 0)
})

test('returning to the confirmed quantity cancels a queued save', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cart } = await mount()
  assert.equal(typeof cart.scheduleQuantity, 'function')
  cart.scheduleQuantity('101', 3)
  t.mock.timers.tick(400)
  cart.scheduleQuantity('101', 2)
  t.mock.timers.tick(2000)
  await flush()
  assert.equal(cart.queuedIds.value.size, 0)
  assert.equal(requests.length, 1)
})

test('each cart row has an independent debounce timer', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cart } = await mount({
    adapter: async (config) =>
      reply(config, body([item(), item({ cartItemId: '102', productId: '43' })])),
  })
  respond({ code: 200 })
  assert.equal(typeof cart.scheduleQuantity, 'function')
  cart.scheduleQuantity('101', 3)
  t.mock.timers.tick(500)
  cart.scheduleQuantity('102', 5)
  t.mock.timers.tick(300)
  await flush()
  assert.equal(requests.length, 2)
  assert.equal(requests[1].url, '/api/cart/9007199254740993123/quantity')
  assert.equal(cart.queuedIds.value.has('102'), true)
  t.mock.timers.tick(500)
  await flush()
  assert.equal(requests.length, 3)
  assert.equal(requests[2].url, '/api/cart/43/quantity')
})

for (const change of ['logout', 'account', 'unmount']) {
  test(`${change} cancels quantity edits before the debounce timer sends them`, async (t) => {
    t.mock.timers.enable({ apis: ['setTimeout'] })
    const { cart, auth, app } = await mount()
    assert.equal(typeof cart.scheduleQuantity, 'function')
    cart.scheduleQuantity('101', 6)
    t.mock.timers.tick(400)
    if (change === 'logout') auth.logout()
    if (change === 'account') saveSession('another-cart-token')
    if (change === 'unmount') {
      app.unmount()
      fixture.app = undefined
    }
    t.mock.timers.tick(800)
    await flush()
    assert.equal(requests.filter((request) => request.method === 'put').length, 0)
    assert.equal(cart.queuedIds.value.size, 0)
  })
}

test('bulk edits update confirmed quantities and selected totals only after success', async () => {
  const { cart } = await mount()
  cart.selectAll(true)
  let release
  http.defaults.adapter = (config) => {
    requests.push(config)
    return new Promise((resolve) => {
      release = () => resolve(reply(config, { code: 200 }))
    })
  }
  assert.equal(typeof cart.updateQuantity, 'function')
  const pending = cart.updateQuantity('101', 6)
  assert.equal(cart.updatingIds.value.has('101'), true)
  assert.equal(cart.items.value[0].quantity, 2)
  assert.equal(cart.totalFen.value, 259800)
  await cart.updateQuantity('101', 7)
  await cart.retry()
  await flush()
  assert.equal(requests.length, 2)
  release()
  await pending
  assert.equal(cart.items.value[0].quantity, 6)
  assert.equal(cart.selectedQuantity.value, 6)
  assert.equal(cart.totalFen.value, 779400)
  assert.equal(cart.selectedIds.value.has('101'), true)
  assert.equal(cart.updatingIds.value.size, 0)
  respond({ code: 200 })
  await cart.updateQuantity('101', 1)
  assert.equal(cart.items.value[0].quantity, 1)
  assert.equal(cart.totalFen.value, 129900)
})

test('quantity edits reject invalid values and unavailable items but allow fixing excess stock', async () => {
  const { cart } = await mount({
    adapter: async (config) =>
      reply(
        config,
        body([
          item(),
          item({ cartItemId: '102', quantity: 12 }),
          item({ cartItemId: '103', availability: 'OFF_SHELF' }),
          item({ cartItemId: '104', stock: null }),
          item({ cartItemId: '105', stock: 0 }),
          item({ cartItemId: '106', price: null }),
        ]),
      ),
  })
  assert.equal(typeof cart.updateQuantity, 'function')
  for (const quantity of [undefined, null, 0, -1, 1.5, NaN, Infinity, 9, 2147483648, 2]) {
    await cart.updateQuantity('101', quantity)
  }
  for (const id of ['103', '104', '105', '106', 'missing']) await cart.updateQuantity(id, 1)
  assert.equal(requests.length, 1)
  respond({ code: 200 })
  await cart.updateQuantity('102', 8)
  assert.equal(cart.items.value[1].quantity, 8)
  cart.setSelected('102', true)
  assert.equal(cart.selectedCount.value, 1)
})

for (const failure of ['business', 'http', 'network', 'malformed']) {
  test(`quantity ${failure} failure preserves confirmed data and shows a row error without retry`, async () => {
    const { cart, auth } = await mount()
    cart.selectAll(true)
    http.defaults.adapter = async (config) => {
      requests.push(config)
      if (failure === 'http')
        throw new AxiosError(
          'failed',
          'ERR_BAD_RESPONSE',
          config,
          null,
          reply(config, { code: 403, message: '不能修改该条目' }, 403),
        )
      if (failure === 'network') throw new AxiosError('timeout', 'ECONNABORTED', config)
      return reply(config, failure === 'business' ? { code: 400, message: '库存不足' } : {})
    }
    assert.equal(typeof cart.updateQuantity, 'function')
    await cart.updateQuantity('101', 6)
    assert.equal(cart.items.value[0].quantity, 2)
    assert.equal(cart.totalFen.value, 259800)
    assert.ok(cart.quantityErrors.value['101'])
    if (failure === 'business') assert.equal(cart.quantityErrors.value['101'], '库存不足')
    if (failure === 'network') assert.match(cart.quantityErrors.value['101'], /刷新购物车/)
    assert.equal(cart.updatingIds.value.size, 0)
    assert.equal(auth.accessToken, 'cart-token')
    assert.equal(requests.length, 2)
    respond({ code: 200 })
    await cart.updateQuantity('101', 3)
    assert.equal(cart.items.value[0].quantity, 3)
    assert.equal(cart.quantityErrors.value['101'], undefined)
  })
}

test('account changes abort pending quantity edits and ignore their late errors', async () => {
  const { cart, auth } = await mount()
  let release, signal
  http.defaults.adapter = (config) => {
    requests.push(config)
    if (config.method === 'get')
      return Promise.resolve(reply(config, body([item({ quantity: 4 })])))
    signal = config.signal
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
  assert.equal(typeof cart.updateQuantity, 'function')
  const pending = cart.updateQuantity('101', 6)
  await flush()
  saveSession('new-cart-token')
  auth.getAuthorization()
  assert.equal(signal.aborted, true)
  assert.deepEqual(cart.items.value, [])
  await flush()
  release()
  await pending
  assert.equal(auth.accessToken, 'new-cart-token')
  assert.equal(cart.items.value[0].quantity, 4)
  assert.deepEqual(cart.quantityErrors.value, {})
})

test('quantity 401 clears the current cart', async () => {
  const { cart } = await mount()
  assert.equal(typeof cart.updateQuantity, 'function')
  respond({ code: 401, message: '请登录' })
  await cart.updateQuantity('101', 3)
  assert.equal(cart.state.value, 'login-required')
  assert.deepEqual(cart.items.value, [])
  assert.deepEqual(cart.quantityErrors.value, {})
})

test('unmount aborts pending quantity writes and ignores their late success', async () => {
  const { cart, app } = await mount()
  let release, signal
  http.defaults.adapter = (config) => {
    signal = config.signal
    return new Promise((resolve) => {
      release = () => resolve(reply(config, { code: 200 }))
    })
  }
  const pending = cart.updateQuantity('101', 6)
  await flush()
  app.unmount()
  fixture.app = undefined
  assert.equal(signal.aborted, true)
  release()
  await pending
  assert.deepEqual(cart.items.value, [])
  assert.equal(cart.updatingIds.value.size, 0)
  assert.deepEqual(cart.quantityErrors.value, {})
})

async function setupQuantityRow(props, emit) {
  const source = await readFile(
    new URL('../src/components/storefront/CartItemRow.vue', import.meta.url),
    'utf8',
  )
  const { descriptor } = parse(source)
  const compiled = compileScript(descriptor, {
    id: 'quantity-row-test',
    genDefaultAs: 'CartItemRow',
  })
  const { outputText } = ts.transpileModule(compiled.content, {
    compilerOptions: { target: ts.ScriptTarget.ESNext, module: ts.ModuleKind.CommonJS },
  })
  const modules = {
    vue: await import('vue'),
    'element-plus': await import('element-plus'),
    '@element-plus/icons-vue': await import('@element-plus/icons-vue'),
    '@/utils/cart': await server.ssrLoadModule('/src/utils/cart.ts'),
    '@/utils/price': await server.ssrLoadModule('/src/utils/price.ts'),
  }
  const component = new Function('require', 'exports', `${outputText}\nreturn CartItemRow`)(
    (name) => modules[name],
    {},
  )
  const vue = modules.vue
  const scope = vue.effectScope()
  const reactiveProps = vue.reactive(props)
  const row = scope.run(() => component.setup(reactiveProps, { expose() {}, emit }))
  return { row, props: reactiveProps, scope, vue }
}

test('quantity row clamps a user edit after stock shrinks without silently changing stored quantity', async () => {
  const events = []
  const { row, props, scope, vue } = await setupQuantityRow(
    {
      item: { ...item({ quantity: 12 }), priceFen: 129900 },
      selected: false,
      updating: false,
    },
    (...args) => events.push(args),
  )
  try {
    assert.deepEqual(events, [])
    assert.equal(row.draftQuantity.value, 12)
    row.draftQuantity.value = 11
    row.changeQuantity(11)
    assert.deepEqual(events, [['quantity', 8]])
    assert.equal(row.draftQuantity.value, 8)
    assert.equal(props.item.quantity, 12)
    props.queued = true
    props.quantityError = '上一次修改失败'
    await vue.nextTick()
    assert.equal(row.draftQuantity.value, 8)
    props.quantityError = undefined
    await vue.nextTick()
    assert.equal(row.draftQuantity.value, 8)
    props.queued = false
    props.updating = true
    await vue.nextTick()
    props.quantityError = '库存不足'
    props.updating = false
    await vue.nextTick()
    assert.equal(row.draftQuantity.value, 12)
  } finally {
    scope.stop()
  }
})

test('typing before blur replaces a queued button edit rather than saving the old quantity', async (t) => {
  // Set up the compiler before mocking timers used by the mounted session.
  const { row, props, scope } = await setupQuantityRow(
    {
      item: { ...item(), priceFen: 129900 },
      selected: false,
      queued: false,
      updating: false,
    },
    (_event, quantity) => cart.scheduleQuantity('101', quantity),
  )
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const { cart } = await mount()
  props.item = cart.items.value[0]
  respond({ code: 200 })
  try {
    row.changeQuantity(3)
    t.mock.timers.tick(400)
    assert.equal(typeof row.inputQuantity, 'function')
    row.inputQuantity(6)
    t.mock.timers.tick(799)
    await flush()
    assert.equal(requests.length, 1)
    t.mock.timers.tick(1)
    await flush()
    assert.equal(requests.length, 2)
    assert.deepEqual(JSON.parse(requests[1].data), { quantity: 6 })
    row.changeQuantity(7)
    t.mock.timers.tick(500)
    row.inputQuantity(null)
    t.mock.timers.tick(2000)
    await flush()
    assert.equal(requests.length, 2)
    assert.equal(cart.queuedIds.value.size, 0)
  } finally {
    scope.stop()
  }
})

test('explicit cart mock persists absolute edits per session and rejects invalid writes', async () => {
  const { cartMockPlugin } = await server.ssrLoadModule('/dev/cartMock.ts')
  let handler
  cartMockPlugin('normal').configureServer({
    middlewares: {
      use(fn) {
        handler = fn
      },
    },
  })
  async function call(method, url, payload, authorization = 'Bearer fixture-one') {
    let result
    const request = Object.assign(new EventEmitter(), { method, url, headers: { authorization } })
    const response = {
      setHeader() {},
      end(raw) {
        result = JSON.parse(raw)
      },
    }
    handler(request, response, () => {
      throw new Error('cart write escaped development mock')
    })
    if (method === 'PUT') {
      request.emit('data', JSON.stringify(payload))
      request.emit('end')
    }
    await flush()
    return { status: response.statusCode, result }
  }
  assert.equal(
    (await call('PUT', '/api/cart/9007199254740993123/quantity', { quantity: 6 })).status,
    200,
  )
  assert.equal((await call('GET', '/api/cart')).result.data.items[0].quantity, 6)
  assert.equal(
    (await call('GET', '/api/cart', undefined, 'Bearer fixture-two')).result.data.items[0].quantity,
    2,
  )
  for (const quantity of [0, -1, 1.5, 9]) {
    assert.equal(
      (await call('PUT', '/api/cart/9007199254740993123/quantity', { quantity })).status,
      400,
    )
  }
  assert.equal((await call('PUT', '/api/cart/101/quantity', { quantity: 1 })).status, 404)
  assert.equal((await call('PUT', '/api/cart/999/quantity', { quantity: 1 })).status, 404)
  assert.equal(
    (await call('PUT', '/api/cart/9007199254740993123/quantity', { quantity: 1 }, '')).status,
    401,
  )
  assert.equal((await call('GET', '/api/cart')).result.data.items[0].quantity, 6)
  assert.equal((await call('DELETE', '/api/cart/9007199254740993123')).status, 200)
  assert.equal((await call('GET', '/api/cart')).result.data.items.length, 2)
  assert.equal(
    (await call('GET', '/api/cart', undefined, 'Bearer fixture-two')).result.data.items.length,
    3,
  )
  assert.equal((await call('DELETE', '/api/cart/9007199254740993123')).status, 200)
  assert.equal((await call('DELETE', '/api/cart/43', undefined, '')).status, 401)
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
