import assert from 'node:assert/strict'
import { after, before, beforeEach, afterEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'

let server, gatewayServer, http, gatewayHttp, login, useAuthStore, createPinia, configureAuth, store
let queryProducts, queryProductPage
const pageURL = 'https://mall.example.test/products?pageNum=2'
const gatewayBaseURL = 'https://gateway.example.test/mall'
const entries = new Map()
const legacyEntries = new Map()
const peers = []
const sessionKey = 'nesmartmall.auth'
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
}
const legacyStorage = {
  getItem: (key) => legacyEntries.get(key) ?? null,
  setItem: (key, value) => legacyEntries.set(key, value),
  removeItem: (key) => legacyEntries.delete(key),
}
const response = () => ({
  code: 200,
  message: 'OK',
  data: {
    accessToken: 'test-access-token',
    tokenType: 'Bearer',
    expiresIn: 86400,
    user: { id: '2', account: '15130097995', nickname: 'user', role: 1 },
  },
})
const adapter =
  (data, status = 200) =>
  async (config) => ({
    data,
    status,
    statusText: 'OK',
    headers: {},
    config,
  })

before(async () => {
  globalThis.localStorage = storage
  globalThis.sessionStorage = legacyStorage
  globalThis.window = Object.assign(new EventTarget(), { location: { href: pageURL } })
  server = await createServer({
    configFile: false,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ login } = await server.ssrLoadModule('/src/api/auth.ts'))
  ;({ queryProducts, queryProductPage } = await server.ssrLoadModule('/src/api/products.ts'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  gatewayServer = await createServer({
    configFile: false,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify(gatewayBaseURL) },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  const gatewayModule = await gatewayServer.ssrLoadModule('/src/api/http.ts')
  gatewayHttp = gatewayModule.http
  gatewayModule.configureAuth({
    getAuthorization: () => store.getAuthorization(),
    logout: () => store.logout(),
  })
})
beforeEach(() => {
  entries.clear()
  legacyEntries.clear()
  http.defaults.baseURL = undefined
  gatewayHttp.defaults.baseURL = gatewayBaseURL
  store = useAuthStore(createPinia())
  configureAuth(store)
})
afterEach(() => {
  store?.logout()
  store?.$dispose()
  for (const peer of peers.splice(0)) peer.$dispose()
})
after(async () => {
  await Promise.all([server?.close(), gatewayServer?.close()])
  delete globalThis.sessionStorage
  delete globalThis.localStorage
  delete globalThis.window
})

function createPeer() {
  const peer = useAuthStore(createPinia())
  peers.push(peer)
  return peer
}

function storedSession(accessToken, expiresAt = Date.now() + 60_000) {
  return {
    accessToken,
    tokenType: 'Bearer',
    expiresAt,
    user: { id: '2', account: '15130097995', nickname: 'user', role: 1 },
  }
}

function storageEvent(
  key = sessionKey,
  storageArea = storage,
  newValue = entries.get(key) ?? null,
) {
  const event = new Event('storage')
  Object.defineProperties(event, {
    key: { value: key },
    storageArea: { value: storageArea },
    newValue: { value: newValue },
  })
  window.dispatchEvent(event)
}

test('a new tab with empty sessionStorage restores shared login and authorizes the catalogue request', async () => {
  await signIn()
  assert.equal(legacyEntries.size, 0)
  assert.equal(JSON.parse(entries.get(sessionKey)).accessToken, 'test-access-token')
  const tab = createPeer()
  assert.equal(tab.isAuthenticated, true)
  assert.equal(tab.displayName, 'user')
  configureAuth(tab)
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
    return adapter({ code: 200, data: { list: [], total: 0, pageNum: 1, pageSize: 12 } })(config)
  }
  await queryProductPage({ category: 'all', pageNum: 1 })
})

test('an existing sessionStorage login migrates to shared storage without another login', () => {
  legacyEntries.set(sessionKey, JSON.stringify(storedSession('legacy-token')))
  const tab = createPeer()
  assert.equal(tab.accessToken, 'legacy-token')
  assert.equal(JSON.parse(entries.get(sessionKey)).accessToken, 'legacy-token')
  assert.equal(legacyEntries.size, 0)
})

test('shared login takes precedence over an old sessionStorage login', () => {
  entries.set(sessionKey, JSON.stringify(storedSession('shared-token')))
  legacyEntries.set(sessionKey, JSON.stringify(storedSession('legacy-token')))
  const tab = createPeer()
  assert.equal(tab.accessToken, 'shared-token')
  assert.equal(legacyEntries.size, 0)
})

test('logout after migration cannot be undone by another tab with an old sessionStorage token', () => {
  const legacy = JSON.stringify(storedSession('legacy-token'))
  legacyEntries.set(sessionKey, legacy)
  const tab = createPeer()
  tab.logout()
  // An older open tab still has its own independent legacy sessionStorage.
  legacyEntries.set(sessionKey, legacy)
  assert.equal(createPeer().isAuthenticated, false)
  assert.equal(legacyEntries.size, 0)
})

test('expired legacy sessions are discarded instead of migrated', () => {
  legacyEntries.set(sessionKey, JSON.stringify(storedSession('expired-token', Date.now() - 1)))
  assert.equal(createPeer().isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
  assert.equal(legacyEntries.size, 0)
})

test('a login in one tab updates the account display in existing tabs', async () => {
  const tab = createPeer()
  assert.equal(tab.isAuthenticated, false)
  await signIn()
  storageEvent()
  assert.equal(tab.isAuthenticated, true)
  assert.equal(tab.displayName, 'user')
  assert.equal(tab.getAuthorization(), 'Bearer test-access-token')
})

test('logout synchronizes to other tabs and cannot be restored on reload', async () => {
  await signIn()
  const tab = createPeer()
  store.logout()
  storageEvent()
  assert.equal(tab.isAuthenticated, false)
  assert.equal(tab.getAuthorization(), null)
  assert.equal(createPeer().isAuthenticated, false)
})

test('matching 401 cleanup synchronizes to other tabs', async () => {
  await signIn()
  const tab = createPeer()
  http.defaults.adapter = adapter({ code: 401 })
  await http.get('/api/products/page')
  storageEvent()
  assert.equal(tab.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})

test('requests read a new shared token even before its storage event arrives', async () => {
  await signIn('old-token')
  entries.set(sessionKey, JSON.stringify(storedSession('new-tab-token')))
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer new-tab-token')
    return adapter({ code: 200 })(config)
  }
  await http.get('/api/products')
  assert.equal(store.accessToken, 'new-tab-token')
})

for (const business of [false, true]) {
  test(`a late ${business ? 'business' : 'HTTP'} 401 cannot erase another tab's login before storage events`, async () => {
    await signIn('old-token')
    let finish
    http.defaults.adapter = (config) =>
      new Promise((resolve, reject) => {
        assert.equal(config.headers.get('Authorization'), 'Bearer old-token')
        finish = () => {
          if (business) resolve(adapter({ code: 401 })(config))
          else {
            try {
              failHTTP(config, 401)
            } catch (error) {
              reject(error)
            }
          }
        }
      })
    const pending = http.get('/api/products/page')
    await new Promise((resolve) => setImmediate(resolve))
    entries.set(sessionKey, JSON.stringify(storedSession('new-tab-token')))
    finish()
    if (business) await pending
    else await assert.rejects(pending, { code: 'ERR_BAD_RESPONSE' })
    assert.equal(store.accessToken, 'new-tab-token')
    assert.equal(entries.has(sessionKey), true)
    assert.equal(JSON.parse(entries.get(sessionKey)).accessToken, 'new-tab-token')
  })
}

test('an old expiry timer cannot erase a new login from another tab', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
  await signIn('expiring-token', 1)
  entries.set(sessionKey, JSON.stringify(storedSession('new-tab-token')))
  context.mock.timers.tick(1000)
  assert.equal(store.accessToken, 'new-tab-token')
  assert.equal(JSON.parse(entries.get(sessionKey)).accessToken, 'new-tab-token')
})

test('a delayed storage event reads the latest shared session instead of its stale event value', async () => {
  await signIn('old-token')
  const old = entries.get(sessionKey)
  entries.set(sessionKey, JSON.stringify(storedSession('new-tab-token')))
  storageEvent(sessionKey, storage, old)
  assert.equal(store.accessToken, 'new-tab-token')
})

test('storage clear synchronizes logout while unrelated and sessionStorage events are ignored', async () => {
  await signIn()
  entries.clear()
  storageEvent('unrelated-key')
  assert.equal(store.isAuthenticated, true)
  storageEvent(sessionKey, legacyStorage)
  assert.equal(store.isAuthenticated, true)
  storageEvent(null)
  assert.equal(store.isAuthenticated, false)
})

for (const replacement of [null, 'new-tab-token']) {
  test(`another tab's ${replacement ? 'login' : 'logout'} invalidates an in-flight login`, async () => {
    await signIn('old-token')
    let finish
    http.defaults.adapter = (config) =>
      new Promise((resolve) => {
        finish = () => resolve(adapter(response())(config))
      })
    const pending = store.signIn({ account: '15130097995', password: 'user' })
    await new Promise((resolve) => setImmediate(resolve))
    if (replacement) entries.set(sessionKey, JSON.stringify(storedSession(replacement)))
    else entries.delete(sessionKey)
    storageEvent()
    finish()
    assert.equal(await pending, false)
    assert.equal(store.accessToken, replacement)
  })
}

for (const readBlocked of [false, true]) {
  test(`disabled storage still permits memory-only login (${readBlocked ? 'reads blocked' : 'writes blocked'})`, async () => {
    globalThis.localStorage = {
      getItem: () => {
        if (readBlocked) throw new Error('Storage disabled')
        return null
      },
      setItem: () => {
        throw new Error('Storage disabled')
      },
      removeItem: () => {
        throw new Error('Storage disabled')
      },
    }
    try {
      const tab = createPeer()
      configureAuth(tab)
      http.defaults.adapter = adapter(response())
      assert.equal(await tab.signIn({ account: '15130097995', password: 'user' }), true)
      assert.equal(tab.getAuthorization(), 'Bearer test-access-token')
      tab.logout()
      assert.equal(tab.getAuthorization(), null)
    } finally {
      globalThis.localStorage = storage
    }
  })
}

test('logout removes an older persisted token after a write failure forced memory-only login', async () => {
  await signIn('persisted-token')
  globalThis.localStorage = {
    ...storage,
    setItem: () => {
      throw new Error('Quota exceeded')
    },
  }
  try {
    await signIn('memory-token')
    assert.equal(store.getAuthorization(), 'Bearer memory-token')
    store.logout()
    assert.equal(entries.has(sessionKey), false)
    assert.equal(createPeer().isAuthenticated, false)
  } finally {
    globalThis.localStorage = storage
  }
})

for (const rejectOldRequest of [false, true]) {
  test(`memory-only ${rejectOldRequest ? '401' : 'expiry'} cannot erase another tab's new login after writes recover`, async (context) => {
    context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
    await signIn('persisted-token')
    globalThis.localStorage = {
      ...storage,
      setItem: () => {
        throw new Error('Quota exceeded')
      },
    }
    try {
      await signIn('memory-token', 1)
      assert.equal(store.getAuthorization(), 'Bearer memory-token')
    } finally {
      globalThis.localStorage = storage
    }
    let finish
    const pending = rejectOldRequest
      ? (() => {
          http.defaults.adapter = (config) =>
            new Promise((resolve) => {
              assert.equal(config.headers.get('Authorization'), 'Bearer memory-token')
              finish = () => resolve(adapter({ code: 401 })(config))
            })
          return http.get('/api/products/page')
        })()
      : null
    if (pending) await new Promise((resolve) => setImmediate(resolve))
    const tab = createPeer()
    configureAuth(tab)
    http.defaults.adapter = adapter({
      ...response(),
      data: { ...response().data, accessToken: 'new-tab-token' },
    })
    assert.equal(await tab.signIn({ account: '15130097995', password: 'user' }), true)
    if (pending) {
      finish()
      await pending
    } else context.mock.timers.tick(1000)
    assert.equal(JSON.parse(entries.get(sessionKey)).accessToken, 'new-tab-token')
    assert.equal(store.getAuthorization(), 'Bearer new-tab-token')
  })
}

test('an anonymous pending login cannot undo another tab login followed by logout before events arrive', async () => {
  store.logout()
  let finish
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      finish = () => resolve(adapter(response())(config))
    })
  const pending = store.signIn({ account: '15130097995', password: 'user' })
  await new Promise((resolve) => setImmediate(resolve))
  const tab = createPeer()
  configureAuth(tab)
  http.defaults.adapter = adapter(response())
  assert.equal(await tab.signIn({ account: '15130097995', password: 'user' }), true)
  tab.logout()
  storageEvent()
  finish()
  assert.equal(await pending, false)
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})

