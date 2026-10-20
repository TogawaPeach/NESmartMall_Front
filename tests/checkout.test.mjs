import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test, mock } from 'node:test'
import { createServer } from 'vite'
import { createRenderer, ref } from 'vue'
import { AxiosError } from 'axios'

let server,
  http,
  configureAuth,
  createPinia,
  useAuthStore,
  useCheckoutPayment,
  useOrderPayment,
  fixture
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
  ;({ useOrderPayment } = await server.ssrLoadModule('/src/composables/useOrderPayment.ts'))
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
  fixture?.pinia._s.forEach((store) => store.$dispose())
  fixture = undefined
  mock.restoreAll()
  mock.timers.reset()
})
after(async () => {
  await server?.close()
  delete globalThis.localStorage
  delete globalThis.sessionStorage
  delete globalThis.window
})
async function mount(authenticated = true, refreshCart, orderPayment = false) {
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
      if (orderPayment) {
        const order = ref(null)
        const actions = useOrderPayment(order)
        payment = {
          ...actions,
          order,
          refreshOrder: actions.refresh,
          async requestConfirmation() {
            await actions.refresh('JW202610190001')
            actions.confirmVisible.value = true
          },
        }
      } else {
        payment = useCheckoutPayment(visible, () => selected.value, refreshCart)
      }
      return () => null
    },
  })
  app.use(pinia)
  app.mount({})
  fixture = { app, auth, pinia }
  return { app, auth, visible, selected, payment }
}

const recipient = { name: ' 张三 ', phone: '13800138000', address: ' 上海市浦东新区测试路 1 号 ' }
const snapshot = (overrides = {}) => {
  const now = Date.now()
  return {
    orderNo: 'JW202610190001',
    status: 'PENDING_PAYMENT',
    createdAt: new Date(now).toISOString(),
    paidAt: null,
    shippedAt: null,
    completedAt: null,
    cancelledAt: null,
    items: [
      {
        id: '1',
        productId: '43',
        name: '服务端快照',
        model: null,
        coverUrl: null,
        unitPriceFen: 0,
        quantity: 3,
      },
    ],
    goodsAmountFen: 0,
    shippingFeeFen: 100,
    discountAmountFen: 0,
    payableAmountFen: 100,
    paidAmountFen: null,
    recipient,
    logistics: null,
    payExpireAt: new Date(now + 900000).toISOString(),
    serverTime: new Date(now).toISOString(),
    canPay: true,
    displayStatus: 'PENDING_PAYMENT',
    cancelReason: null,
    ...overrides,
  }
}
function respondOrder(data = snapshot()) {
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return { ...reply(config, []), data: { code: 200, message: 'OK', data } }
  }
}
async function ready() {
  const result = await mount()
  Object.assign(result.payment.recipient.value, recipient)
  respondOrder()
  return result
}

// Exercise the existing order-page payment flow independently of order creation.
async function readyPayment() {
  const result = await mount(true, undefined, true)
  respondOrder()
  return result
}

test('opening receipt and invalid recipient never writes; create uses selected IDs and recipient only', async () => {
  const { payment } = await mount()
  assert.equal(requests.length, 0)
  await payment.requestConfirmation()
  assert.equal(requests.length, 0)
  assert.ok(payment.error.value)
  Object.assign(payment.recipient.value, recipient)
  respondOrder()
  await payment.requestConfirmation()
  assert.equal(requests.length, 1)
  const request = requests[0]
  assert.equal(request.method, 'post')
  assert.equal(request.url, '/api/orders')
  assert.deepEqual(JSON.parse(request.data), {
    items: [
      { productId: '9007199254740993123', quantity: 2 },
      { productId: '43', quantity: 1 },
    ],
    recipient: { name: '张三', phone: recipient.phone, address: '上海市浦东新区测试路 1 号' },
  })
  assert.equal(request.headers.has('Idempotency-Key'), false)
  assert.equal(request.headers.get('Authorization'), 'Bearer checkout-token')
  assert.equal(payment.order.value.payableAmountFen, 100)
  assert.equal(payment.confirmVisible.value, true)
})

