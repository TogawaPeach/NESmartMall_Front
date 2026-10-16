import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'
import { createRenderer } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

let server, http, configureAuth, createPinia, useAuthStore, fixture
const entries = new Map()
const requests = []
const user = { id: 'order-user', account: 'order-user', nickname: '测试用户', role: 1 }
const order = (overrides = {}) => ({
  id: '9007199254740993101',
  orderNo: 'JW202610160001',
  status: 'PENDING_PAYMENT',
  createdAt: '2026-10-16T02:00:00Z',
  paidAt: null,
  shippedAt: null,
  completedAt: null,
  cancelledAt: null,
  items: [
    {
      id: '101',
      productId: '9007199254740993123',
      name: 'GNSS 接收机',
      model: 'RTK-01',
      coverUrl: null,
      unitPriceFen: 129900,
      quantity: 2,
    },
  ],
  goodsAmountFen: 259800,
  shippingFeeFen: 1000,
  discountAmountFen: 800,
  payableAmountFen: 260000,
  paidAmountFen: null,
  recipient: { name: '演示收货人', phone: '138****0000', address: '演示地址' },
  logistics: null,
  ...overrides,
})
const page = (overrides = {}) => ({
  list: [order()],
  total: 1,
  pageNum: 1,
  pageSize: 5,
  ...overrides,
})
const reply = (config, data, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config,
})
const flush = () => new Promise((resolve) => setImmediate(resolve))
const ok = (data) => ({ code: 200, data })
function saveSession(token = 'order-token') {
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
before(async () => {
  globalThis.localStorage = {
    getItem: (k) => entries.get(k) ?? null,
    setItem: (k, v) => entries.set(k, v),
    removeItem: (k) => entries.delete(k),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/orders' },
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
  configureAuth({ getAuthorization: () => 'Bearer order-token', logout: () => {} })
  respond(page())
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
function respond(data) {
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(config, ok(data))
  }
}
async function api() {
  return server.ssrLoadModule('/src/api/orders.ts')
}
async function mount({ authenticated = true, path = '/orders', adapter, entry = false } = {}) {
  if (authenticated) saveSession()
  const pinia = createPinia(),
    auth = useAuthStore(pinia)
  configureAuth(auth)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    if (config.url === '/api/auth/login')
      return reply(
        config,
        ok({ accessToken: 'new-token', tokenType: 'Bearer', expiresIn: 3600, user }),
      )
    return adapter
      ? adapter(config)
      : reply(config, ok(config.url === '/api/orders' ? page() : order()))
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'home', path: '/', component: {} },
      { name: 'orders', path: '/orders', component: {} },
      { name: 'order-detail', path: '/orders/:id', component: {} },
    ],
  })
  await router.push(path)
  const module = await server.ssrLoadModule(
    entry ? '/src/composables/useOrderEntry.ts' : '/src/composables/useOrders.ts',
  )
  const { useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts')
  let resource
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  const app = renderer.createApp({
    setup() {
      resource = entry
        ? module.useOrderEntry()
        : path.startsWith('/orders/')
          ? module.useOrderDetail()
          : module.useOrders()
      return () => null
    },
  })
  app.use(pinia)
  app.use(router)
  fixture = { app, auth, router, prompt: useLoginPromptStore(pinia) }
  app.mount({})
  await flush()
  return { ...fixture, resource }
}

