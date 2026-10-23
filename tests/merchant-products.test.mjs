import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createRenderer } from 'vue'
import { createServer } from 'vite'

let server,
  http,
  configureAuth,
  useAuthStore,
  createPinia,
  useMerchantProductPage,
  queryMerchantProductPage,
  merchantProductDisplay,
  useMerchantStats
let fixture
const storage = new Map()
const user = { id: 'merchant-1', account: 'merchant', nickname: '商家', role: 0 }
const session = (overrides = {}) => ({
  accessToken: 'merchant-token',
  tokenType: 'Bearer',
  expiresAt: Date.now() + 3600_000,
  user,
  ...overrides,
})
const item = (overrides = {}) => ({
  id: '9223372036854775806',
  name: '全站仪',
  model: 'TS-02',
  coverUrl: 'https://example.test/cover.webp',
  categoryId: 1,
  price: 1980000,
  stock: 0,
  status: 1,
  isSeckill: false,
  seckillStartTime: null,
  seckillEndTime: null,
  ...overrides,
})
const body = (overrides = {}) => ({
  code: 200,
  data: { list: [item()], total: 17, pageNum: 1, pageSize: 8, ...overrides },
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
  ;({ queryMerchantProductPage } = await server.ssrLoadModule('/src/api/merchantProducts.ts'))
  ;({ useMerchantProductPage } = await server.ssrLoadModule(
    '/src/composables/useMerchantProductPage.ts',
  ))
  ;({ merchantProductDisplay } = await server.ssrLoadModule('/src/utils/merchantProduct.ts'))
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

async function mount({ identity = session(), response = body(), adapter, withStats = false } = {}) {
  if (identity) storage.set('nesmartmall.auth', JSON.stringify(identity))
  const pinia = createPinia(),
    auth = useAuthStore(pinia),
    requests = []
  configureAuth(auth)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return adapter ? adapter(config) : reply(config, response)
  }
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let page, stats
  const app = renderer.createApp({
    setup() {
      page = useMerchantProductPage()
      if (withStats) stats = useMerchantStats()
      return () => null
    },
  })
  app.use(pinia)
  fixture = { app, auth, requests }
  app.mount({})
  await flush()
  return { ...fixture, page, stats }
}

test('initial list uses one Bearer GET with pageNum/pageSize and adapts real rows and total', async () => {
  const { page, requests } = await mount()
  assert.equal(requests.length, 1)
  assert.equal(requests[0].url, '/api/merchant/products/page')
  assert.equal(requests[0].method, 'get')
  assert.equal(requests[0].data, undefined)
  assert.deepEqual(requests[0].params, { pageNum: 1, pageSize: 8 })
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer merchant-token')
  assert.equal(page.total.value, 17)
  assert.equal(page.products.value.length, 1)
  assert.equal(page.products.value[0].id, item().id)
  assert.equal(page.products.value[0].categoryLabel, '全站仪')
  assert.equal(page.products.value[0].priceFen, 1980000)
  assert.equal(page.products.value[0].stock, 0)
  assert.equal(page.products.value[0].status, 1)
  assert.equal(page.state.value, 'success')
})

test('status filter resets to page 1 and paging/retry preserve status without keyword', async () => {
  const { page, requests } = await mount({
    adapter: async (config) => reply(config, body({ pageNum: config.params.pageNum, total: 40 })),
  })
  page.changePage(2)
  await flush()
  assert.equal(requests.at(-1).params.pageNum, 2)
  page.selectStatus('off-shelf')
  await flush()
  assert.deepEqual(requests.at(-1).params, { pageNum: 1, pageSize: 8, status: 'off-shelf' })
  page.changePage(2)
  await flush()
  assert.deepEqual(requests.at(-1).params, { pageNum: 2, pageSize: 8, status: 'off-shelf' })
  await page.retry()
  assert.deepEqual(requests.at(-1).params, { pageNum: 2, pageSize: 8, status: 'off-shelf' })
  page.resetFilters()
  await flush()
  assert.deepEqual(requests.at(-1).params, { pageNum: 1, pageSize: 8 })
})

test('page requests omit keyword even if an obsolete caller supplies one', async () => {
  const { requests } = await mount()
  await queryMerchantProductPage({ pageNum: 1, keyword: 'RTK' })
  assert.deepEqual(requests.at(-1).params, { pageNum: 1, pageSize: 8 })
})

test('list keeps known detail links distinct from images that were not returned', async () => {
  await mount()
  http.defaults.adapter = async (config) =>
    reply(
      config,
      body({
        list: [
          item({ detailImages: ['https://example.test/a.jpg', 'https://example.test/b.jpg'] }),
        ],
      }),
    )
  assert.deepEqual((await queryMerchantProductPage({ pageNum: 1 })).list[0].detailImages, [
    'https://example.test/a.jpg',
    'https://example.test/b.jpg',
  ])
  http.defaults.adapter = async (config) =>
    reply(config, body({ list: [item({ detailImages: [] })] }))
  assert.deepEqual((await queryMerchantProductPage({ pageNum: 1 })).list[0].detailImages, [])
  http.defaults.adapter = async (config) => reply(config, body())
  assert.equal((await queryMerchantProductPage({ pageNum: 1 })).list[0].detailImages, undefined)
  http.defaults.adapter = async (config) =>
    reply(config, body({ list: [item({ detailImages: null })] }))
  await assert.rejects(queryMerchantProductPage({ pageNum: 1 }))
})

test('category numbers, nullable prices and covers, and blank normal-product times have defined display values', async () => {
  await mount()
  const labels = ['未分类', '全站仪', 'GNSS / RTK', '水准仪', '测距仪', '配件', '未知分类']
  for (let categoryId = 0; categoryId <= 6; categoryId++) {
    http.defaults.adapter = async (config) =>
      reply(
        config,
        body({
          list: [
            item({
              categoryId,
              price: null,
              coverUrl: 'javascript:alert(1)',
              model: null,
              seckillStartTime: '',
              seckillEndTime: undefined,
            }),
          ],
        }),
      )
    const result = await queryMerchantProductPage({ pageNum: 1 })
    assert.equal(result.list[0].categoryLabel, labels[categoryId])
    assert.equal(result.list[0].priceFen, null)
    assert.equal(result.list[0].imageUrl, null)
    assert.equal(result.list[0].model, '')
    assert.equal(result.list[0].startsAtMs, null)
  }
})

test('rejects malformed paging/core fields, duplicate IDs and invalid business envelopes', async () => {
  await mount()
  const broken = [
    body({ list: null }),
    body({ total: '17' }),
    body({ total: -1 }),
    body({ pageNum: 2 }),
    body({ pageSize: 12 }),
    body({ total: 0 }),
    body({ list: [item(), item()] }),
    body({ list: Array.from({ length: 9 }, (_, i) => item({ id: String(i + 1) })) }),
    null,
    { code: 500, data: null },
    { code: '200', data: body().data },
  ]
  for (const field of [
    { id: 9223372036854775806 },
    { name: '' },
    { price: -1 },
    { price: '100' },
    { stock: 1.5 },
    { stock: -1 },
    { status: 9 },
    { isSeckill: 1 },
    { categoryId: '1' },
  ])
    broken.push(body({ list: [item(field)] }))
  for (const response of broken) {
    http.defaults.adapter = async (config) => reply(config, response)
    await assert.rejects(queryMerchantProductPage({ pageNum: 1 }))
  }
})

test('empty results succeed without demo rows; pending/error/retry do not invent totals or rows', async () => {
  let finish
  const { page } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        finish = (response) => resolve(reply(config, response))
      }),
  })
  assert.equal(page.state.value, 'loading')
  assert.equal(page.total.value, null)
  assert.deepEqual(page.products.value, [])
  finish({ code: 500, data: null })
  await flush()
  assert.equal(page.state.value, 'error')
  assert.equal(page.total.value, null)
  assert.deepEqual(page.products.value, [])
  http.defaults.adapter = async (config) => reply(config, body({ list: [], total: 0 }))
  await page.retry()
  assert.equal(page.state.value, 'empty')
  assert.equal(page.total.value, 0)
})

