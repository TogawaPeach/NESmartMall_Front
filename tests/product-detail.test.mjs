import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createServer } from 'vite'
import { AxiosError } from 'axios'
import { createRenderer } from 'vue'
import { createMemoryHistory, createRouter } from 'vue-router'

let server, http, configureAuth, queryProductDetail, useProductDetail, useAuthStore, createPinia
let fixture
const requests = []
const entries = new Map()
const user = { id: 'detail-user', account: 'detail-user', nickname: '测试用户', role: 1 }
const product = (overrides = {}) => ({
  id: '123',
  name: '全站仪',
  model: 'NTS-332R',
  coverUrl: 'https://images.example.test/cover.jpg',
  price: 990000,
  sales: 36,
  stock: 20,
  detailImages: ['https://images.example.test/second.jpg', 'https://images.example.test/first.jpg'],
  ...overrides,
})
const response = (config, data, status = 200) => ({
  data,
  status,
  statusText: 'OK',
  headers: {},
  config,
})
const flush = async () => {
  await new Promise((resolve) => setImmediate(resolve))
}

before(async () => {
  globalThis.localStorage = {
    getItem: (key) => entries.get(key) ?? null,
    setItem: (key, value) => entries.set(key, value),
    removeItem: (key) => entries.delete(key),
  }
  globalThis.sessionStorage = { getItem: () => null, removeItem: () => {} }
  globalThis.window = Object.assign(new EventTarget(), {
    location: { href: 'https://mall.example.test/products/123' },
  })
  server = await createServer({
    configFile: false,
    define: { 'import.meta.env.VITE_API_BASE_URL': JSON.stringify('') },
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
  ;({ http, configureAuth } = await server.ssrLoadModule('/src/api/http.ts'))
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  // Keep API and composable tests on the same shared HTTP client as production.
})
beforeEach(() => {
  entries.clear()
  requests.length = 0
  configureAuth({ getAuthorization: () => 'Bearer detail-token', logout: () => {} })
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return response(config, { code: 200, message: 'OK', data: product() })
  }
})
afterEach(() => {
  fixture?.app?.unmount()
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
async function query(id = '123', options) {
  ;({ queryProductDetail } = await server.ssrLoadModule('/src/api/productDetail.ts'))
  return queryProductDetail(id, options)
}
function useReply(makeReply) {
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return response(config, makeReply(config))
  }
}

test('detail directly fetches content without detail-entry, sends auth and preserves image order', async () => {
  const detail = await query()
  assert.deepEqual(
    requests.map((r) => [r.method, r.url]),
    [['get', '/api/products/123']],
  )
  assert.ok(requests.every((r) => r.headers.get('Authorization') === 'Bearer detail-token'))
  assert.equal(detail.priceFen, 990000)
  assert.equal(detail.model, 'NTS-332R')
  assert.equal(detail.stock, 20)
  assert.deepEqual(detail.detailImages, [
    'https://images.example.test/second.jpg',
    'https://images.example.test/first.jpg',
  ])
})

test('detail preserves BIGINT string ids without rounding', async () => {
  useReply(() => ({ code: 200, data: product({ id: '9223372036854775807' }) }))
  assert.equal((await query('9223372036854775807')).id, '9223372036854775807')
  assert.equal(requests[0].url, '/api/products/9223372036854775807')
})

test('malformed ids never reach the API', async () => {
  for (const id of ['', 'page', '../auth', '0', '-1', '1?x=2']) await assert.rejects(query(id))
  assert.equal(requests.length, 0)
})

test('empty details and zero price, sales and stock remain real values; model may be omitted', async () => {
  useReply(() => ({
    code: 200,
    data: product({
      model: undefined,
      coverUrl: null,
      price: 0,
      sales: 0,
      stock: 0,
      detailImages: [],
    }),
  }))
  const detail = await query()
  assert.equal(detail.model, null)
  assert.equal(detail.priceFen, 0)
  assert.equal(detail.sales, 0)
  assert.equal(detail.stock, 0)
  assert.deepEqual(detail.detailImages, [])
})

test('bad content cannot display another product, invalid stock or a stringified image array', async () => {
  for (const overrides of [
    { id: '124' },
    { id: Number.MAX_SAFE_INTEGER + 1 },
    { name: '' },
    { stock: -1 },
    { stock: 1.5 },
    { sales: null },
    { price: 0.5 },
    { price: undefined },
    { coverUrl: undefined },
    { detailImages: null },
    { detailImages: '[]' },
    { detailImages: ['javascript:alert(1)'] },
  ]) {
    useReply(() => ({ code: 200, data: product(overrides) }))
    await assert.rejects(query(), { name: 'ProductResponseError' })
  }
})

test('business failures distinguish login, forbidden access and unavailable goods', async () => {
  for (const [body, kind] of [
    [{ code: 401 }, 'login-required'],
    [{ code: 403 }, 'forbidden'],
    [{ code: 404 }, 'unavailable'],
  ]) {
    useReply(() => body)
    await assert.rejects(query(), (error) => error.kind === kind)
    assert.equal(requests.at(-1).url, '/api/products/123')
  }
})

test('HTTP 500 takes precedence over a misleading business 401', async () => {
  http.defaults.adapter = async (config) => {
    throw new AxiosError(
      'server failure',
      'ERR_BAD_RESPONSE',
      config,
      null,
      response(config, { code: 401 }, 500),
    )
  }
  await assert.rejects(query(), { name: 'ProductResponseError' })
})

async function mount({ adapter, authenticated = false, path = '/products/123' } = {}) {
  if (authenticated)
    entries.set(
      'nesmartmall.auth',
      JSON.stringify({
        accessToken: 'detail-token',
        tokenType: 'Bearer',
        expiresAt: Date.now() + 3600_000,
        user,
      }),
    )
  const pinia = createPinia()
  const auth = useAuthStore(pinia)
  configureAuth(auth)
  if (adapter)
    http.defaults.adapter = async (config) => {
      requests.push(config)
      return adapter(config)
    }
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [{ path: '/products/:id', name: 'product-detail', component: {} }],
  })
  await router.push(path)
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  fixture = { auth }
  ;({ useProductDetail } = await server.ssrLoadModule('/src/composables/useProductDetail.ts'))
  let detail
  const app = renderer.createApp({
    setup: () => {
      detail = useProductDetail()
      return () => null
    },
  })
  app.use(pinia)
  app.use(router)
  fixture = { app, auth, router }
  app.mount({})
  await flush()
  return { ...fixture, detail }
}

