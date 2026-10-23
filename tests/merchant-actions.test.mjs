import assert from 'node:assert/strict'
import { after, afterEach, before, beforeEach, test } from 'node:test'
import { createRenderer } from 'vue'
import { createServer } from 'vite'

let server,
  http,
  configureAuth,
  createPinia,
  useAuthStore,
  saveMerchantProduct,
  setMerchantProductStatus,
  buildMerchantProductInput,
  merchantProductDraft,
  useMerchantProductActions,
  fixture
const storage = new Map()
const user = { id: 'merchant-1', account: 'merchant', nickname: '商家', role: 0 }
const session = (overrides = {}) => ({
  accessToken: 'merchant-token',
  tokenType: 'Bearer',
  expiresAt: Date.now() + 3600_000,
  user,
  ...overrides,
})
const row = (overrides = {}) => ({
  id: '9223372036854775806',
  name: '全站仪',
  model: 'TS-02',
  imageUrl: 'https://example.test/cover.webp',
  detailImages: [],
  categoryId: 1,
  categoryLabel: '全站仪',
  priceFen: 1234567,
  stock: 12,
  status: 1,
  isSeckill: false,
  startsAtMs: null,
  endsAtMs: null,
  ...overrides,
})
const form = (overrides = {}) => ({
  name: ' 全站仪 ',
  model: 'TS-02',
  coverUrl: 'https://example.test/cover.webp',
  detailImages: [''],
  categoryId: 1,
  priceYuan: '12345.67',
  stock: '12',
  isSeckill: false,
  seckillStartTime: '',
  seckillEndTime: '',
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
  ;({ createPinia } = await server.ssrLoadModule('pinia'))
  ;({ useAuthStore } = await server.ssrLoadModule('/src/stores/auth.ts'))
  ;({ saveMerchantProduct, setMerchantProductStatus } = await server.ssrLoadModule(
    '/src/api/merchantProductActions.ts',
  ))
  ;({ buildMerchantProductInput, merchantProductDraft } = await server.ssrLoadModule(
    '/src/utils/merchantProductForm.ts',
  ))
  ;({ useMerchantProductActions } = await server.ssrLoadModule(
    '/src/composables/useMerchantProductActions.ts',
  ))
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

async function mount({ identity = session(), adapter, refresh = async () => {} } = {}) {
  if (identity) storage.set('nesmartmall.auth', JSON.stringify(identity))
  const pinia = createPinia(),
    auth = useAuthStore(pinia),
    requests = [],
    refreshes = []
  configureAuth(auth)
  http.defaults.adapter = async (config) => {
    requests.push(config)
    return adapter ? adapter(config) : reply(config, { code: 200, message: 'OK', data: null })
  }
  const renderer = createRenderer({
    createComment: () => ({}),
    insert: () => {},
    remove: () => {},
    parentNode: () => null,
    nextSibling: () => null,
  })
  let actions
  const app = renderer.createApp({
    setup() {
      actions = useMerchantProductActions(async (created) => {
        refreshes.push(created)
        await refresh(created)
      })
      return () => null
    },
  })
  app.use(pinia)
  fixture = { app, auth, requests }
  app.mount({})
  await flush()
  return { ...fixture, actions, refreshes }
}

test('new save payload omits id and system fields, uses integer fen and null normal-product times', async () => {
  await mount()
  const input = buildMerchantProductInput(
    form({ seckillStartTime: 'bad old time', seckillEndTime: 'bad old time' }),
  )
  assert.deepEqual(input, {
    name: '全站仪',
    model: 'TS-02',
    coverUrl: 'https://example.test/cover.webp',
    detailImages: [],
    categoryId: 1,
    price: 1234567,
    stock: 12,
    isSeckill: false,
    seckillStartTime: null,
    seckillEndTime: null,
  })
  assert.equal('id' in input, false)
  assert.equal('status' in input, false)
  assert.equal('merchantId' in input, false)
  assert.equal(buildMerchantProductInput(form({ priceYuan: '0.29', coverUrl: '' })).price, 29)
  assert.equal(buildMerchantProductInput(form({ coverUrl: '' })).coverUrl, null)
})

test('edit roundtrips cents and Beijing timestamps and sends string id and boolean flag', async () => {
  await mount()
  const product = row({
    isSeckill: true,
    startsAtMs: Date.UTC(2026, 9, 23, 10),
    endsAtMs: Date.UTC(2026, 9, 23, 11, 0, 0, 123),
  })
  const draft = merchantProductDraft(product)
  assert.equal(draft.priceYuan, '12345.67')
  assert.equal(draft.seckillStartTime, '2026-10-23T18:00:00')
  assert.equal(draft.seckillEndTime, '2026-10-23T19:00:00.123')
  const input = buildMerchantProductInput(draft, product.id)
  assert.equal(input.id, product.id)
  assert.equal(input.price, 1234567)
  assert.equal(input.isSeckill, true)
  assert.equal(input.seckillStartTime, '2026-10-23T18:00:00')
  assert.equal(
    buildMerchantProductInput(
      form({
        isSeckill: true,
        seckillStartTime: '2026-10-23T18:00',
        seckillEndTime: '2026-10-23T19:00',
      }),
    ).seckillStartTime,
    '2026-10-23T18:00:00',
  )
})

test('invalid forms are rejected before dispatch; disabled seckill clears old dates', async () => {
  const { requests } = await mount()
  for (const invalid of [
    { name: '' },
    { name: 'a'.repeat(81) },
    { model: 'a'.repeat(81) },
    { priceYuan: '0' },
    { priceYuan: '1.001' },
    { priceYuan: '100000000' },
    { priceYuan: '1e2' },
    { stock: '-1' },
    { stock: '1.5' },
    { stock: '1000000' },
    { categoryId: 6 },
    { coverUrl: 'javascript:alert(1)' },
    { isSeckill: true },
    { isSeckill: true, seckillStartTime: '2026-02-30T10:00', seckillEndTime: '2026-03-01T10:00' },
    { isSeckill: true, seckillStartTime: '2026-10-23T19:00', seckillEndTime: '2026-10-23T18:00' },
  ])
    assert.throws(() => buildMerchantProductInput(form(invalid)))
  assert.equal(requests.length, 0)
  assert.equal(
    buildMerchantProductInput(
      form({
        isSeckill: false,
        seckillStartTime: '2026-10-23T18:00',
        seckillEndTime: '2026-10-23T19:00',
      }),
    ).seckillEndTime,
    null,
  )
})

test('save and status use distinct Bearer POST endpoints and accept data=null success', async () => {
  const { requests } = await mount()
  await saveMerchantProduct(buildMerchantProductInput(form()), {
    expectedAuthorization: 'Bearer merchant-token',
  })
  await saveMerchantProduct(buildMerchantProductInput(form(), row().id))
  await setMerchantProductStatus(row().id, 2)
  assert.equal(requests[0].url, '/api/merchant/products/save')
  assert.equal(requests[1].url, requests[0].url)
  assert.equal(JSON.parse(requests[1].data).id, row().id)
  assert.equal(requests[2].url, `/api/merchant/products/${row().id}/status`)
  assert.deepEqual(JSON.parse(requests[2].data), { status: 2 })
  assert.ok(
    requests.every(
      (config) =>
        config.method === 'post' &&
        config.headers.get('Authorization') === 'Bearer merchant-token' &&
        !config.params,
    ),
  )
})

test('write failures reject without retries, backend business message is preserved as text', async () => {
  const { requests } = await mount({
    adapter: async (config) => reply(config, { code: 409, message: '库存不足', data: null }),
  })
  await assert.rejects(saveMerchantProduct(buildMerchantProductInput(form())), /库存不足/)
  assert.equal(requests.length, 1)
  for (const response of [null, [], { code: '200', data: null }, { code: 500, data: null }]) {
    http.defaults.adapter = async (config) => reply(config, response)
    await assert.rejects(setMerchantProductStatus(row().id, 2))
  }
  http.defaults.adapter = async (config) => {
    const error = new Error('503')
    error.isAxiosError = true
    error.response = reply(config, { code: 200, data: null }, 503)
    throw error
  }
  await assert.rejects(saveMerchantProduct(buildMerchantProductInput(form())))
})

test('new/edit open correctly, successful save closes editor then refreshes current data', async () => {
  const { actions, refreshes, requests } = await mount()
  actions.openEditor()
  assert.equal(actions.editorVisible.value, true)
  assert.equal(actions.editingProduct.value, null)
  assert.equal(await actions.save(form()), true)
  assert.equal(actions.editorVisible.value, false)
  assert.deepEqual(refreshes, [true])
  assert.ok(actions.successMessage.value)
  actions.openEditor(row())
  assert.equal(actions.editingProduct.value.id, row().id)
  assert.equal(await actions.save(form({ priceYuan: '10.99' })), true)
  assert.deepEqual(refreshes, [true, false])
  assert.equal(JSON.parse(requests[1].data).price, 1099)
})

test('failed save keeps editor open and does not refresh or mutate rows', async () => {
  const { actions, refreshes } = await mount({
    adapter: async (config) => reply(config, { code: 500, message: '保存失败', data: null }),
  })
  const product = row()
  actions.openEditor(product)
  assert.equal(await actions.save(form({ name: '修改名称' })), false)
  assert.equal(actions.editorVisible.value, true)
  assert.equal(actions.editorError.value, '保存失败')
  assert.equal(product.name, '全站仪')
  assert.equal(refreshes.length, 0)
  assert.equal(actions.successMessage.value, '')
})

test('invalid save and zero-stock listing are blocked without HTTP or false success', async () => {
  const { actions, requests } = await mount()
  actions.openEditor()
  assert.equal(await actions.save(form({ priceYuan: '0' })), false)
  assert.ok(actions.editorError.value)
  assert.equal(await actions.changeStatus(row({ status: 2, stock: 0 })), false)
  assert.ok(actions.errorMessage.value)
  assert.equal(requests.length, 0)
})

test('pending save blocks duplicate submission, editor replacement and status writes', async () => {
  let finish
  const { actions, requests } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        finish = () => resolve(reply(config, { code: 200, data: null }))
      }),
  })
  actions.openEditor(row())
  const pending = actions.save(form())
  await flush()
  assert.equal(actions.saving.value, true)
  assert.equal(actions.busy.value, true)
  assert.equal(await actions.save(form()), false)
  assert.equal(await actions.changeStatus(row()), false)
  actions.openEditor()
  assert.equal(actions.editingProduct.value.id, row().id)
  assert.equal(requests.length, 1)
  finish()
  assert.equal(await pending, true)
  assert.equal(actions.busy.value, false)
})