test('out-of-range page corrects to last page and requests it with the same filters', async () => {
  const { page, requests } = await mount({
    adapter: async (config) =>
      reply(
        config,
        body({
          pageNum: config.params.pageNum,
          total: config.params.pageNum > 1 ? 1 : 17,
          list: config.params.pageNum > 1 ? [] : [item()],
        }),
      ),
  })
  page.changePage(3)
  await flush()
  await flush()
  assert.deepEqual(
    requests.map((config) => config.params.pageNum),
    [1, 3, 1],
  )
  assert.equal(page.pageNum.value, 1)
  assert.equal(page.state.value, 'success')
  const count = requests.length
  page.changePage(0)
  page.changePage(Number.MAX_SAFE_INTEGER + 1)
  await flush()
  assert.equal(requests.length, count)
})

test('late earlier queries cannot replace a newer filter and are cancelled', async () => {
  const pending = []
  const { page } = await mount({
    adapter: (config) => new Promise((resolve) => pending.push({ config, resolve })),
  })
  page.selectStatus('off-shelf')
  await flush()
  assert.equal(pending[0].config.signal.aborted, true)
  pending[1].resolve(reply(pending[1].config, body({ list: [item({ status: 2 })] })))
  await flush()
  pending[0].resolve(reply(pending[0].config, body()))
  await flush()
  assert.equal(page.products.value[0].status, 2)
})

