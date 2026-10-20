import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
let loader, plugin
const servers = []
before(async () => {
  loader = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ orderMockPlugin: plugin } = await loader.ssrLoadModule('/dev/orderMock.ts'))
})
after(async () => {
  await Promise.all(servers.map((s) => s.close()))
  await loader?.close()
})
async function start(scenario) {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [plugin(scenario, { transactions: true })],
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
    appType: 'custom',
  })
  servers.push(server)
  await server.listen()
  const base = server.resolvedUrls.local[0]
  return (path, authenticated = true, options = {}) =>
    fetch(new URL(path, base), {
      ...options,
      headers: authenticated ? { Authorization: 'Bearer local-fixture' } : {},
    })
}
test('explicit development mock serves the full authenticated list and matching detail snapshots', async () => {
  const get = await start('normal')
  assert.equal((await get('/api/orders', false)).status, 401)
  const all = await (await get('/api/orders')).json()
  assert.equal(all.data.length, 7)
  assert.ok(Array.isArray(all.data))
  assert.equal(all.data[0].items.length, 2)
  assert.deepEqual(
    all.data.map((o) => o.orderNo),
    [
      'JW202610160001',
      'JW202610150002',
      'JW202610140003',
      'JW202610130004',
      'JW202610120005',
      'JW202610110006',
      'JW202610100007',
    ],
  )
  const legacy = await (await get('/api/orders?pageNum=2&pageSize=5')).json()
  assert.deepEqual(legacy.data, all.data)
  const filtered = await (await get('/api/orders?status=COMPLETED')).json()
  assert.equal(filtered.data.length, 2)
  assert.ok(filtered.data.every((o) => o.status === 'COMPLETED'))
  const detail = await (await get(`/api/orders/${all.data[0].orderNo}`)).json()
  const { orderNo, status, createdAt, payableAmountFen, items } = detail.data
  assert.deepEqual({ orderNo, status, createdAt, payableAmountFen, items }, all.data[0])
  assert.ok(all.data.every((order) => !Object.hasOwn(order, 'id')))
  assert.equal(Object.hasOwn(detail.data, 'id'), false)
  assert.equal(all.data[0].recipient, undefined)
  assert.equal(all.data[0].paidAt, undefined)
  assert.ok(detail.data.recipient)
  assert.equal(detail.data.goodsAmountFen, 1327900)
  const shippedDetail = await (await get(`/api/orders/${all.data[1].orderNo}`)).json()
  assert.deepEqual(shippedDetail.data.logistics, { trackingNo: 'DEMO202610150002' })
  assert.equal(shippedDetail.data.shippedAt, '2026-10-15T03:00:00Z')
  assert.equal((await get('/api/orders/JW999')).status, 404)
  assert.equal((await get('/api/orders/1')).status, 404)
  assert.equal((await get('/api/orders?status=bad')).status, 400)
})
test('mock failure modes preserve empty, permission, unavailable, error and malformed differences', async () => {
  for (const [scenario, status] of [
    ['empty', 200],
    ['forbidden', 403],
    ['unavailable', 503],
    ['error', 500],
    ['malformed', 200],
  ]) {
    const get = await start(scenario),
      response = await get('/api/orders')
    assert.equal(response.status, status)
    const body = await response.json()
    if (scenario === 'empty') assert.deepEqual(body.data, [])
    if (scenario === 'malformed') assert.ok(!Array.isArray(body.data))
  }
})

const intent = {
  items: [
    { productId: '9007199254740993123', quantity: 2 },
    { productId: '44', quantity: 1 },
  ],
  recipient: { name: '模拟验收', phone: '13800138000', address: '虚构验收地址' },
}
const post = (data) => ({ method: 'POST', body: JSON.stringify(data) })
test('explicit mock creates authoritative snapshots, preserves carts, pays idempotently and isolates accounts', async () => {
  const request = await start('normal')
  const created = await (await request('/api/orders', true, post(intent))).json()
  assert.equal(created.message, 'OK')
  assert.deepEqual(Object.keys(created.data).sort(), ['orderNo', 'payableAmountFen'])
  assert.equal(created.data.payableAmountFen, 270000)
  const orderNo = created.data.orderNo
  const path = `/api/orders/${orderNo}`
  const detail = (await (await request(path)).json()).data
  assert.equal(detail.orderNo, orderNo)
  assert.equal(detail.status, 'PENDING_PAYMENT')
  assert.equal(detail.items[0].unitPriceFen, 134400)
  assert.equal(Date.parse(detail.payExpireAt) - Date.parse(detail.createdAt), 900000)
  const paid = await (await request(`${path}/pay`, true, { method: 'POST' })).json()
  assert.equal(paid.data.status, 'PENDING_SHIPMENT')
  assert.equal(paid.data.paidAmountFen, 270000)
  assert.equal(paid.data.canPay, false)
  const again = await (await request(`${path}/pay`, true, { method: 'POST' })).json()
  assert.equal(again.data.paidAt, paid.data.paidAt)
  assert.equal((await request(`${path}/pay`, false, { method: 'POST' })).status, 401)
  const zero = await (
    await request(
      '/api/orders',
      true,
      post({ ...intent, items: [{ productId: '44', quantity: 1 }] }),
    )
  ).json()
  assert.equal(zero.data.payableAmountFen, 0)
  assert.equal((await request('/api/orders', true, post({ ...intent, userId: '1' }))).status, 400)
  assert.equal(
    (
      await request(
        '/api/orders',
        true,
        post({ ...intent, items: [{ productId: '43', quantity: 99 }] }),
      )
    ).status,
    400,
  )
})
test('mock unknown results persist committed orders and expiry never hides unpaid orders', async () => {
  for (const scenario of ['create-unknown', 'create-malformed', 'pay-unknown', 'expired']) {
    const request = await start(scenario)
    const response = await request('/api/orders', true, post(intent))
    assert.equal(response.status, scenario === 'create-unknown' ? 500 : 200)
    const all = await (await request('/api/orders')).json()
    const latest = all.data[0]
    const detail = await (await request(`/api/orders/${latest.orderNo}`)).json()
    assert.equal(detail.data.recipient.name, '模拟验收')
    if (scenario === 'expired') {
      assert.equal(detail.data.status, 'PENDING_PAYMENT')
      assert.equal(detail.data.displayStatus, 'PAYMENT_EXPIRED')
      assert.equal(detail.data.cancelledAt, null)
      assert.equal(detail.data.canPay, false)
      assert.equal(
        (await request(`/api/orders/${latest.orderNo}/pay`, true, { method: 'POST' })).status,
        409,
      )
    }
    if (scenario === 'pay-unknown') {
      assert.equal(
        (await request(`/api/orders/${latest.orderNo}/pay`, true, { method: 'POST' })).status,
        500,
      )
      assert.equal(
        (await (await request(`/api/orders/${latest.orderNo}`)).json()).data.status,
        'PENDING_SHIPMENT',
      )
    }
  }
})

test('order-only mock cannot create transactions from a real cart', async () => {
  const server = await createServer({
    configFile: false,
    optimizeDeps: { noDiscovery: true, include: [] },
    plugins: [plugin('normal')],
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
    appType: 'custom',
  })
  servers.push(server)
  await server.listen()
  const response = await fetch(new URL('/api/orders', server.resolvedUrls.local[0]), {
    ...post(intent),
    headers: { Authorization: 'Bearer local-fixture' },
  })
  assert.equal(response.status, 404)
})
