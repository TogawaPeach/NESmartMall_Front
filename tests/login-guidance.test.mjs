import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'
import { createRenderer } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

let server,
  http,
  configureAuth,
  useAuthStore,
  useProductList,
  useLoginPromptStore,
  createPinia,
  fixture
const entries = new Map()
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
}
const user = { id: 'guide', account: 'guide', nickname: '测试用户', role: 1 }
const loginData = { accessToken: 'guide-token', tokenType: 'Bearer', expiresIn: 3600, user }
const page = { code: 200, data: { list: [], total: 0, pageNum: 1, pageSize: 12 } }
const reply = (config, data, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config,
})
const flush = () => new Promise((resolve) => setImmediate(resolve))

before(async () => {
  globalThis.localStorage = storage
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/products?page=1' },
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
  ;({ useProductList } = await server.ssrLoadModule('/src/composables/useProductList.ts'))
  ;({ useLoginPromptStore } = await server.ssrLoadModule('/src/stores/loginPrompt.ts'))
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

async function mount({ authenticated = false, path = '/products?page=1', adapter } = {}) {
  if (authenticated)
    entries.set(
      'nesmartmall.auth',
      JSON.stringify({
        accessToken: 'guide-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
        user,
      }),
    )
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  const requests = []
  http.defaults.adapter = async (config) => {
    requests.push(config)
    if (config.url === '/api/auth/login' || config.url === '/api/auth/register')
      return reply(config, { code: 200, data: loginData })
    return adapter ? adapter(config) : reply(config, page)
  }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ name: 'products', path: '/products', component: {} }],
  })
  await router.push(path)
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let list
  const app = renderer.createApp({
    setup: () => {
      list = useProductList()
      return () => null
    },
  })
  app.use(pinia)
  app.use(router)
  fixture = { app, auth, requests, router, prompt: useLoginPromptStore(pinia) }
  app.mount({})
  await flush()
  return { ...fixture, list }
}

test('anonymous catalogue access shows login guidance without requesting protected products', async () => {
  const { list, requests } = await mount()
  assert.equal(list.state.value, 'login-required')
  assert.equal(requests.length, 0)
})

test('an anonymous protected entry opens the shared login prompt with a reason', async () => {
  const { prompt } = await mount()
  assert.equal(prompt.requireLogin('登录后即可查看全部商品'), false)
  assert.equal(prompt.visible, true)
  assert.equal(prompt.reason, '登录后即可查看全部商品')
})

test('a valid session passes a protected entry without opening the login prompt', async () => {
  const { prompt } = await mount({ authenticated: true })
  assert.equal(prompt.requireLogin('登录后即可查看全部商品'), true)
  assert.equal(prompt.visible, false)
})

test('an expired session prompts login and stops displaying catalogue results', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  const { prompt, list, requests } = await mount({ authenticated: true })
  context.mock.timers.tick(3600_000)
  assert.equal(prompt.requireLogin('登录后即可查看全部商品'), false)
  await flush()
  assert.equal(prompt.visible, true)
  assert.equal(list.state.value, 'login-required')
  assert.equal(requests.length, 1)
})

test('an anonymous search URL also waits for login without an API call', async () => {
  const { list, requests } = await mount({ path: '/products?keyword=RTK&page=1' })
  assert.equal(list.state.value, 'login-required')
  assert.equal(list.searchKeyword.value, 'RTK')
  assert.equal(requests.length, 0)
})

test('signing in from a protected page loads its current query once', async () => {
  const { list, auth, requests } = await mount({ path: '/products?keyword=RTK&page=1' })
  assert.equal(requests.length, 0)
  await auth.signIn({ account: 'guide', password: 'test-only' })
  await flush()
  assert.equal(list.state.value, 'empty')
  const productRequests = requests.filter((r) => r.url === '/api/products/page')
  assert.equal(productRequests.length, 1)
  assert.deepEqual(productRequests[0].params, { keyword: 'RTK', pageNum: 1 })
  assert.equal(productRequests[0].headers.get('Authorization'), 'Bearer guide-token')
})

test('logout clears catalogue results and shows login guidance without retrying the API', async () => {
  const { list, auth, requests } = await mount({ authenticated: true })
  assert.equal(list.state.value, 'empty')
  auth.logout()
  await flush()
  assert.equal(list.state.value, 'login-required')
  assert.equal(list.total.value, null)
  assert.deepEqual(list.products.value, [])
  assert.equal(requests.length, 1)
})

test('registering from a protected page loads the current query without another login', async () => {
  const { list, auth, requests, router } = await mount({ path: '/products?keyword=RTK&page=1' })
  await auth.signUp({
    account: '13800138000',
    nickname: '测试用户',
    password: 'test-only',
    role: 1,
  })
  await flush()
  assert.equal(list.state.value, 'empty')
  assert.equal(router.currentRoute.value.fullPath, '/products?keyword=RTK&page=1')
  assert.equal(requests.filter((r) => r.url === '/api/auth/login').length, 0)
  assert.equal(requests.filter((r) => r.url === '/api/auth/register').length, 1)
  const productRequests = requests.filter((r) => r.url === '/api/products/page')
  assert.equal(productRequests.length, 1)
  assert.deepEqual(productRequests[0].params, { keyword: 'RTK', pageNum: 1 })
  assert.equal(productRequests[0].headers.get('Authorization'), 'Bearer guide-token')
})

for (const business of [true, false]) {
  test(`${business ? 'business' : 'HTTP'} 401 shows login guidance instead of a product error`, async () => {
    const { list, auth } = await mount({
      authenticated: true,
      adapter: (config) => {
        if (business) return reply(config, { code: 401, message: '请重新登录' })
        throw new AxiosError(
          'Unauthorized',
          'ERR_BAD_REQUEST',
          config,
          undefined,
          reply(config, {}, 401),
        )
      },
    })
    assert.equal(auth.isAuthenticated, false)
    assert.equal(list.state.value, 'login-required')
    assert.equal(list.total.value, null)
  })
}

for (const status of [403, 500, null]) {
  test(`${status ?? 'network failure'} retains ordinary error handling and the valid session`, async () => {
    const { list, auth } = await mount({
      authenticated: true,
      adapter: (config) => {
        throw new AxiosError(
          'Failure',
          'ERR_BAD_RESPONSE',
          config,
          undefined,
          status ? reply(config, { code: status }, status) : undefined,
        )
      },
    })
    assert.equal(list.state.value, 'error')
    assert.equal(auth.isAuthenticated, true)
  })
}

test('a response arriving after logout cannot replace the login guidance', async () => {
  let finish
  const { list, auth, requests } = await mount({
    authenticated: true,
    adapter: (config) =>
      new Promise((resolve) => {
        finish = () => resolve(reply(config, page))
      }),
  })
  auth.logout()
  await flush()
  finish()
  await flush()
  assert.equal(list.state.value, 'login-required')
  assert.deepEqual(list.products.value, [])
  assert.equal(requests.length, 1)
})