test('expiry of an older persisted token does not shorten a valid memory-only login', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
  await signIn('persisted-short', 1)
  globalThis.localStorage = {
    ...storage,
    setItem: () => {
      throw new Error('Quota exceeded')
    },
  }
  try {
    await signIn('memory-long', 60)
    context.mock.timers.tick(1000)
    assert.equal(store.getAuthorization(), 'Bearer memory-long')
  } finally {
    globalThis.localStorage = storage
  }
})

test('a different tab writing between save and the next read is never mistaken for the current login', async () => {
  let interleave = false
  globalThis.localStorage = {
    ...storage,
    setItem: (key, value) => {
      storage.setItem(key, value)
      if (key === sessionKey && JSON.parse(value).accessToken === 'this-tab-token')
        interleave = true
    },
    getItem: (key) => {
      if (key === sessionKey && interleave) {
        entries.set(sessionKey, JSON.stringify(storedSession('other-tab-token')))
        interleave = false
      }
      return storage.getItem(key)
    },
  }
  try {
    await signIn('this-tab-token')
    assert.equal(store.getAuthorization(), 'Bearer other-tab-token')
    assert.equal(store.accessToken, 'other-tab-token')
  } finally {
    globalThis.localStorage = storage
  }
})

test('login sends JSON credentials in the POST body without changing the password', async () => {
  http.defaults.adapter = async (config) => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/api/auth/login')
    assert.deepEqual(JSON.parse(config.data), { account: '15130097995', password: ' user ' })
    assert.equal(config.headers.get('Authorization'), undefined)
    return adapter(response())(config)
  }
  const data = await login({ account: ' 15130097995 ', password: ' user ' })
  assert.equal(data.user.nickname, 'user')
  assert.equal(data.accessToken, 'test-access-token')
})