test('order queries use Bearer, fixed pagination and string IDs without client identity', async () => {
  const { queryOrders, queryOrder } = await api()
  const data = await queryOrders({ status: 'PENDING_PAYMENT', pageNum: 1 })
  assert.equal(data.list[0].items[0].productId, '9007199254740993123')
  assert.equal(data.list[0].payableAmountFen, 260000)
  respond(order())
  assert.equal((await queryOrder('9007199254740993101')).id, '9007199254740993101')
  assert.deepEqual(
    requests.map((r) => [r.method, r.url, r.params, r.data]),
    [
      ['get', '/api/orders', { status: 'PENDING_PAYMENT', pageNum: 1, pageSize: 5 }, undefined],
      ['get', '/api/orders/9007199254740993101', undefined, undefined],
    ],
  )
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer order-token')
  assert.equal(requests[0].headers.has('user-info'), false)
})
test('all status omits status, and only explicit empty list is an empty success', async () => {
  const { queryOrders } = await api()
  respond(page({ list: [], total: 0 }))
  assert.deepEqual((await queryOrders({ pageNum: 1 })).list, [])
  assert.deepEqual(requests[0].params, { pageNum: 1, pageSize: 5 })
})
test('invalid order snapshots are rejected instead of invented empty/zero records', async () => {
  const { queryOrders } = await api()
  const invalid = [
    null,
    {},
    { list: null },
    page({ total: -1 }),
    page({ pageNum: 2 }),
    page({ pageSize: 10 }),
    page({ total: 0 }),
    page({ list: [order(), order()] }),
    ...[
      { id: 9007199254740992 },
      { status: 'UNKNOWN' },
      { createdAt: 'bad' },
      { createdAt: '2026-10-16' },
      { goodsAmountFen: 2 },
      { payableAmountFen: 0 },
      { paidAmountFen: -1 },
      { items: [] },
      { items: [{ ...order().items[0], coverUrl: 'javascript:alert(1)' }] },
      { items: [{ ...order().items[0], quantity: 0 }] },
      { items: [{ ...order().items[0], unitPriceFen: Number.MAX_SAFE_INTEGER }] },
      { recipient: null },
    ].map((o) => page({ list: [order(o)] })),
  ]
  for (const data of invalid) {
    respond(data)
    await assert.rejects(queryOrders({ pageNum: 1 }), { name: 'OrderResponseError' })
  }
})
test('paid zero stays distinct from unpaid and fulfilled orders require payment time', async () => {
  const { queryOrder } = await api()
  const free = order({
    status: 'COMPLETED',
    paidAt: '2026-10-16T03:00:00Z',
    shippedAt: '2026-10-16T04:00:00Z',
    completedAt: '2026-10-16T05:00:00Z',
    goodsAmountFen: 0,
    shippingFeeFen: 0,
    discountAmountFen: 0,
    payableAmountFen: 0,
    paidAmountFen: 0,
    items: [{ ...order().items[0], unitPriceFen: 0 }],
  })
  respond(free)
  assert.equal((await queryOrder(free.id)).paidAmountFen, 0)
  respond(order())
  assert.equal((await queryOrder(free.id)).paidAmountFen, null)
  respond({ ...free, paidAt: null })
  await assert.rejects(queryOrder(free.id), { name: 'OrderResponseError' })
})
test('invalid detail IDs are not requested and response ID must match requested order', async () => {
  const { queryOrder } = await api()
  for (const id of ['../cart', '0', '1?userId=2', ''])
    await assert.rejects(queryOrder(id), { name: 'OrderResponseError' })
  assert.equal(requests.length, 0)
  respond(order({ id: '2' }))
  await assert.rejects(queryOrder('1'), { name: 'OrderResponseError' })
})
for (const transport of ['business', 'http']) {
  for (const [status, kind] of [
    [401, 'login-required'],
    [403, 'forbidden'],
    [404, 'unavailable'],
    [503, 'unavailable'],
    [500, 'error'],
  ]) {
    test(`${transport} list ${status} maps to ${kind}`, async () => {
      const { queryOrders } = await api()
      http.defaults.adapter = async (config) => {
        if (transport === 'business') return reply(config, { code: status })
        throw new AxiosError('failure', undefined, config, {}, reply(config, {}, status))
      }
      await assert.rejects(queryOrders({ pageNum: 1 }), (error) => error.kind === kind)
    })
  }
}
test('detail 404 is not-found rather than list service unavailable', async () => {
  const { queryOrder } = await api()
  http.defaults.adapter = async (config) => reply(config, { code: 404 })
  await assert.rejects(queryOrder('1'), (error) => error.kind === 'not-found')
})
test('anonymous list sends no requests, login loads, logout immediately removes data', async () => {
  const { resource, auth } = await mount({ authenticated: false })
  assert.equal(resource.state.value, 'login-required')
  assert.equal(requests.length, 0)
  await auth.signIn({ account: 'order-user', password: 'test-only' })
  await flush()
  assert.equal(resource.state.value, 'success')
  assert.equal(resource.data.value.list.length, 1)
  auth.logout()
  assert.equal(resource.data.value, null)
  assert.equal(resource.state.value, 'login-required')
})
test('list normalizes bad URL params, preserves filters through pagination and resets on status switch', async () => {
  const { resource, router } = await mount({ path: '/orders?status=bad&page=-2' })
  assert.equal(resource.status.value, undefined)
  assert.equal(resource.pageNum.value, 1)
  await resource.changeStatus('PENDING_RECEIPT')
  await flush()
  assert.equal(router.currentRoute.value.query.status, 'PENDING_RECEIPT')
  assert.equal(resource.pageNum.value, 1)
  await resource.changePage(2)
  await flush()
  assert.equal(router.currentRoute.value.query.status, 'PENDING_RECEIPT')
  assert.equal(router.currentRoute.value.query.page, '2')
  await resource.changeStatus(undefined)
  await flush()
  assert.equal(resource.pageNum.value, 1)
})
test('an out of range page returns to last page and fetches it once', async () => {
  const { resource, router } = await mount({
    path: '/orders?page=9',
    adapter: async (config) =>
      reply(
        config,
        ok(
          page({
            list: config.params.pageNum === 9 ? [] : [order()],
            total: 6,
            pageNum: config.params.pageNum,
          }),
        ),
      ),
  })
  await flush()
  assert.equal(router.currentRoute.value.query.page, '2')
  assert.equal(resource.state.value, 'success')
  assert.deepEqual(
    requests.map((r) => r.params.pageNum),
    [9, 2],
  )
})
test('switching filters ignores an old slow response and clears old data immediately', async () => {
  let finish
  const { resource } = await mount({
    adapter: (config) =>
      config.params.status
        ? reply(config, ok(page({ list: [], total: 0 })))
        : new Promise((resolve) => {
            finish = () => resolve(reply(config, ok(page())))
          }),
  })
  await resource.changeStatus('COMPLETED')
  await flush()
  finish()
  await flush()
  assert.equal(resource.state.value, 'empty')
  assert.deepEqual(resource.data.value.list, [])
})
test('switching accounts cannot accept a response from the old account', async () => {
  let finish
  const { resource, auth } = await mount({
    adapter: (config) =>
      config.headers.get('Authorization') === 'Bearer order-token'
        ? new Promise((resolve) => {
            finish = () => resolve(reply(config, ok(page())))
          })
        : reply(config, ok(page({ list: [], total: 0 }))),
  })
  saveSession('other-token')
  auth.getAuthorization()
  await flush()
  finish()
  await flush()
  assert.equal(resource.state.value, 'empty')
  assert.deepEqual(resource.data.value.list, [])
})
test('detail reloads on ID navigation and ignores old detail responses', async () => {
  let finish
  const { resource, router } = await mount({
    path: '/orders/1?status=COMPLETED&page=2',
    adapter: (config) =>
      config.url.endsWith('/1')
        ? new Promise((resolve) => {
            finish = () => resolve(reply(config, ok(order({ id: '1' }))))
          })
        : reply(config, ok(order({ id: '2' }))),
  })
  await router.push('/orders/2?status=COMPLETED&page=2')
  await flush()
  finish()
  await flush()
  assert.equal(resource.data.value.id, '2')
  assert.deepEqual(resource.listLocation.value.query, { status: 'COMPLETED', page: '2' })
})
test('retry recovers from errors without logging out', async () => {
  let failed = true
  const { resource, auth } = await mount({
    adapter: (config) => {
      if (failed) throw new Error('offline')
      return reply(config, ok(page()))
    },
  })
  assert.equal(resource.state.value, 'error')
  assert.equal(auth.isAuthenticated, true)
  failed = false
  await resource.retry()
  assert.equal(resource.state.value, 'success')
})
test('order entry resumes in the same router after successful login', async () => {
  const { resource, prompt, auth, router } = await mount({
    authenticated: false,
    path: '/',
    entry: true,
  })
  resource.openOrders()
  assert.equal(prompt.visible, true)
  assert.equal(router.currentRoute.value.path, '/')
  await auth.signIn({ account: 'order-user', password: 'test-only' })
  prompt.visible = false
  await flush()
  assert.equal(router.currentRoute.value.path, '/orders')
})
test('cancelled entry login does not redirect after a later unrelated login', async () => {
  const { resource, prompt, auth, router } = await mount({
    authenticated: false,
    path: '/',
    entry: true,
  })
  resource.openOrders()
  prompt.visible = false
  await auth.signIn({ account: 'order-user', password: 'test-only' })
  await flush()
  assert.equal(router.currentRoute.value.path, '/')
})