test('direct detail navigation and retry only query content and recover a network failure', async () => {
  let fail = true
  const { detail } = await mount({
    adapter: async (config) => {
      if (fail) throw new AxiosError('network', 'ERR_NETWORK', config)
      return response(config, { code: 200, data: product() })
    },
  })
  assert.equal(detail.state.value, 'error')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123'],
  )
  fail = false
  await detail.retry()
  assert.equal(detail.state.value, 'success')
  assert.equal(detail.product.value.name, '全站仪')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123', '/api/products/123'],
  )
})

test('a protected detail waits after 401 and automatically resumes after login', async () => {
  const { detail, auth } = await mount({
    adapter: async (config) => {
      if (!config.headers.get('Authorization')) return response(config, { code: 401 })
      return response(config, { code: 200, data: product() })
    },
  })
  assert.equal(detail.state.value, 'login-required')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123'],
  )
  // Establish a session via the public store API and the real login response contract.
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return response(
      config,
      config.url === '/api/auth/login'
        ? {
            code: 200,
            data: {
              accessToken: 'detail-token',
              tokenType: 'Bearer',
              expiresIn: 3600,
              user,
            },
          }
        : { code: 200, data: product() },
    )
  }
  await auth.signIn({ account: 'detail-user', password: 'test-only' })
  await flush()
  assert.equal(detail.state.value, 'success')
  assert.equal(detail.product.value.id, '123')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123', '/api/auth/login', '/api/products/123'],
  )
  assert.equal(requests.at(-1).headers.get('Authorization'), 'Bearer detail-token')
})

test('changing product aborts the old request and late content cannot replace the new item', async () => {
  let release
  let oldSignal
  const { detail, router } = await mount({
    adapter: async (config) => {
      const id = config.url.includes('/124') ? '124' : '123'
      if (id === '123') {
        oldSignal = config.signal
        return new Promise((resolve) => {
          release = () => resolve(response(config, { code: 200, data: product() }))
        })
      }
      return response(config, { code: 200, data: product({ id: '124', name: '第二件商品' }) })
    },
  })
  await router.push('/products/124')
  await flush()
  assert.equal(oldSignal.aborted, true)
  assert.equal(detail.product.value.id, '124')
  release()
  await flush()
  assert.equal(detail.product.value.id, '124')
  assert.equal(detail.state.value, 'success')
})

