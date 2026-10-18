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
    plugins: [plugin(scenario)],
    server: { host: '127.0.0.1', port: 0, hmr: false, ws: false },
    appType: 'custom',
  })
  servers.push(server)
  await server.listen()
  const base = server.resolvedUrls.local[0]
  return (path, authenticated = true) =>
    fetch(new URL(path, base), {
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