test('recipient phone is masked at the display data boundary, including international and short values', async () => {
  const { queryOrder } = await api()
  for (const [phone, masked] of [
    ['13812345678', '138****5678'],
    ['+86 13812345678', '861****5678'],
    ['123', '已隐藏'],
    ['138****0000', '138****0000'],
  ]) {
    respond(order({ recipient: { ...order().recipient, phone } }))
    assert.equal((await queryOrder(order().id)).recipient.phone, masked)
  }
})
test('calendar validation rejects normalized impossible dates and accepts actual leap dates with timezones', async () => {
  const { queryOrder } = await api()
  for (const createdAt of [
    '2026-02-30T02:00:00Z',
    '2026-02-29T02:00:00Z',
    '2026-04-31T02:00:00+08:00',
    '2026-10-16T24:00:00Z',
  ]) {
    respond(order({ createdAt }))
    await assert.rejects(queryOrder(order().id), { name: 'OrderResponseError' })
  }
  respond(order({ createdAt: '2024-02-29T02:00:00+08:00' }))
  assert.equal((await queryOrder(order().id)).createdAt, '2024-02-29T02:00:00+08:00')
})
test('status validates allowed progress events and chronological order', async () => {
  const { queryOrder } = await api()
  for (const overrides of [
    { shippedAt: '2026-10-16T03:00:00Z', completedAt: '2026-10-16T04:00:00Z' },
    { cancelledAt: '2026-10-16T03:00:00Z' },
    {
      status: 'PENDING_SHIPMENT',
      paidAt: '2026-10-16T03:00:00Z',
      paidAmountFen: 260000,
      shippedAt: '2026-10-16T04:00:00Z',
    },
    {
      status: 'PENDING_RECEIPT',
      paidAt: '2026-10-16T03:00:00Z',
      paidAmountFen: 260000,
      shippedAt: '2026-10-16T04:00:00Z',
      completedAt: '2026-10-16T05:00:00Z',
    },
    { status: 'PENDING_SHIPMENT', paidAt: '2026-10-15T03:00:00Z', paidAmountFen: 260000 },
    { status: 'CANCELLED', cancelledAt: '2026-10-16T01:00:00Z' },
  ]) {
    respond(order(overrides))
    await assert.rejects(queryOrder(order().id), { name: 'OrderResponseError' })
  }
})