test('business failure never creates a logged-in session', async () => {
  http.defaults.adapter = adapter({ code: 401, message: '账号或密码错误', data: null })
  await assert.rejects(
    store.signIn({ account: '15130097995', password: 'wrong' }),
    /账号或密码错误/,
  )
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})

test('malformed success and empty credentials are rejected', async () => {
  await assert.rejects(login({ account: ' ', password: 'user' }))
  await assert.rejects(login({ account: '15130097995', password: '' }))
  for (const change of [
    { accessToken: '' },
    { expiresIn: 0 },
    { tokenType: 'Basic' },
    { user: null },
  ]) {
    http.defaults.adapter = adapter({ ...response(), data: { ...response().data, ...change } })
    await assert.rejects(store.signIn({ account: '15130097995', password: 'user' }))
    assert.equal(store.isAuthenticated, false)
  }
})

test('successful login survives refresh without storing the password', async () => {
  http.defaults.adapter = adapter(response())
  await store.signIn({ account: '15130097995', password: 'secret-password' })
  assert.equal(store.isAuthenticated, true)
  assert.equal(store.user.nickname, 'user')
  assert.equal([...entries.values()].join('').includes('secret-password'), false)
  const restored = useAuthStore(createPinia())
  assert.equal(restored.isAuthenticated, true)
  assert.equal(restored.accessToken, 'test-access-token')
  restored.$dispose()
})