test('logout removes displayed content and does not leave protected data on screen', async () => {
  const { detail, auth } = await mount({
    authenticated: true,
    adapter: async (config) =>
      response(
        config,
        !config.headers.get('Authorization') ? { code: 401 } : { code: 200, data: product() },
      ),
  })
  assert.equal(detail.state.value, 'success')
  auth.logout()
  await flush()
  assert.equal(detail.product.value, null)
  assert.equal(detail.state.value, 'login-required')
})

test('detail prices retain every cent at zero and the largest allowed integer amount', async () => {
  const { formatPriceFen } = await server.ssrLoadModule('/src/utils/price.ts')
  assert.equal(formatPriceFen(0), '0.00')
  assert.equal(formatPriceFen(990000), '9,900.00')
  assert.equal(formatPriceFen(9007199254740991), '90,071,992,547,409.91')
})

test('empty images keep the product in success state with nullable cover and price', async () => {
  const { detail } = await mount({
    adapter: async (config) =>
      response(config, {
        code: 200,
        data: product({ model: null, coverUrl: null, price: null, detailImages: [] }),
      }),
  })
  assert.equal(detail.state.value, 'success')
  assert.equal(detail.product.value.name, '全站仪')
  assert.equal(detail.product.value.stock, 20)
  assert.equal(detail.product.value.imageUrl, null)
  assert.equal(detail.product.value.priceFen, null)
  assert.deepEqual(detail.product.value.detailImages, [])
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123'],
  )
})

test('remounting a detail URL after refresh reads content directly again', async () => {
  const first = await mount()
  assert.equal(first.detail.state.value, 'success')
  first.app.unmount()
  first.auth.$dispose()
  fixture = undefined
  const refreshed = await mount()
  assert.equal(refreshed.detail.state.value, 'success')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123', '/api/products/123'],
  )
})

for (const transport of ['business', 'http']) {
  for (const [status, state] of [
    [401, 'login-required'],
    [403, 'forbidden'],
    [404, 'unavailable'],
    [500, 'error'],
  ]) {
    test(`${transport} ${status} shows ${state} and preserves sessions except on 401`, async () => {
      const { detail, auth } = await mount({
        authenticated: true,
        adapter: async (config) => {
          const body = {
            code: status,
            message: status === 404 ? '商品不存在' : '查询失败',
            data: null,
          }
          if (transport === 'http') {
            // A conflicting body must not turn HTTP failures into another state.
            throw new AxiosError(
              'request failed',
              'ERR_BAD_RESPONSE',
              config,
              null,
              response(config, { ...body, code: 200 }, status),
            )
          }
          return response(config, body)
        },
      })
      assert.equal(detail.state.value, state)
      assert.equal(detail.product.value, null)
      assert.equal(auth.accessToken, status === 401 ? null : 'detail-token')
      assert.ok(requests.every((r) => r.url === '/api/products/123'))
    })
  }
}

test('service and malformed-response failures can retry the same content endpoint', async () => {
  let body = { code: 500, message: '查询失败', data: null }
  const { detail } = await mount({ adapter: async (config) => response(config, body) })
  assert.equal(detail.state.value, 'error')
  body = { code: 200, data: product({ detailImages: '[]' }) }
  await detail.retry()
  assert.equal(detail.state.value, 'error')
  body = { code: 200, data: product() }
  await detail.retry()
  assert.equal(detail.state.value, 'success')
  assert.deepEqual(
    requests.map((r) => r.url),
    ['/api/products/123', '/api/products/123', '/api/products/123'],
  )
})

test('leaving the page aborts pending content and ignores its late result', async () => {
  let release, signal
  const { app, detail } = await mount({
    adapter: async (config) => {
      signal = config.signal
      return new Promise((resolve) => {
        release = () => resolve(response(config, { code: 200, data: product() }))
      })
    },
  })
  app.unmount()
  fixture.app = undefined
  assert.equal(signal.aborted, true)
  release()
  await flush()
  assert.equal(detail.product.value, null)
})