test('status success posts raw status, leaves row untouched and refreshes list/stats once', async () => {
  const { actions, requests, refreshes } = await mount()
  const product = row({ isSeckill: true })
  assert.equal(await actions.changeStatus(product), false)
  assert.equal(requests.length, 0)
  assert.equal(await actions.confirmOffShelf(), true)
  assert.deepEqual(JSON.parse(requests[0].data), { status: 2 })
  assert.equal(product.status, 1)
  assert.deepEqual(refreshes, [false])
  assert.equal(actions.successMessage.value, '商品已下架')
})

test('refresh failure after a successful write is reported without resending the write', async () => {
  const { actions, requests } = await mount({
    refresh: async () => {
      throw new Error('GET failed')
    },
  })
  actions.openEditor()
  assert.equal(await actions.save(form()), true)
  assert.equal(requests.length, 1)
  assert.equal(actions.editorVisible.value, false)
  assert.ok(actions.successMessage.value)
  assert.match(actions.errorMessage.value, /刷新失败/)
})

test('switching accounts while saving aborts and prevents late success or refresh', async () => {
  let finish, signal
  const { actions, auth, refreshes } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        signal = config.signal
        finish = () => resolve(reply(config, { code: 200, data: null }))
      }),
  })
  actions.openEditor()
  const pending = actions.save(form())
  await flush()
  storage.set(
    'nesmartmall.auth',
    JSON.stringify(session({ accessToken: 'new-token', user: { ...user, id: 'merchant-2' } })),
  )
  storage.set('nesmartmall.auth.revision', 'new')
  auth.getAuthorization()
  await flush()
  assert.equal(signal.aborted, true)
  assert.equal(actions.editorVisible.value, false)
  finish()
  assert.equal(await pending, false)
  assert.equal(actions.successMessage.value, '')
  assert.equal(refreshes.length, 0)
})

