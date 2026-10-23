import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createRenderer } from 'vue'
import { createServer } from 'vite'

let server, http, configureAuth, useAuthStore, createPinia, useMerchantStats, queryMerchantStats
let fixture
const storage = new Map()
const counts = { allCount: 100, onSaleCount: 75, offShelfCount: 20 }
const user = { id: 'merchant-1', account: 'merchant', nickname: '商家', role: 0 }
const session = (overrides = {}) => ({
  accessToken: 'merchant-token',
  tokenType: 'Bearer',
  expiresAt: Date.now() + 3600_000,
  user,
  ...overrides,
})
const reply = (config, data, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config,
})
const flush = () => new Promise(setImmediate)

before(async () => {
  globalThis.localStorage = {
    getItem: (key) => storage.get(key) ?? null,
    setItem: (key, value) => storage.set(key, value),
    removeItem: (key) => storage.delete(key),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/merchant/products' },
  })
  server = await createServer({
    configFile: false,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ queryMerchantStats } = await server.ssrLoadModule('/src/api/merchantStats.ts'))
  ;({ useMerchantStats } = await server.ssrLoadModule('/src/composables/useMerchantStats.ts'))
})
beforeEach(() => storage.clear())
afterEach(() => {
  fixture?.app.unmount()
  fixture?.auth.logout()
  fixture?.auth.$dispose()
  fixture = undefined
})
after(async () => {
  await server?.close()
  delete globalThis.window
  delete globalThis.localStorage
  delete globalThis.sessionStorage
})

async function mount({ identity = session(), body = { code: 200, data: counts }, adapter } = {}) {
  if (identity) storage.set('nesmartmall.auth', JSON.stringify(identity))
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  const requests = []
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return adapter ? adapter(config) : reply(config, body)
  }
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let stats
  const app = renderer.createApp({
    setup() {
      stats = useMerchantStats()
      return () => null
    },
  })
  app.use(pinia)
  fixture = { app, auth, requests }
  app.mount({})
  await flush()
  return { ...fixture, stats }
}

test('merchant entry makes one Bearer GET without params/body and reads a count object', async () => {
  const { stats, requests } = await mount()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/merchant/products/stats')
  assert.equal(requests[0].method, 'get')
  assert.equal(requests[0].params, undefined)
  assert.equal(requests[0].data, undefined)
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer merchant-token')
  assert.deepEqual(stats.stats.value, counts)
  assert.equal(stats.state.value, 'success')
})

test('zero counts succeed, and off-shelf counts are not derived from all minus on-sale', async () => {
  const { stats } = await mount({
    body: { code: 200, data: { allCount: 0, onSaleCount: 0, offShelfCount: 0 } },
  })
  assert.equal(stats.state.value, 'success')
  assert.deepEqual(stats.stats.value, { allCount: 0, onSaleCount: 0, offShelfCount: 0 })
  http.defaults.adapter = async (config) => reply(config, { code: 200, data: counts })
  await stats.retry()
  assert.equal(stats.stats.value.offShelfCount, 20)
})

test('rejects malformed Result or counts instead of coercing them or fabricating zeros', async () => {
  await mount()
  for (const data of [
    null,
    [],
    0,
    {},
    { ...counts, allCount: undefined },
    { ...counts, onSaleCount: '75' },
    { ...counts, offShelfCount: -1 },
    { ...counts, allCount: 1.5 },
    { ...counts, onSaleCount: Number.MAX_SAFE_INTEGER + 1 },
  ]) {
    http.defaults.adapter = async (config) => reply(config, { code: 200, data })
    await assert.rejects(queryMerchantStats())
  }
  for (const body of [
    null,
    [],
    counts,
    { code: '200', data: counts },
    { code: 500, data: counts },
  ]) {
    http.defaults.adapter = async (config) => reply(config, body)
    await assert.rejects(queryMerchantStats())
  }
})