test('creation locks duplicate clicks; closing and selection cleanup preserve frozen order', async () => {
  const { payment, visible, selected } = await ready()
  let release
  http.defaults.adapter = (config) => {
    requests.push(config)
    return new Promise((resolve) => {
      release = () =>
        resolve({ ...reply(config, []), data: { code: 200, message: 'OK', data: snapshot() } })
    })
  }
  const pending = payment.requestConfirmation()
  await flush()
  await payment.requestConfirmation()
  visible.value = false
  selected.value = []
  release()
  await pending
  visible.value = true
  payment.cancel()
  respondOrder()
  await payment.requestConfirmation()
  assert.equal(requests.filter((r) => r.method === 'post').length, 1)
  assert.equal(payment.order.value.orderNo, 'JW202610190001')
  assert.equal(payment.confirmVisible.value, true)
})

test('creation without payment eligibility fields opens confirmation with server order number and amount', async () => {
  const { payment } = await ready()
  const data = snapshot({
    orderNo: 'JW1980123456789012300',
    payableAmountFen: 990,
    shippingFeeFen: 990,
  })
  for (const key of ['payExpireAt', 'serverTime', 'canPay', 'displayStatus', 'cancelReason'])
    delete data[key]
  respondOrder(data)

  await payment.requestConfirmation()

  assert.equal(payment.stage.value, 'created')
  assert.equal(payment.confirmVisible.value, true)
  assert.equal(payment.order.value.orderNo, 'JW1980123456789012300')
  assert.equal(payment.order.value.payableAmountFen, 990)
  assert.equal(requests.length, 1)
})

test('current backend response with only payExpireAt opens confirmation instead of unknown result', async () => {
  const { payment } = await ready()
  const data = snapshot({
    orderNo: 'JW1980123456789012301',
    shippingFeeFen: 14700,
    payableAmountFen: 14700,
  })
  for (const key of ['serverTime', 'canPay', 'displayStatus', 'cancelReason']) delete data[key]
  respondOrder(data)

  await payment.requestConfirmation()

  assert.equal(payment.stage.value, 'created')
  assert.equal(payment.confirmVisible.value, true)
  assert.equal(payment.order.value.orderNo, 'JW1980123456789012301')
  assert.equal(payment.order.value.payableAmountFen, 14700)
  assert.equal(payment.error.value, '')
  assert.deepEqual(Object.keys(payment.order.value).sort(), ['orderNo', 'payableAmountFen'])
})

for (const failure of ['network', 'timeout', '500', 'malformed']) {
  test(`unknown create ${failure} cannot replay after closing and reopening`, async () => {
    const { payment, visible } = await ready()
    http.defaults.adapter = async (config) => {
      requests.push(config)
      if (failure === 'malformed')
        return { ...reply(config, []), data: { code: 200, message: 'OK', data: {} } }
      throw new AxiosError(
        failure,
        failure === 'timeout' ? 'ECONNABORTED' : 'ERR_NETWORK',
        config,
        null,
        failure === '500' ? { ...reply(config, []), status: 500 } : undefined,
      )
    }
    await payment.requestConfirmation()
    assert.equal(payment.stage.value, 'unknown')
    assert.equal(payment.error.value, '下单结果暂未确认，请刷新购物车并查看‘我的订单’。')
    visible.value = false
    visible.value = true
    respondOrder()
    await payment.requestConfirmation()
    payment.newPurchase()
    await payment.requestConfirmation()
    assert.equal(requests.length, 1)
    assert.equal(payment.order.value, null)
  })
}

test('zero-yuan payment uses /pay without body and only explicit paid response succeeds', async () => {
  const { payment, visible } = await readyPayment()
  respondOrder(snapshot({ shippingFeeFen: 0, payableAmountFen: 0 }))
  await payment.requestConfirmation()
  respondOrder(
    snapshot({
      shippingFeeFen: 0,
      payableAmountFen: 0,
      paidAmountFen: 0,
      paidAt: new Date().toISOString(),
      status: 'PENDING_SHIPMENT',
      canPay: false,
      displayStatus: 'PENDING_SHIPMENT',
    }),
  )
  await payment.confirm()
  assert.equal(payment.paid.value, true)
  assert.equal(requests.find((r) => r.method === 'post').url, '/api/orders/JW202610190001/pay')
  assert.equal(requests.find((r) => r.method === 'post').data, undefined)
  visible.value = false
  visible.value = true
  assert.equal(payment.paid.value, true)
})

