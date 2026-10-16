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
test('explicit development mock serves authenticated list pagination and matching detail snapshots', async () => {
  const get = await start('normal')
  assert.equal((await get('/api/orders', false)).status, 401)
  const first = await (await get('/api/orders?pageNum=1&pageSize=5')).json()
  assert.equal(first.data.list.length, 5)
  assert.equal(first.data.total, 7)
  const second = await (await get('/api/orders?pageNum=2&pageSize=5')).json()
  assert.equal(second.data.list.length, 2)
  const filtered = await (await get('/api/orders?status=COMPLETED&pageNum=1&pageSize=5')).json()
  assert.equal(filtered.data.total, 2)
  assert.ok(filtered.data.list.every((o) => o.status === 'COMPLETED'))
  const detail = await (await get(`/api/orders/${first.data.list[0].id}`)).json()
  assert.deepEqual(detail.data, first.data.list[0])
  assert.equal((await get('/api/orders/999')).status, 404)
  assert.equal((await get('/api/orders?pageNum=bad')).status, 400)
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
      response = await get('/api/orders?pageNum=1&pageSize=5')
    assert.equal(response.status, status)
    const body = await response.json()
    if (scenario === 'empty') assert.deepEqual(body.data.list, [])
    if (scenario === 'malformed') assert.equal(body.data.list, null)
  }
})