test('expired or malformed stored sessions are discarded', async () => {
  http.defaults.adapter = adapter(response())
  await store.signIn({ account: '15130097995', password: 'user' })
  const key = sessionKey
  const value = entries.get(key)
  entries.set(key, JSON.stringify({ ...JSON.parse(value), expiresAt: Date.now() - 1 }))
  let restored = useAuthStore(createPinia())
  assert.equal(restored.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
  restored.$dispose()
  entries.set(key, '{invalid json')
  restored = useAuthStore(createPinia())
  assert.equal(restored.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
  restored.$dispose()
})

test('API requests use Bearer authorization and a matching HTTP 401 clears the session', async () => {
  http.defaults.adapter = adapter(response())
  await store.signIn({ account: '15130097995', password: 'user' })
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
    const error = new Error('Unauthorized')
    error.isAxiosError = true
    error.config = config
    error.response = { status: 401, config }
    throw error
  }
  await assert.rejects(http.get('/api/orders'))
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})

test('failed re-login does not clear a current session', async () => {
  http.defaults.adapter = adapter(response())
  await store.signIn({ account: '15130097995', password: 'user' })
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
    const error = new Error('Unauthorized')
    error.isAxiosError = true
    error.config = config
    error.response = { status: 401, config }
    throw error
  }
  await assert.rejects(
    login({ account: '15130097995', password: 'wrong' }),
    /登录失败，请检查账号和密码后重试/,
  )
  assert.equal(store.isAuthenticated, true)
})

