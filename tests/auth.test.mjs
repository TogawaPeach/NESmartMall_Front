import assert from 'node:assert/strict'
import { after, before, beforeEach, afterEach, test } from 'node:test'
import { createServer } from 'vite'

let server, http, login, useAuthStore, createPinia, configureAuth, store
const entries = new Map()
const storage = {
  getItem: (key) => entries.get(key) ?? null,
  setItem: (key, value) => entries.set(key, value),
  removeItem: (key) => entries.delete(key),
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
  globalThis.sessionStorage = storage
  server = await createServer({
    configFile: false,
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ login } = await server.ssrLoadModule('/src/api/auth.ts'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
})
beforeEach(() => {
  entries.clear()
  store = useAuthStore(createPinia())
  configureAuth(store)
})
afterEach(() => {
  store?.logout()
  store?.$dispose()
})
after(async () => {
  await server?.close()
  delete globalThis.sessionStorage
})

test('login sends JSON credentials in the POST body without changing the password', async () => {
  http.defaults.adapter = async (config) => {
    assert.equal(config.method, 'post')
    assert.equal(config.url, '/api/auth/login')
    assert.deepEqual(JSON.parse(config.data), { account: '15130097995', password: ' user ' })
    assert.equal(config.headers.Authorization, undefined)
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
  assert.equal(entries.size, 0)
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
  const [key, value] = [...entries][0]
  entries.set(key, JSON.stringify({ ...JSON.parse(value), expiresAt: Date.now() - 1 }))
  let restored = useAuthStore(createPinia())
  assert.equal(restored.isAuthenticated, false)
  assert.equal(entries.size, 0)
  restored.$dispose()
  entries.set(key, '{invalid json')
  restored = useAuthStore(createPinia())
  assert.equal(restored.isAuthenticated, false)
  assert.equal(entries.size, 0)
  restored.$dispose()
})

test('API requests use Bearer authorization and a matching HTTP 401 clears the session', async () => {
  http.defaults.adapter = adapter(response())
  await store.signIn({ account: '15130097995', password: 'user' })
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.Authorization, 'Bearer test-access-token')
    const error = new Error('Unauthorized')
    error.isAxiosError = true
    error.config = config
    error.response = { status: 401, config }
    throw error
  }
  await assert.rejects(http.get('/api/orders'))
  assert.equal(store.isAuthenticated, false)
  assert.equal(entries.size, 0)
})

test('failed re-login does not clear a current session', async () => {
  http.defaults.adapter = adapter(response())
  await store.signIn({ account: '15130097995', password: 'user' })
  http.defaults.adapter = async (config) => {
    assert.equal(config.headers.Authorization, undefined)
    const error = new Error('Unauthorized')
    error.isAxiosError = true
    error.config = config
    error.response = { status: 401, config }
    throw error
  }
  await assert.rejects(login({ account: '15130097995', password: 'wrong' }))
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
  assert.equal(entries.size, 0)
})