test('unknown payment queries by known orderNo; failed recovery never shows paid or creates again', async () => {
  const { payment } = await readyPayment()
  await payment.requestConfirmation()
  http.defaults.adapter = async (config) => {
    requests.push(config)
    throw new AxiosError('offline', 'ERR_NETWORK', config)
  }
  await payment.confirm()
  assert.equal(payment.paid.value, false)
  assert.match(payment.paymentError.value, /支付结果暂未确认/)
  assert.deepEqual(
    requests.slice(1).map((r) => [r.method, r.url]),
    [
      ['post', '/api/orders/JW202610190001/pay'],
      ['get', '/api/orders/JW202610190001'],
    ],
  )
  await payment.requestConfirmation()
  assert.equal(requests.filter((r) => r.url === '/api/orders' && r.method === 'post').length, 0)
})

test('expired and legacy orders stay queryable but cannot pay', async () => {
  const { payment } = await readyPayment()
  const expired = snapshot({
    serverTime: '2026-10-19T00:16:00Z',
    createdAt: '2026-10-19T00:00:00Z',
    payExpireAt: '2026-10-19T00:15:00Z',
    canPay: false,
    displayStatus: 'PAYMENT_EXPIRED',
  })
  respondOrder(expired)
  await payment.requestConfirmation()
  assert.equal(payment.canPay.value, false)
  assert.equal(payment.paymentNotice.value, '支付已超时，订单关闭处理中')
  await payment.confirm()
  assert.equal(requests.length, 1)
  const { queryOrder } = await server.ssrLoadModule('/src/api/orders.ts')
  const legacy = snapshot()
  for (const key of ['payExpireAt', 'serverTime', 'canPay', 'displayStatus', 'cancelReason'])
    delete legacy[key]
  respondOrder(legacy)
  assert.equal((await queryOrder(legacy.orderNo)).canPay, undefined)
})

test('account switch isolates pending creation and clears recipient and old order', async () => {
  const { payment, auth } = await ready()
  let release
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () =>
        resolve({ ...reply(config, []), data: { code: 200, message: 'OK', data: snapshot() } })
    })
  const pending = payment.requestConfirmation()
  await flush()
  saveSession('other-token')
  auth.getAuthorization()
  release()
  await pending
  assert.equal(payment.order.value, null)
  assert.equal(payment.stage.value, 'draft')
  assert.equal(payment.recipient.value.name, '')
})