test('an unseen cross-tab account change before dispatch cannot submit the old form as the new merchant', async () => {
  const { actions, requests, refreshes } = await mount()
  actions.openEditor()
  storage.set(
    'nesmartmall.auth',
    JSON.stringify(session({ accessToken: 'new-token', user: { ...user, id: 'merchant-2' } })),
  )
  storage.set('nesmartmall.auth.revision', 'changed-before-dispatch')
  assert.equal(await actions.save(form()), false)
  assert.equal(requests.length, 0)
  assert.equal(refreshes.length, 0)
  assert.equal(actions.editorVisible.value, false)
  assert.equal(actions.successMessage.value, '')
})

test('an unseen account change cannot submit a previous merchant row status', async () => {
  const { actions, requests } = await mount()
  storage.set(
    'nesmartmall.auth',
    JSON.stringify(session({ accessToken: 'new-token', user: { ...user, id: 'merchant-2' } })),
  )
  storage.set('nesmartmall.auth.revision', 'changed-before-status')
  assert.equal(await actions.changeStatus(row()), false)
  assert.equal(requests.length, 0)
})

test('unmount cancels status wait and late responses cannot refresh or show success', async () => {
  let finish, signal
  const { actions, app, refreshes } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        signal = config.signal
        finish = () => resolve(reply(config, { code: 200, data: null }))
      }),
  })
  await actions.changeStatus(row())
  const pending = actions.confirmOffShelf()
  await flush()
  app.unmount()
  assert.equal(signal.aborted, true)
  finish()
  assert.equal(await pending, false)
  assert.equal(refreshes.length, 0)
  assert.equal(actions.successMessage.value, '')
})