test('pending and failed requests expose no count object; explicit retry recovers', async () => {
  let finish
  const { stats, requests } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        finish = (body) => resolve(reply(config, body))
      }),
  })
  assert.equal(stats.state.value, 'loading')
  assert.equal(stats.stats.value, null)
  finish({ code: 500, message: '失败', data: null })
  await flush()
  assert.equal(stats.state.value, 'error')
  assert.equal(stats.stats.value, null)
  assert.ok(stats.errorMessage.value)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return reply(config, { code: 200, data: counts })
  }
  await stats.retry()
  assert.equal(requests.length, 2)
  assert.deepEqual(stats.stats.value, counts)
  http.defaults.adapter = async () => {
    throw new Error('Network Error')
  }
  await stats.retry()
  assert.equal(stats.state.value, 'error')
  assert.equal(stats.stats.value, null)
})

test('HTTP failure wins over a successful-looking response body', async () => {
  const { stats } = await mount({
    adapter: async (config) => {
      const error = new Error('HTTP 503')
      error.isAxiosError = true
      error.response = reply(config, { code: 200, data: counts }, 503)
      throw error
    },
  })
  assert.equal(stats.state.value, 'error')
  assert.equal(stats.stats.value, null)
})

test('anonymous and customer identities do not send a stats request', async () => {
  const anonymous = await mount({ identity: null })
  assert.equal(anonymous.requests.length, 0)
  assert.equal(anonymous.stats.state.value, 'login-required')
  anonymous.app.unmount()
  anonymous.auth.$dispose()
  storage.clear()
  const customer = await mount({ identity: session({ user: { ...user, role: 1 } }) })
  assert.equal(customer.requests.length, 0)
  assert.equal(customer.stats.state.value, 'forbidden')
})

test('business 403 shows forbidden and business 401 clears the current session', async () => {
  const { stats, auth } = await mount({ body: { code: 403, data: null } })
  assert.equal(stats.state.value, 'forbidden')
  assert.equal(stats.stats.value, null)
  http.defaults.adapter = async (config) => reply(config, { code: 401, data: null })
  await stats.retry()
  assert.equal(auth.accessToken, null)
  assert.equal(stats.state.value, 'login-required')
  assert.equal(stats.stats.value, null)
})

test('retry aborts the earlier request and ignores its late response', async () => {
  const pending = []
  const { stats } = await mount({
    adapter: (config) => new Promise((resolve) => pending.push({ config, resolve })),
  })
  const retry = stats.retry()
  await flush()
  assert.equal(pending[0].config.signal.aborted, true)
  pending[1].resolve(reply(pending[1].config, { code: 200, data: counts }))
  await retry
  pending[0].resolve(reply(pending[0].config, { code: 200, data: { ...counts, allCount: 1 } }))
  await flush()
  assert.deepEqual(stats.stats.value, counts)
})

test('switching merchants clears old counts and ignores the old merchant response', async () => {
  const pending = []
  const { stats, auth } = await mount({
    adapter: (config) => new Promise((resolve) => pending.push({ config, resolve })),
  })
  storage.set(
    'nesmartmall.auth',
    JSON.stringify(session({ accessToken: 'new-token', user: { ...user, id: 'merchant-2' } })),
  )
  storage.set('nesmartmall.auth.revision', 'new-session')
  auth.getAuthorization()
  await flush()
  assert.equal(stats.stats.value, null)
  assert.equal(pending.length, 2)
  assert.equal(pending[1].config.headers.get('Authorization'), 'Bearer new-token')
  pending[1].resolve(reply(pending[1].config, { code: 200, data: counts }))
  await flush()
  pending[0].resolve(reply(pending[0].config, { code: 200, data: { ...counts, allCount: 1 } }))
  await flush()
  assert.deepEqual(stats.stats.value, counts)
  auth.logout()
  assert.equal(stats.stats.value, null)
  assert.equal(stats.state.value, 'login-required')
})

test('unmount cancels pending statistics and ignores late results', async () => {
  let finish, signal
  const { app, stats } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        signal = config.signal
        finish = () => resolve(reply(config, { code: 200, data: counts }))
      }),
  })
  app.unmount()
  assert.equal(signal.aborted, true)
  finish()
  await flush()
  assert.equal(stats.stats.value, null)
})