test('anonymous/customer sessions do not request products; logout clears pending data', async () => {
  const anonymous = await mount({ identity: null })
  assert.equal(anonymous.requests.length, 0)
  assert.equal(anonymous.page.state.value, 'login-required')
  anonymous.app.unmount()
  anonymous.auth.$dispose()
  storage.clear()
  const customer = await mount({ identity: session({ user: { ...user, role: 1 } }) })
  assert.equal(customer.requests.length, 0)
  assert.equal(customer.page.state.value, 'forbidden')
})

test('merchant identity changes reset query and ignore the old response; unmount aborts the new one', async () => {
  const pending = []
  const { page, auth, app } = await mount({
    adapter: (config) => new Promise((resolve) => pending.push({ config, resolve })),
  })
  storage.set(
    'nesmartmall.auth',
    JSON.stringify(session({ accessToken: 'new-token', user: { ...user, id: 'merchant-2' } })),
  )
  storage.set('nesmartmall.auth.revision', 'new')
  auth.getAuthorization()
  await flush()
  assert.equal(pending[0].config.signal.aborted, true)
  assert.equal(pending.at(-1).config.headers.get('Authorization'), 'Bearer new-token')
  pending[0].resolve(reply(pending[0].config, body()))
  await flush()
  assert.deepEqual(page.products.value, [])
  app.unmount()
  assert.equal(pending.at(-1).config.signal.aborted, true)
  pending.at(-1).resolve(reply(pending.at(-1).config, body()))
  await flush()
  assert.deepEqual(page.products.value, [])
})

test('HTTP error takes precedence over successful body; 403 is forbidden and 401 logs out', async () => {
  const { page, auth } = await mount({
    adapter: async (config) => {
      const error = new Error('503')
      error.isAxiosError = true
      error.response = reply(config, body(), 503)
      throw error
    },
  })
  assert.equal(page.state.value, 'error')
  http.defaults.adapter = async (config) => reply(config, { code: 403, data: null })
  await page.retry()
  assert.equal(page.state.value, 'forbidden')
  http.defaults.adapter = async (config) => reply(config, { code: 401, data: null })
  await page.retry()
  assert.equal(auth.accessToken, null)
  assert.equal(page.state.value, 'login-required')
  assert.deepEqual(page.products.value, [])
})

test('flash-sale stage changes at Beijing boundaries while original status remains unchanged', async () => {
  await mount()
  const startsAtMs = Date.UTC(2026, 9, 23, 10),
    endsAtMs = startsAtMs + 3600_000
  http.defaults.adapter = async (config) =>
    reply(
      config,
      body({
        list: [
          item({
            isSeckill: true,
            seckillStartTime: '2026-10-23T18:00:00',
            seckillEndTime: '2026-10-23T19:00:00',
          }),
        ],
      }),
    )
  const product = (await queryMerchantProductPage({ pageNum: 1 })).list[0]
  assert.equal(product.startsAtMs, startsAtMs)
  assert.equal(merchantProductDisplay(product, startsAtMs - 1).label, '未开始')
  assert.equal(merchantProductDisplay(product, startsAtMs).label, '正在秒杀')
  assert.equal(merchantProductDisplay(product, endsAtMs).label, '已结束')
  assert.equal(merchantProductDisplay({ ...product, status: 2 }, startsAtMs).label, '已下架')
  assert.equal(merchantProductDisplay({ ...product, status: 0 }, startsAtMs).label, '草稿')
  assert.equal(
    merchantProductDisplay({ ...product, startsAtMs: null }, startsAtMs).label,
    '秒杀时间异常',
  )
  assert.equal(
    merchantProductDisplay({ ...product, endsAtMs: startsAtMs }, startsAtMs).label,
    '秒杀时间异常',
  )
  assert.equal(product.status, 1)
})

test('local ticking and list paging never refetch store statistics or make write requests', async (context) => {
  context.mock.timers.enable({
    apis: ['Date', 'setInterval'],
    now: Date.UTC(2026, 9, 23, 9, 59, 59),
  })
  const { page, requests, stats } = await mount({
    withStats: true,
    adapter: async (config) =>
      reply(
        config,
        config.url.endsWith('/stats')
          ? { code: 200, data: { allCount: 17, onSaleCount: 12, offShelfCount: 5 } }
          : body({ pageNum: config.params.pageNum }),
      ),
  })
  const previous = page.now.value
  context.mock.timers.tick(2000)
  await flush()
  assert.equal(page.now.value, previous + 2000)
  assert.equal(requests.length, 2)
  page.changePage(2)
  await flush()
  assert.equal(requests.filter((config) => config.url.endsWith('/stats')).length, 1)
  assert.equal(stats.stats.value.allCount, 17)
  assert.ok(requests.every((config) => config.method === 'get'))
})