async function signIn(accessToken = 'test-access-token', expiresIn = 86400) {
  const payload = response()
  payload.data.accessToken = accessToken
  payload.data.expiresIn = expiresIn
  http.defaults.adapter = adapter(payload)
  assert.equal(await store.signIn({ account: '15130097995', password: 'user' }), true)
  assert.equal(store.accessToken, accessToken)
}

function failHTTP(config, status) {
  throw new AxiosError('Request failed', 'ERR_BAD_RESPONSE', config, undefined, {
    data: { code: status, message: '账号或密码错误' },
    status,
    statusText: 'Error',
    headers: {},
    config,
  })
}

test('home, category, pagination and search APIs share authorization without identity params', async () => {
  await signIn()
  const requests = []
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
    assert.equal(config.data, undefined)
    requests.push({ url: config.url, params: config.params })
    const data =
      config.url === '/api/products'
        ? []
        : { list: [], total: 0, pageNum: config.params.pageNum, pageSize: 12 }
    return adapter({ code: 200, data })(config)
  }
  await queryProducts({ category: 'all', keyword: '', limit: 8 })
  await queryProducts({ category: 'gnss-rtk', keyword: '', limit: 8 })
  await queryProductPage({ category: 'all', pageNum: 2 })
  await queryProductPage({ category: 'all', pageNum: 1, keyword: 'RTK' })
  assert.deepEqual(requests, [
    { url: '/api/products', params: { limit: 8 } },
    { url: '/api/products', params: { categoryId: 2, limit: 8 } },
    { url: '/api/products/page', params: { pageNum: 2 } },
    { url: '/api/products/page', params: { keyword: 'RTK', pageNum: 1 } },
  ])
})

test('successful re-login sends the current token and only JSON credentials', async () => {
  await signIn('old-token')
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer old-token')
    assert.equal(config.url, '/api/auth/login')
    assert.equal(config.params, undefined)
    assert.deepEqual(JSON.parse(config.data), { account: '15130097995', password: 'user' })
    return adapter(response())(config)
  }
  assert.equal(await store.signIn({ account: '15130097995', password: 'user' }), true)
  assert.equal(store.accessToken, 'test-access-token')
})

for (const url of [
  '/api/products',
  'https://mall.example.test/api/products',
  '//mall.example.test/api/products',
]) {
  test(`valid token is sent to the project backend: ${url}`, async () => {
    await signIn()
    http.defaults.adapter = async (config) => {
      assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
      return adapter({ code: 200 })(config)
    }
    await http.get(url)
  })
}

for (const url of [
  '/api/products',
  `${gatewayBaseURL}/api/products`,
  '//gateway.example.test/mall/api/products',
]) {
  test(`configured VITE_API_BASE_URL supports authorization: ${url}`, async () => {
    await signIn()
    assert.equal(gatewayHttp.defaults.baseURL, gatewayBaseURL)
    gatewayHttp.defaults.adapter = async (config) => {
      assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
      return adapter({ code: 200 })(config)
    }
    await gatewayHttp.get(url)
  })
}