test('detail links default to one blank field and serialize only ordered nonempty HTTP links', async () => {
  await mount()
  assert.deepEqual(merchantProductDraft(null).detailImages, [''])
  const product = row({
    status: 2,
    detailImages: ['https://example.test/a.jpg', 'https://example.test/b.jpg'],
  })
  const draft = merchantProductDraft(product)
  assert.deepEqual(draft.detailImages, product.detailImages)
  draft.detailImages.push('')
  assert.equal(product.detailImages.length, 2)
  assert.deepEqual(
    buildMerchantProductInput(
      form({
        detailImages: [' ', ' https://example.test/b.jpg ', '', 'https://example.test/a.jpg'],
      }),
    ).detailImages,
    ['https://example.test/b.jpg', 'https://example.test/a.jpg'],
  )
  assert.deepEqual(buildMerchantProductInput(form({ detailImages: ['', ' '] })).detailImages, [])
  assert.throws(
    () => buildMerchantProductInput(form({ detailImages: ['javascript:alert(1)'] })),
    /详情图/,
  )
})

test('missing detail images are fetched from the merchant endpoint before opening edit', async () => {
  const { actions, requests } = await mount({
    adapter: async (config) =>
      reply(config, { code: 200, data: { detailImages: ['https://example.test/existing.jpg'] } }),
  })
  await actions.openEditor(row({ status: 2, detailImages: undefined }))
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'get')
  assert.equal(requests[0].url, `/api/merchant/products/${row().id}`)
  assert.equal(requests[0].headers.get('Authorization'), 'Bearer merchant-token')
  assert.equal(actions.editorVisible.value, true)
  assert.deepEqual(actions.editingProduct.value.detailImages, ['https://example.test/existing.jpg'])
})

