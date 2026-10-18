import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'
import { createRenderer, createSSRApp, h } from 'vue'
import { renderToString } from '@vue/server-renderer'
import vue from '@vitejs/plugin-vue'
import { readFileSync } from 'node:fs'
import { createMemoryHistory, createRouter } from 'vue-router'

const backendResponse = JSON.parse(
  readFileSync(new URL('./fixtures/order-list-response.json', import.meta.url), 'utf8'),
)
const summary = ({ orderNo, status, createdAt, items, payableAmountFen }) => ({
  orderNo,
  status,
  createdAt,
  items,
  payableAmountFen,
})

let server, http, configureAuth, createPinia, useAuthStore, fixture
const entries = new Map()
const requests = []
const user = { id: 'order-user', account: 'order-user', nickname: '测试用户', role: 1 }
const order = (overrides = {}) => ({
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
    plugins: [vue()],
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
  respond([summary(order())])
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
      : reply(config, ok(config.url === '/api/orders' ? [summary(order())] : order()))
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'home', path: '/', component: {} },
      { name: 'orders', path: '/orders', component: {} },
      { name: 'order-detail', path: '/orders/:orderNo', component: {} },
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

test('order queries use Bearer, full lists and order numbers without client identity', async () => {
  const { queryOrders, queryOrder } = await api()
  const data = await queryOrders({ status: 'PENDING_PAYMENT' })
  assert.equal(data[0].items[0].productId, '9007199254740993123')
  assert.equal(data[0].payableAmountFen, 260000)
  respond(order())
  assert.equal((await queryOrder('JW202610160001')).orderNo, 'JW202610160001')
  assert.deepEqual(
    requests.map((r) => [r.method, r.url, r.params, r.data]),
    [
      ['get', '/api/orders', { status: 'PENDING_PAYMENT' }, undefined],
      ['get', '/api/orders/JW202610160001', undefined, undefined],
    ],
  )
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer order-token')
  assert.equal(requests[0].headers.has('user-info'), false)
})
test('orders use order numbers without exposing or requiring database order IDs', async () => {
  const { queryOrders, queryOrder } = await api()
  const { id: _internalId, ...snapshot } = order()
  respond([summary(snapshot)])
  const list = await queryOrders()
  assert.equal(list[0].orderNo, snapshot.orderNo)
  assert.equal(Object.hasOwn(list[0], 'id'), false)
  respond(snapshot)
  const detail = await queryOrder(snapshot.orderNo)
  assert.equal(detail.orderNo, snapshot.orderNo)
  assert.equal(Object.hasOwn(detail, 'id'), false)
  respond([summary(snapshot), summary({ ...snapshot, id: 'different-internal-id' })])
  await assert.rejects(queryOrders(), { name: 'OrderResponseError' })
})
test('real backend card fields load every status without requiring detail fields', async () => {
  const { queryOrders } = await api()
  respond(backendResponse.data)
  const result = await queryOrders()
  assert.deepEqual(
    result.map((item) => item.orderNo),
    backendResponse.data.map((item) => item.orderNo),
  )
  assert.deepEqual(
    result.map((item) => item.payableAmountFen),
    [990, 1980, 990, 990, 2970],
  )
  assert.deepEqual(result, backendResponse.data)
})
test('real backend summaries reach list success with the right order count', async () => {
  const { resource } = await mount({ adapter: (config) => reply(config, backendResponse) })
  assert.equal(resource.state.value, 'success')
  assert.equal(resource.data.value.length, 5)
  assert.equal(resource.data.value[1].items[0].quantity, 2)
})
test('summary card labels payable amount as order amount without inventing payment data', async () => {
  const { default: OrderCard } = await server.ssrLoadModule(
    '/src/components/storefront/OrderCard.vue',
  )
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { name: 'orders', path: '/orders', component: {} },
      { name: 'order-detail', path: '/orders/:orderNo', component: {} },
    ],
  })
  await router.push('/orders?status=PENDING_SHIPMENT')
  const app = createSSRApp({
    render: () =>
      h(OrderCard, { order: backendResponse.data[1], listQuery: { status: 'PENDING_SHIPMENT' } }),
  })
  app.use(router)
  const html = await renderToString(app)
  assert.match(html, /订单金额/)
  assert.match(html, /19\.80/)
  assert.doesNotMatch(html, /实付金额/)
  assert.match(html, /href="\/orders\/JW1980123456789012301\?status=PENDING_SHIPMENT"/)
  assert.doesNotMatch(html, /href="\/orders\/2(?:"|\?)/)
})
test('detail query still rejects a summary without its required detail fields', async () => {
  const { queryOrder } = await api()
  respond(backendResponse.data[0])
  await assert.rejects(queryOrder(backendResponse.data[0].orderNo), { name: 'OrderResponseError' })
})
test('all status omits status, and only explicit empty list is an empty success', async () => {
  const { queryOrders } = await api()
  respond([])
  assert.deepEqual(await queryOrders(), [])
  assert.deepEqual(requests[0].params, {})
})
test('array response keeps more than five orders in backend order', async () => {
  const { queryOrders } = await api()
  const numbers = ['9', '1', '8', '2', '7', '3', '6'].map((id) => `JW${id}`)
  const orders = numbers.map((orderNo) => summary(order({ orderNo })))
  respond(orders)
  const result = await queryOrders()
  assert.equal(result.length, 7)
  assert.deepEqual(
    result.map((item) => item.orderNo),
    numbers,
  )
})
test('one order keeps multiple item snapshots without counting items as orders', async () => {
  const { queryOrders } = await api()
  const snapshot = summary(
    order({
      items: [
        order().items[0],
        { ...order().items[0], id: '102', productId: '42', unitPriceFen: 100, quantity: 3 },
      ],
      goodsAmountFen: 260100,
      payableAmountFen: 260300,
    }),
  )
  respond([snapshot])
  const result = await queryOrders()
  assert.equal(result.length, 1)
  assert.deepEqual(result[0], snapshot)
  assert.equal(result[0].items.length, 2)
})
test('invalid order snapshots are rejected instead of invented empty/zero records', async () => {
  const { queryOrders } = await api()
  const invalid = [
    undefined,
    null,
    {},
    summary(order()),
    { list: [], total: 0 },
    { list: [order()], total: 1 },
    { list: null },
    [null],
    [summary(order()), summary(order())],
    ...[
      { items: [{ ...order().items[0], id: 9007199254740992 }] },
      { status: 'UNKNOWN' },
      { createdAt: 'bad' },
      { createdAt: '2026-10-16' },
      { payableAmountFen: -1 },
      { payableAmountFen: undefined },
      { payableAmountFen: Number.MAX_SAFE_INTEGER + 1 },
      { items: [] },
      { items: undefined },
      { orderNo: undefined },
      { orderNo: '1' },
      { orderNo: 'JW12/3' },
      { items: [order().items[0], order().items[0]] },
      { items: [{ ...order().items[0], name: undefined }] },
      { items: [{ ...order().items[0], coverUrl: 'javascript:alert(1)' }] },
      { items: [{ ...order().items[0], quantity: 0 }] },
      { items: [{ ...order().items[0], unitPriceFen: Number.MAX_SAFE_INTEGER }] },
    ].map((o) => [summary(order({ orderNo: 'JW2' })), summary(order(o))]),
  ]
  for (const data of invalid) {
    respond(data)
    await assert.rejects(queryOrders(), { name: 'OrderResponseError' })
  }
})
test('detail still validates totals, payment and recipient fields independently of summaries', async () => {
  const { queryOrder } = await api()
  for (const overrides of [
    { goodsAmountFen: 2 },
    { payableAmountFen: 0 },
    { paidAmountFen: -1 },
    { recipient: undefined },
    { recipient: null },
    { paidAt: undefined },
    { shippingFeeFen: undefined },
    { discountAmountFen: undefined },
  ]) {
    respond(order(overrides))
    await assert.rejects(queryOrder(order().orderNo), { name: 'OrderResponseError' })
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
  assert.equal((await queryOrder(free.orderNo)).paidAmountFen, 0)
  respond(order())
  assert.equal((await queryOrder(free.orderNo)).paidAmountFen, null)
  respond({ ...free, paidAt: null })
  await assert.rejects(queryOrder(free.orderNo), { name: 'OrderResponseError' })
})
test('invalid order numbers never reach the API and response number must match the request', async () => {
  const { queryOrder } = await api()
  for (const orderNo of [
    '../cart',
    '1',
    'JW',
    'JW0',
    'JW12?userId=2',
    'JW12/3',
    ' JW123',
    'JW' + '1'.repeat(63),
    '',
    null,
  ])
    await assert.rejects(queryOrder(orderNo), { name: 'OrderResponseError' })
  assert.equal(requests.length, 0)
  respond(order())
  assert.equal((await queryOrder(order().orderNo)).orderNo, order().orderNo)
  respond(order({ orderNo: 'JW202610160002' }))
  await assert.rejects(queryOrder(order().orderNo), { name: 'OrderResponseError' })
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
      await assert.rejects(queryOrders(), (error) => error.kind === kind)
    })
  }
}
test('detail 404 is not-found rather than list service unavailable', async () => {
  const { queryOrder } = await api()
  http.defaults.adapter = async (config) => reply(config, { code: 404 })
  await assert.rejects(queryOrder(order().orderNo), (error) => error.kind === 'not-found')
})
test('anonymous list sends no requests, login loads, logout immediately removes data', async () => {
  const { resource, auth } = await mount({ authenticated: false })
  assert.equal(resource.state.value, 'login-required')
  assert.equal(requests.length, 0)
  await auth.signIn({ account: 'order-user', password: 'test-only' })
  await flush()
  assert.equal(resource.state.value, 'success')
  assert.equal(resource.data.value.length, 1)
  auth.logout()
  assert.equal(resource.data.value, null)
  assert.equal(resource.state.value, 'login-required')
})
test('an empty array is an empty success after loading', async () => {
  const { resource } = await mount({ adapter: (config) => reply(config, ok([])) })
  assert.equal(resource.state.value, 'empty')
  assert.deepEqual(resource.data.value, [])
})
for (const [label, data] of [
  ['legacy populated wrapper', { list: [order()], total: 1 }],
  ['legacy empty wrapper', { list: [], total: 0 }],
  ['null data', null],
  ['missing data', undefined],
  ['missing order items', [order({ items: undefined })]],
]) {
  test(`${label} shows an error instead of an empty success`, async () => {
    const { resource, auth } = await mount({ adapter: (config) => reply(config, ok(data)) })
    assert.equal(resource.state.value, 'error')
    assert.equal(resource.data.value, null)
    assert.equal(auth.isAuthenticated, true)
  })
}
test('list ignores legacy page URLs and preserves only status through navigation', async () => {
  const { resource, router } = await mount({ path: '/orders?status=bad&page=-2' })
  assert.equal(resource.status.value, undefined)
  assert.deepEqual(requests[0].params, {})
  await resource.changeStatus('PENDING_RECEIPT')
  await flush()
  assert.deepEqual(router.currentRoute.value.query, { status: 'PENDING_RECEIPT' })
  assert.deepEqual(resource.listQuery.value, { status: 'PENDING_RECEIPT' })
  assert.deepEqual(requests.at(-1).params, { status: 'PENDING_RECEIPT' })
  await resource.changeStatus(undefined)
  await flush()
  assert.deepEqual(router.currentRoute.value.query, {})
})
test('legacy page params load all orders once and changing page alone never refetches', async () => {
  const orders = Array.from({ length: 7 }, (_, index) => order({ orderNo: `JW${index + 1}` }))
  const { resource, router } = await mount({
    path: '/orders?page=9',
    adapter: async (config) => reply(config, ok(orders)),
  })
  assert.equal(resource.state.value, 'success')
  assert.equal(resource.data.value.length, 7)
  assert.deepEqual(
    requests.map((r) => r.params),
    [{}],
  )
  assert.deepEqual(resource.listQuery.value, {})
  await router.push('/orders?page=2')
  await flush()
  assert.equal(requests.length, 1)
})
test('switching filters ignores an old slow response and clears old data immediately', async () => {
  let finish
  const { resource } = await mount({
    adapter: (config) =>
      config.params.status
        ? reply(config, ok([]))
        : new Promise((resolve) => {
            finish = () => resolve(reply(config, ok([order()])))
          }),
  })
  await resource.changeStatus('COMPLETED')
  await flush()
  finish()
  await flush()
  assert.equal(resource.state.value, 'empty')
  assert.deepEqual(resource.data.value, [])
})
test('switching accounts cannot accept a response from the old account', async () => {
  let finish
  const { resource, auth } = await mount({
    adapter: (config) =>
      config.headers.get('Authorization') === 'Bearer order-token'
        ? new Promise((resolve) => {
            finish = () => resolve(reply(config, ok([order()])))
          })
        : reply(config, ok([])),
  })
  saveSession('other-token')
  auth.getAuthorization()
  await flush()
  finish()
  await flush()
  assert.equal(resource.state.value, 'empty')
  assert.deepEqual(resource.data.value, [])
})
test('detail reloads on order number navigation and ignores old detail responses', async () => {
  let finish
  const { resource, router } = await mount({
    path: '/orders/JW202610160001?status=COMPLETED&page=2',
    adapter: (config) =>
      config.url.endsWith('/JW202610160001')
        ? new Promise((resolve) => {
            finish = () => resolve(reply(config, ok(order({ orderNo: 'JW202610160001' }))))
          })
        : reply(config, ok(order({ orderNo: 'JW202610160002' }))),
  })
  await router.push('/orders/JW202610160002?status=COMPLETED&page=2')
  await flush()
  finish()
  await flush()
  assert.equal(resource.data.value.orderNo, 'JW202610160002')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/orders/JW202610160001', '/api/orders/JW202610160002'],
  )
  assert.deepEqual(resource.listLocation.value.query, { status: 'COMPLETED' })
})
test('retry recovers from errors without logging out', async () => {
  let failed = true
  const { resource, auth } = await mount({
    adapter: (config) => {
      if (failed) throw new Error('offline')
      return reply(config, ok([order()]))
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
    assert.equal((await queryOrder(order().orderNo)).recipient.phone, masked)
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
    await assert.rejects(queryOrder(order().orderNo), { name: 'OrderResponseError' })
  }
  respond(order({ createdAt: '2024-02-29T02:00:00+08:00' }))
  assert.equal((await queryOrder(order().orderNo)).createdAt, '2024-02-29T02:00:00+08:00')
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
    await assert.rejects(queryOrder(order().orderNo), { name: 'OrderResponseError' })
  }
})
