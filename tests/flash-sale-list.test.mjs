import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { createRenderer } from 'vue'

let server, http, configureAuth, useAuthStore, useFlashSaleList, createPinia, fixture
const entries = new Map()
const user = { id: 'sale-user', account: 'sale-user', nickname: '秒杀用户', role: 1 }
const loginData = { accessToken: 'sale-token', tokenType: 'Bearer', expiresIn: 3600, user }
const card = {
  id: '9223372036854775806',
  name: '测量仪器',
  model: 'RTK-1',
  coverUrl: 'https://example.test/instrument.webp',
  price: 100,
  seckillStartTime: '2026-10-22 16:00:53.581',
  seckillEndTime: '2026-10-30T16:04:01',
}
const reply = (config, data) => ({ data, status: 200, statusText: 'OK', headers: {}, config })
const flush = () => new Promise((resolve) => setImmediate(resolve))

before(async () => {
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/flash-sale' },
  })
  server = await createServer({
    configFile: false,
    define: {
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(''),
      'import.meta.env.VITE_FLASH_SALE_DEMO': JSON.stringify('false'),
    },
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  ;({ useFlashSaleList } = await server.ssrLoadModule('/src/composables/useFlashSaleList.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
})
beforeEach(() => entries.clear())
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

async function mount({
  authenticated = true,
  response = { code: 200, data: [card] },
  adapter,
} = {}) {
  if (authenticated)
    entries.set(
      'nesmartmall.auth',
      JSON.stringify({ ...loginData, expiresAt: Date.now() + 3600_000 }),
    )
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  const requests = []
  http.defaults.adapter = async (config) => {
    requests.push(config)
    if (config.url === '/api/auth/login') return reply(config, { code: 200, data: loginData })
    return adapter ? adapter(config) : reply(config, response)
  }
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let list
  const app = renderer.createApp({
    setup() {
      list = useFlashSaleList()
      return () => null
    },
  })
  app.use(pinia)
  fixture = { app, auth, requests }
  app.mount({})
  await flush()
  return { ...fixture, list }
}

test('entering the authenticated sale page sends one Bearer GET with no body and adapts all carousel data', async () => {
  const { requests, list } = await mount()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/seckill/products')
  assert.equal(requests[0].method, 'get')
  assert.equal(requests[0].data, undefined)
  assert.equal(requests[0].params, undefined)
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer sale-token')
  assert.equal(list.state.value, 'success')
  assert.deepEqual(list.products.value, [
    {
      id: '9223372036854775806',
      name: '测量仪器',
      model: 'RTK-1',
      imageUrl: 'https://example.test/instrument.webp',
      priceFen: 100,
      startsAtMs: Date.UTC(2026, 9, 22, 8, 0, 53, 581),
      endsAtMs: Date.UTC(2026, 9, 30, 8, 4, 1),
    },
  ])
})

test('countdown time passing does not refetch while an explicit retry sends one more list GET', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout', 'setInterval'], now: Date.now() })
  const { requests, list } = await mount()
  context.mock.timers.tick(12_000)
  await flush()
  assert.equal(requests.length, 1)
  await list.retry()
  assert.equal(requests.length, 2)
  assert.ok(requests.every((request) => request.url === '/api/seckill/products'))
})

test('anonymous entry waits for login then loads once, and logout clears the list without another request', async () => {
  const { requests, list, auth } = await mount({ authenticated: false })
  assert.equal(list.state.value, 'login-required')
  assert.equal(requests.length, 0)
  await auth.signIn({ account: 'sale-user', password: 'test-only' })
  await flush()
  assert.equal(list.state.value, 'success')
  assert.equal(requests.filter((request) => request.url === '/api/seckill/products').length, 1)
  auth.logout()
  await flush()
  assert.equal(list.state.value, 'login-required')
  assert.deepEqual(list.products.value, [])
  assert.equal(requests.length, 2)
})

test('an empty list remains an empty success rather than a request failure', async () => {
  const { requests, list } = await mount({ response: { code: 200, data: [] } })
  assert.equal(requests.length, 1)
  assert.equal(list.state.value, 'empty')
})

for (const [code, expected] of [
  [401, 'login-required'],
  [403, 'forbidden'],
  [500, 'error'],
]) {
  test(`business ${code} retains its state without ordinary-product or demo fallback`, async () => {
    const { requests, list } = await mount({ response: { code, message: '请求失败' } })
    assert.equal(requests.length, 1)
    assert.equal(requests[0].url, '/api/seckill/products')
    assert.equal(list.state.value, expected)
    assert.deepEqual(list.products.value, [])
  })
}

test('leaving the sale page aborts the list request and ignores its late response', async () => {
  let finish
  const { app, requests, list } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        finish = () => resolve(reply(config, { code: 200, data: [card] }))
      }),
  })
  assert.equal(requests.length, 1)
  app.unmount()
  assert.equal(requests[0].signal.aborted, true)
  finish()
  await flush()
  assert.deepEqual(list.products.value, [])
})