test('unknown or failed image retrieval never opens an empty editor or permits save', async () => {
  const { actions, requests } = await mount({
    adapter: async (config) => reply(config, { code: 200, data: {} }),
  })
  await actions.openEditor(row({ status: 2, detailImages: undefined }))
  assert.equal(actions.editorVisible.value, false)
  assert.ok(actions.errorMessage.value)
  assert.equal(await actions.save(form()), false)
  assert.equal(requests.filter((config) => config.method === 'post').length, 0)
})

test('late image loading cannot open an editor after the merchant changes', async () => {
  let finish, signal
  const { actions, auth } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        signal = config.signal
        finish = () => resolve(reply(config, { code: 200, data: { detailImages: [] } }))
      }),
  })
  const opening = actions.openEditor(row({ status: 2, detailImages: undefined }))
  await flush()
  assert.equal(actions.loadingEditor.value, true)
  auth.logout()
  assert.equal(signal.aborted, true)
  finish()
  await opening
  assert.equal(actions.editorVisible.value, false)
})

test('off-shelf requires confirmation and cancel sends no write or refresh', async () => {
  const { actions, requests, refreshes } = await mount()
  await actions.changeStatus(row())
  assert.equal(actions.offShelfVisible.value, true)
  assert.equal(actions.offShelfProduct.value.id, row().id)
  assert.equal(requests.length, 0)
  actions.cancelOffShelf()
  assert.equal(actions.offShelfVisible.value, false)
  assert.equal(await actions.confirmOffShelf(), false)
  assert.equal(requests.length, 0)
  assert.equal(refreshes.length, 0)
})

test('off-shelf confirmation prevents duplicates and failure retains the confirmation', async () => {
  let finish
  const { actions, requests } = await mount({
    adapter: (config) =>
      new Promise((resolve) => {
        finish = () => resolve(reply(config, { code: 409, message: '下架失败', data: null }))
      }),
  })
  await actions.changeStatus(row())
  const pending = actions.confirmOffShelf()
  await flush()
  assert.equal(requests.length, 1)
  assert.equal(await actions.confirmOffShelf(), false)
  actions.cancelOffShelf()
  assert.equal(actions.offShelfVisible.value, true)
  finish()
  assert.equal(await pending, false)
  assert.equal(actions.offShelfVisible.value, true)
  assert.equal(actions.errorMessage.value, '下架失败')
})

test('an unseen account change before confirmation cancels without submitting old product', async () => {
  const { actions, requests } = await mount()
  await actions.changeStatus(row())
  storage.set(
    'nesmartmall.auth',
    JSON.stringify(session({ accessToken: 'new-token', user: { ...user, id: 'merchant-2' } })),
  )
  storage.set('nesmartmall.auth.revision', 'new-before-confirm')
  assert.equal(await actions.confirmOffShelf(), false)
  assert.equal(actions.offShelfVisible.value, false)
  assert.equal(requests.length, 0)
})

test('on-sale editing never fetches or submits detail images, preserving existing pictures', async () => {
  const { actions, requests } = await mount()
  await actions.openEditor(row({ detailImages: undefined }))
  assert.equal(requests.length, 0)
  assert.equal(actions.editorVisible.value, true)
  assert.equal(
    await actions.save(form({ detailImages: ['https://example.test/should-not-submit.jpg'] })),
    true,
  )
  assert.equal(requests.length, 1)
  assert.equal(requests[0].method, 'post')
  assert.equal('detailImages' in JSON.parse(requests[0].data), false)
  // Keep the listed-product view until the dialog's closing transition finishes.
  assert.equal(actions.editingProduct.value?.status, 1)
  assert.deepEqual(
    merchantProductDraft(row({ detailImages: ['https://example.test/hidden.jpg'] })).detailImages,
    [''],
  )
})