for (const config of [
  { url: 'https://third-party.example.test/api/products' },
  { url: '//third-party.example.test/api/products' },
  { url: '/api/products', baseURL: 'https://third-party.example.test' },
  { url: 'https://mall.example.test.evil.test/api/products' },
  { url: 'https://mall.example.test@evil.test/api/products' },
  { url: 'http://mall.example.test/api/products' },
  { url: '/assets/data.json' },
]) {
  test(`session authorization never reaches unrelated destinations: ${JSON.stringify(config)}`, async () => {
    await signIn()
    http.defaults.adapter = async (request) => {
      assert.equal(request.headers.get('Authorization'), undefined)
      return adapter({ code: 200 })(request)
    }
    for (const headers of [undefined, { authorization: store.getAuthorization() }]) {
      await http.request({ ...config, headers })
    }
  })
}

test('configured backend trust is limited to its origin and base path', async () => {
  await signIn()
  gatewayHttp.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), undefined)
    return adapter({ code: 200 })(config)
  }
  for (const url of [
    'https://third-party.example.test/mall/api/products',
    'https://gateway.example.test/other/api/products',
    'https://gateway.example.test/mall-other/api/products',
  ])
    await gatewayHttp.get(url, { headers: { Authorization: store.getAuthorization() } })
})

test('anonymous requests remove stale or manually supplied authorization', async () => {
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), undefined)
    return adapter(response())(config)
  }
  await http.get('/api/products', { headers: { Authorization: 'Bearer stale-token' } })
  await login({ account: '15130097995', password: 'user' })
})

test('logout stops authorization even if an old token remains in default headers', async () => {
  await signIn()
  http.defaults.headers.common.Authorization = store.getAuthorization()
  store.logout()
  try {
    http.defaults.adapter = async (config) => {
      assert.equal(config.headers.get('Authorization'), undefined)
      return adapter({ code: 200 })(config)
    }
    await http.get('/api/products')
    assert.equal(entries.has(sessionKey), false)
  } finally {
    delete http.defaults.headers.common.Authorization
  }
})

test('expired token is cleared before both business and login requests', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  await signIn('expiring-token', 1)
  context.mock.timers.tick(1000)
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), undefined)
    return adapter(response())(config)
  }
  await http.get('/api/products')
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
  await login({ account: '15130097995', password: 'user' })
})

test('sign-in can establish a new session when the previous token has expired', async (context) => {
  context.mock.timers.enable({ apis: ['Date'], now: Date.now() })
  await signIn('expiring-token', 1)
  context.mock.timers.tick(1000)
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), undefined)
    return adapter(response())(config)
  }
  assert.equal(await store.signIn({ account: '15130097995', password: 'user' }), true)
  assert.equal(store.accessToken, 'test-access-token')
})

test('automatic expiry clears the old session without discarding an in-flight new login', async (context) => {
  context.mock.timers.enable({ apis: ['Date', 'setTimeout'], now: Date.now() })
  await signIn('expiring-token', 1)
  let finish
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      assert.equal(config.headers.get('Authorization'), 'Bearer expiring-token')
      finish = () => resolve(adapter(response())(config))
    })
  const pending = store.signIn({ account: '15130097995', password: 'user' })
  await new Promise((resolve) => setImmediate(resolve))
  context.mock.timers.tick(1000)
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
  finish()
  assert.equal(await pending, true)
  assert.equal(store.accessToken, 'test-access-token')
})

test('a matching business 401 clears the session and storage', async () => {
  await signIn()
  http.defaults.adapter = adapter({ code: 401, message: '登录状态已失效' })
  await http.get('/api/products/page')
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})

test('a business 401 in an HTTP 400 response also clears the matching session', async () => {
  await signIn()
  http.defaults.adapter = async (config) => {
    throw new AxiosError('Rejected', 'ERR_BAD_REQUEST', config, undefined, {
      data: { code: 401 },
      status: 400,
      statusText: 'Bad Request',
      headers: {},
      config,
    })
  }
  await assert.rejects(http.get('/api/products/page'), { code: 'ERR_BAD_REQUEST' })
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})

test('an HTTP 401 accepted by the caller still clears the matching session', async () => {
  await signIn()
  http.defaults.adapter = adapter({}, 401)
  await http.get('/api/products/page', { validateStatus: () => true })
  assert.equal(store.isAuthenticated, false)
})