test('create response validates only order number and a nonnegative safe integer amount', async () => {
  const { createOrder, prepareCreateOrder } = await server.ssrLoadModule('/src/api/orders.ts')
  assert.equal(typeof createOrder, 'function')
  const intent = { items: [{ productId: '43', quantity: 1 }], recipient }
  for (const data of [
    {},
    { orderNo: 'JW123' },
    { payableAmountFen: 100 },
    { orderNo: 'bad', payableAmountFen: 100 },
    { orderNo: 'JW123', payableAmountFen: -1 },
    { orderNo: 'JW123', payableAmountFen: 1.5 },
    { orderNo: 'JW123', payableAmountFen: '100' },
    { orderNo: 'JW123', payableAmountFen: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    respondOrder(data)
    await assert.rejects(createOrder(intent))
  }
  for (const change of [
    { name: ' ' },
    { name: 'a'.repeat(101) },
    { phone: 'bad' },
    { phone: '1'.repeat(33) },
    { address: ' ' },
    { address: 'a'.repeat(501) },
  ]) {
    assert.throws(() => prepareCreateOrder({ ...intent, recipient: { ...recipient, ...change } }))
  }
  assert.throws(() =>
    prepareCreateOrder({
      ...intent,
      items: [
        { productId: '43', quantity: 1 },
        { productId: '43', quantity: 1 },
      ],
    }),
  )
})

test('cart refresh failure never undoes creation or permits a second create', async () => {
  let refreshed = 0
  const { payment } = await mount(true, async () => {
    refreshed++
    throw new Error('cart unavailable')
  })
  Object.assign(payment.recipient.value, recipient)
  respondOrder()
  await payment.requestConfirmation()
  assert.equal(refreshed, 1)
  assert.equal(payment.stage.value, 'created')
  assert.equal(requests.length, 1)
})

test('malformed payment result can only recover through matching GET', async () => {
  const { payment } = await readyPayment()
  await payment.requestConfirmation()
  const paid = snapshot({
    status: 'PENDING_SHIPMENT',
    paidAmountFen: 100,
    paidAt: new Date().toISOString(),
    canPay: false,
    displayStatus: 'PENDING_SHIPMENT',
  })
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return {
      ...reply(config, []),
      data: {
        code: config.method === 'post' ? undefined : 200,
        message: 'OK',
        data: paid,
      },
    }
  }
  await payment.confirm()
  assert.equal(payment.paid.value, true)
  assert.equal(payment.order.value.orderNo, 'JW202610190001')
  assert.equal(requests.at(-1).method, 'get')
})

for (const status of [400, 409, 401, 403, 404, 405]) {
  test(`explicit create ${status} shows rejection or unavailable without unknown success`, async () => {
    const { payment } = await ready()
    http.defaults.adapter = async (config) => {
      requests.push(config)
      return {
        ...reply(config, []),
        status,
        data: { code: status, message: 'refused', data: null },
      }
    }
    await payment.requestConfirmation()
    assert.equal(payment.order.value, null)
    assert.notEqual(payment.stage.value, 'unknown')
    if (status === 404 || status === 405) assert.match(payment.error.value, /暂未开放/)
  })
}

test('explicit /pay unavailability is visible instead of silently enabling another attempt', async () => {
  const { payment } = await readyPayment()
  await payment.requestConfirmation()
  http.defaults.adapter = async (config) => {
    requests.push(config)
    if (config.method === 'post')
      throw new AxiosError('404', 'ERR_BAD_REQUEST', config, null, {
        ...reply(config, []),
        status: 404,
      })
    return { ...reply(config, []), data: { code: 200, message: 'OK', data: snapshot() } }
  }
  await payment.confirm()
  assert.equal(payment.paid.value, false)
  assert.match(payment.paymentError.value, /暂未开放/)
})

test('create ignores unrelated detail fields but still requires message OK', async () => {
  const { createOrder } = await server.ssrLoadModule('/src/api/orders.ts')
  const input = { items: [{ productId: '43', quantity: 1 }], recipient }
  respondOrder(snapshot({ items: [], recipient: null, status: 'irrelevant' }))
  assert.deepEqual(await createOrder(input), { orderNo: 'JW202610190001', payableAmountFen: 100 })
  http.defaults.adapter = async (config) => ({
    ...reply(config, []),
    data: { code: 200, message: 'not OK', data: snapshot() },
  })
  await assert.rejects(createOrder(input))
})

test('old closed receipt cannot dismiss a new account payment confirmation on late response', async () => {
  const { payment, auth, visible } = await ready()
  let release
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      release = () =>
        resolve({ ...reply(config, []), data: { code: 200, message: 'OK', data: snapshot() } })
    })
  const old = payment.requestConfirmation()
  await flush()
  visible.value = false
  saveSession('new-account')
  auth.getAuthorization()
  const { useCheckoutStore } = await server.ssrLoadModule('/src/stores/checkout.ts')
  const store = useCheckoutStore(fixture.pinia)
  Object.assign(store.recipient, recipient)
  respondOrder(snapshot({ orderNo: 'JW888' }))
  await store.create([{ productId: '43', quantity: 1 }])
  assert.equal(store.confirmVisible, true)
  release()
  await old
  assert.equal(store.order.orderNo, 'JW888')
  assert.equal(store.confirmVisible, true)
})

test('unmounting receipt preserves unknown result for another consumer in the same account', async () => {
  const { payment, app } = await ready()
  http.defaults.adapter = async (config) => {
    requests.push(config)
    throw new AxiosError('offline', 'ERR_NETWORK', config)
  }
  await payment.requestConfirmation()
  app.unmount()
  const { useCheckoutStore } = await server.ssrLoadModule('/src/stores/checkout.ts')
  const store = useCheckoutStore(fixture.pinia)
  await store.create([{ productId: '43', quantity: 1 }])
  assert.equal(store.stage, 'unknown')
  assert.equal(requests.length, 1)
})