for (const status of [403, 500, 503]) {
  test(`HTTP ${status} takes precedence over business code 401`, async () => {
    await signIn()
    const saved = entries.get(sessionKey)
    http.defaults.adapter = async (config) => {
      throw new AxiosError('Rejected', 'ERR_BAD_RESPONSE', config, undefined, {
        data: { code: 401 },
        status,
        statusText: 'Error',
        headers: {},
        config,
      })
    }
    await assert.rejects(http.get('/api/products/page'), { code: 'ERR_BAD_RESPONSE' })
    // Custom validateStatus can route the same status through the success interceptor.
    http.defaults.adapter = adapter({ code: 401 }, status)
    await http.get('/api/products/page', { validateStatus: () => true })
    assert.equal(store.isAuthenticated, true)
    assert.equal(entries.get(sessionKey), saved)
  })
}

for (const business of [false, true]) {
  test(`a late ${business ? 'business' : 'HTTP'} 401 cannot clear a newer login`, async () => {
    await signIn('old-token')
    let finish
    http.defaults.adapter = (config) =>
      new Promise((resolve, reject) => {
        assert.equal(config.headers.get('Authorization'), 'Bearer old-token')
        finish = () => {
          if (business) resolve(adapter({ code: 401 })(config))
          else {
            try {
              failHTTP(config, 401)
            } catch (error) {
              reject(error)
            }
          }
        }
      })
    const pending = http.get('/api/products/page')
    await new Promise((resolve) => setImmediate(resolve))
    await signIn('new-token')
    finish()
    if (business) await pending
    else await assert.rejects(pending)
    assert.equal(store.accessToken, 'new-token')
    assert.equal(JSON.parse(entries.get(sessionKey)).accessToken, 'new-token')
  })
}

for (const business of [false, true]) {
  test(`failed re-login with ${business ? 'business' : 'HTTP'} 401 retains the session and error message`, async () => {
    await signIn()
    const saved = entries.get(sessionKey)
    http.defaults.adapter = async (config) => {
      assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
      if (!business) failHTTP(config, 401)
      return adapter({ code: 401, message: '账号或密码错误' })(config)
    }
    await assert.rejects(
      store.signIn({ account: '15130097995', password: 'wrong' }),
      /账号或密码错误/,
    )
    assert.equal(store.accessToken, 'test-access-token')
    assert.equal(entries.get(sessionKey), saved)
  })
}

test('login 401 exemption also applies to an absolute configured login URL with a query', async () => {
  await signIn()
  gatewayHttp.defaults.adapter = async (config) => {
    assert.equal(config.headers.get('Authorization'), 'Bearer test-access-token')
    failHTTP(config, 401)
  }
  await assert.rejects(gatewayHttp.post(`${gatewayBaseURL}/api/auth/login?source=mall`, {}))
  assert.equal(store.isAuthenticated, true)
})

for (const status of [403, 500, 503, null]) {
  test(`${status ?? 'network error'} does not clear the session`, async () => {
    await signIn()
    const saved = entries.get(sessionKey)
    http.defaults.adapter = async (config) => {
      if (status) failHTTP(config, status)
      throw new AxiosError('Network Error', 'ERR_NETWORK', config)
    }
    await assert.rejects(http.get('/api/products/page'))
    assert.equal(store.isAuthenticated, true)
    assert.equal(entries.get(sessionKey), saved)
  })
}

test('a tokenless in-flight request cannot clear a subsequently established session', async () => {
  let finish
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      assert.equal(config.headers.get('Authorization'), undefined)
      finish = () => resolve(adapter({ code: 401 })(config))
    })
  const pending = http.get('/api/products')
  await new Promise((resolve) => setImmediate(resolve))
  await signIn()
  finish()
  await pending
  assert.equal(store.isAuthenticated, true)
})

test('logout during an in-flight login cannot restore a session', async () => {
  let finish
  http.defaults.adapter = (config) =>
    new Promise((resolve) => {
      finish = () => resolve(adapter(response())(config))
    })
  const pending = store.signIn({ account: '15130097995', password: 'user' })
  await new Promise((resolve) => setImmediate(resolve))
  store.logout()
  finish()
  assert.equal(await pending, false)
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.has(sessionKey), false)
})