test('server countdown expires exactly once, queries original order and never fabricates cancellation', async () => {
  let monotonic = 0
  mock.method(performance, 'now', () => monotonic)
  mock.timers.enable({ apis: ['setInterval'] })
  const { payment } = await readyPayment()
  const serverTime = '2026-10-19T00:14:59Z'
  const expiry = {
    createdAt: '2026-10-19T00:00:00Z',
    serverTime,
    payExpireAt: '2026-10-19T00:15:00Z',
  }
  respondOrder(snapshot(expiry))
  await payment.requestConfirmation()
  assert.equal(payment.canPay.value, true)
  assert.match(payment.paymentNotice.value, /00:01/)
  respondOrder(
    snapshot({
      ...expiry,
      serverTime: '2026-10-19T00:15:00Z',
      canPay: false,
      displayStatus: 'PAYMENT_EXPIRED',
    }),
  )
  monotonic = 1000
  mock.timers.tick(1000)
  await flush()
  assert.equal(payment.canPay.value, false)
  assert.equal(payment.paymentNotice.value, '支付已超时，订单关闭处理中')
  assert.equal(payment.order.value.status, 'PENDING_PAYMENT')
  assert.equal(payment.order.value.cancelledAt, null)
  await payment.confirm()
  monotonic = 6000
  mock.timers.tick(5000)
  await flush()
  assert.equal(requests.filter((r) => r.method === 'get').length, 2)
  assert.equal(requests.filter((r) => r.url.endsWith('/pay')).length, 0)
})

for (const action of ['create', 'pay']) {
  test(`account switch before Axios interceptor prevents old ${action} request using new Bearer`, async () => {
    const { payment, auth } = action === 'pay' ? await readyPayment() : await ready()
    if (action === 'pay') await payment.requestConfirmation()
    const count = requests.length
    const pending = action === 'create' ? payment.requestConfirmation() : payment.confirm()
    saveSession('interceptor-new-account')
    auth.getAuthorization()
    await pending
    assert.equal(requests.length, count)
    assert.equal(payment.order.value, null)
  })
}

test('stale explicit order refresh cannot use a newly switched account', async () => {
  const { payment, auth } = await readyPayment()
  await payment.requestConfirmation()
  const known = payment.order.value.orderNo
  const count = requests.length
  saveSession('new-query-account')
  await payment.refreshOrder(known)
  assert.equal(auth.accessToken, 'new-query-account')
  assert.equal(requests.length, count)
  assert.equal(payment.order.value, null)
})

for (const payableAmountFen of [0, 13440]) {
  test(`minimal creation result opens result dialog with amount ${payableAmountFen} and reopens without requests`, async () => {
    const { payment, visible } = await ready()
    const result = { orderNo: 'JW1980123456789012345', payableAmountFen }
    respondOrder(result)
    await payment.requestConfirmation()
    assert.equal(payment.stage.value, 'created')
    assert.deepEqual(payment.order.value, result)
    assert.equal(payment.confirmVisible.value, true)
    payment.cancel()
    visible.value = false
    visible.value = true
    await payment.requestConfirmation()
    assert.equal(payment.confirmVisible.value, true)
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/api/orders')
  })
}

test('payment API accepts empty success data and ignores legacy detail without requiring an order snapshot', async () => {
  const { payOrder } = await server.ssrLoadModule('/src/api/orders.ts')
  await readyPayment()
  for (const data of [null, undefined, snapshot()]) {
    respondOrder(data)
    await assert.doesNotReject(payOrder('JW202610190001'))
    assert.equal(requests.at(-1).url, '/api/orders/JW202610190001/pay')
    assert.equal(requests.at(-1).method, 'post')
    assert.equal(requests.at(-1).data, undefined)
    assert.equal(requests.at(-1).headers.get('Authorization'), 'Bearer checkout-token')
  }
})

test('order payment without legacy eligibility fields accepts success then refreshes matching order', async () => {
  const { payment } = await readyPayment()
  const legacy = snapshot()
  for (const key of ['serverTime', 'canPay', 'displayStatus', 'cancelReason']) delete legacy[key]
  respondOrder(legacy)
  await payment.requestConfirmation()
  assert.equal(payment.canPay.value, true)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return {
      ...reply(config, []),
      data: {
        code: 200,
        message: 'OK',
        data:
          config.method === 'post'
            ? null
            : snapshot({
                status: 'PENDING_SHIPMENT',
                paidAt: new Date().toISOString(),
                paidAmountFen: 100,
                canPay: false,
                displayStatus: 'PENDING_SHIPMENT',
              }),
      },
    }
  }
  await payment.confirm()
  assert.equal(payment.paid.value, true)
  assert.equal(payment.canPay.value, false)
  assert.equal(payment.order.value.status, 'PENDING_SHIPMENT')
  assert.deepEqual(
    requests.slice(1).map((r) => [r.method, r.url]),
    [
      ['post', '/api/orders/JW202610190001/pay'],
      ['get', '/api/orders/JW202610190001'],
    ],
  )
})

for (const checkout of [false, true]) {
  test(`${checkout ? 'checkout' : 'order'} payment success survives refresh failure and prevents another pay`, async () => {
    const { payment } = checkout ? await ready() : await readyPayment()
    if (checkout) respondOrder({ orderNo: 'JW202610190001', payableAmountFen: 0 })
    await payment.requestConfirmation()
    assert.equal(typeof payment.confirm, 'function')
    http.defaults.adapter = async (config) => {
      requests.push(config)
      if (config.method === 'get') throw new AxiosError('offline', 'ERR_NETWORK', config)
      return { ...reply(config, []), data: { code: 200, message: 'OK', data: null } }
    }
    await payment.confirm()
    assert.equal(payment.paid.value, true)
    if (checkout) assert.equal(payment.confirmVisible.value, true)
    assert.equal(payment.uncertain.value, false)
    assert.equal(payment.canPay.value, false)
    assert.match(payment.paymentError.value, /支付成功.*刷新/)
    assert.equal(requests.filter((r) => r.url.endsWith('/pay')).length, 1)
    await payment.confirm()
    if (checkout) {
      payment.cancel()
      await payment.requestConfirmation()
      assert.equal(payment.paid.value, true)
    }
    assert.equal(requests.filter((r) => r.url.endsWith('/pay')).length, 1)
  })
}

test('checkout payment locks duplicate submissions and a new purchase until its result resolves', async () => {
  const { payment } = await ready()
  respondOrder({ orderNo: 'JW202610190001', payableAmountFen: 100 })
  await payment.requestConfirmation()
  assert.equal(typeof payment.confirm, 'function')
  let release
  http.defaults.adapter = (config) => {
    requests.push(config)
    if (config.method === 'get')
      return Promise.reject(new AxiosError('offline', 'ERR_NETWORK', config))
    return new Promise((resolve) => {
      release = () =>
        resolve({
          ...reply(config, []),
          data: { code: 200, message: 'OK', data: null },
        })
    })
  }
  const pending = payment.confirm()
  await flush()
  await payment.confirm()
  payment.newPurchase()
  assert.equal(payment.order.value.orderNo, 'JW202610190001')
  release()
  await pending
  assert.equal(payment.paid.value, true)
  assert.equal(requests.filter((r) => r.url.endsWith('/pay')).length, 1)
})

test('checkout unknown payment survives closing and cannot pay or start a new purchase before querying', async () => {
  const { payment, visible } = await ready()
  await payment.requestConfirmation()
  assert.equal(typeof payment.confirm, 'function')
  http.defaults.adapter = async (config) => {
    requests.push(config)
    throw new AxiosError('offline', 'ERR_NETWORK', config)
  }
  await payment.confirm()
  assert.equal(payment.uncertain.value, true)
  assert.equal(payment.paid.value, false)
  payment.cancel()
  visible.value = false
  visible.value = true
  payment.newPurchase()
  await payment.requestConfirmation()
  await payment.confirm()
  assert.equal(payment.order.value.orderNo, 'JW202610190001')
  assert.equal(requests.filter((r) => r.url.endsWith('/pay')).length, 1)
  assert.equal(requests.filter((r) => r.url === '/api/orders').length, 1)
})

test('late checkout payment success cannot affect a new account order', async () => {
  const { payment, auth } = await ready()
  await payment.requestConfirmation()
  assert.equal(typeof payment.confirm, 'function')
  let release
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      requests.push(config)
      release = () =>
        resolve({ ...reply(config, []), data: { code: 200, message: 'OK', data: null } })
    })
  const pending = payment.confirm()
  await flush()
  saveSession('new-payment-account')
  auth.getAuthorization()
  Object.assign(payment.recipient.value, recipient)
  respondOrder({ orderNo: 'JW888', payableAmountFen: 500 })
  await payment.requestConfirmation()
  release()
  await pending
  assert.equal(payment.order.value.orderNo, 'JW888')
  assert.equal(payment.paid.value, false)
  assert.equal(payment.confirmVisible.value, true)
})

test('business payment rejection with HTTP 200 displays the server reason and never shows success', async () => {
  const { payment } = await readyPayment()
  await payment.requestConfirmation()
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return { ...reply(config, []), data: { code: 409, message: '订单已取消', data: null } }
  }
  await payment.confirm()
  assert.equal(payment.paid.value, false)
  assert.equal(payment.paymentError.value, '订单已取消')
  assert.equal(requests.length, 2)
})
