import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import { createServer } from 'vite'
import { createMemoryHistory, createRouter } from 'vue-router'
import { nextTick, reactive } from 'vue'

let server, installMerchantAccess, useMerchantProducts
before(async () => {
  server = await createServer({
    configFile: false,
    resolve: { alias: { '@': new URL('../src', import.meta.url).pathname } },
    server: { middlewareMode: true, hmr: false, ws: false },
    appType: 'custom',
  })
})
after(async () => server?.close())

async function navigation(role = null, initialPath = '/') {
  ;({ installMerchantAccess } = await server.ssrLoadModule('/src/router/merchantAccess.ts'))
  const auth = reactive({
    user: role === null ? null : { id: 'shop-1', role },
    accessToken: role === null ? null : 'token',
    getAuthorization() {
      return this.accessToken ? `Bearer ${this.accessToken}` : null
    },
  })
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      { path: '/', name: 'home', component: {} },
      { path: '/products', name: 'products', component: {} },
      {
        path: '/merchant/products',
        name: 'merchant-products',
        component: {},
        meta: { merchantOnly: true },
      },
    ],
  })
  const dispose = installMerchantAccess(router, auth)
  await router.push(initialPath)
  return { auth, router, dispose }
}

test('merchant login enters product management, including after a restored session', async () => {
  const fixture = await navigation()
  try {
    fixture.auth.user = { id: 'shop-1', role: 0 }
    fixture.auth.accessToken = 'merchant-token'
    await nextTick()
    await new Promise(setImmediate)
    assert.equal(fixture.router.currentRoute.value.name, 'merchant-products')
    await fixture.router.push({ name: 'home' })
    assert.equal(fixture.router.currentRoute.value.name, 'home')
  } finally {
    fixture.dispose()
  }
  const restored = await navigation(0, '/products')
  try {
    assert.equal(restored.router.currentRoute.value.name, 'merchant-products')
  } finally {
    restored.dispose()
  }
})

test('anonymous and customer sessions cannot open merchant management', async () => {
  for (const role of [null, 1]) {
    const fixture = await navigation(role, '/merchant/products')
    try {
      assert.equal(fixture.router.currentRoute.value.name, 'home')
    } finally {
      fixture.dispose()
    }
  }
})

test('logout or changing to a customer session leaves the merchant screen', async () => {
  for (const role of [null, 1]) {
    const fixture = await navigation(0, '/merchant/products')
    try {
      fixture.auth.user = role === null ? null : { id: 'customer', role }
      fixture.auth.accessToken = role === null ? null : 'customer-token'
      await nextTick()
      await new Promise(setImmediate)
      assert.equal(fixture.router.currentRoute.value.name, 'home')
    } finally {
      fixture.dispose()
    }
  }
})

test('losing merchant identity while a lazy page loads cannot enter management', async () => {
  for (const role of [null, 1]) {
    const fixture = await navigation()
    let finishLoading
    let startedLoading
    const started = new Promise((resolve) => {
      startedLoading = resolve
    })
    fixture.router.removeRoute('merchant-products')
    fixture.router.addRoute({
      path: '/merchant/products',
      name: 'merchant-products',
      meta: { merchantOnly: true },
      component: () =>
        new Promise((resolve) => {
          finishLoading = resolve
          startedLoading()
        }),
    })
    try {
      fixture.auth.user = { id: 'shop-1', role: 0 }
      fixture.auth.accessToken = 'merchant-token'
      await started
      fixture.auth.user = role === null ? null : { id: 'customer', role }
      fixture.auth.accessToken = role === null ? null : 'customer-token'
      await nextTick()
      finishLoading({ render: () => null })
      await new Promise(setImmediate)
      assert.equal(fixture.router.currentRoute.value.name, 'home')
    } finally {
      fixture.dispose()
    }
  }
})

const draft = (overrides = {}) => ({
  name: '新的全站仪',
  model: 'TS-02',
  category: 'total-station',
  priceYuan: '199.99',
  stock: '5',
  description: '测量设备',
  ...overrides,
})
async function inventory() {
  ;({ useMerchantProducts } = await server.ssrLoadModule('/src/composables/useMerchantProducts.ts'))
  return useMerchantProducts()
}

test('new products start off shelf, can be edited and listed without changing other records', async () => {
  const state = await inventory()
  const original = structuredClone(state.products.value.map((p) => ({ ...p })))
  assert.equal(state.saveProduct(draft()), null)
  const created = state.products.value[0]
  assert.equal(created.status, 'off-shelf')
  assert.equal(created.priceFen, 19999)
  assert.equal(created.stock, 5)
  assert.equal(
    state.saveProduct(draft({ name: '修改后的名称', priceYuan: '0.01' }), created.id),
    null,
  )
  assert.equal(state.products.value[0].name, '修改后的名称')
  assert.equal(state.products.value[0].priceFen, 1)
  assert.equal(state.toggleStatus(created.id), null)
  assert.equal(state.products.value[0].status, 'on-sale')
  assert.equal(state.toggleStatus(created.id), null)
  assert.equal(state.products.value[0].status, 'off-shelf')
  assert.deepEqual(
    state.products.value.slice(1).map((p) => ({ ...p })),
    original,
  )
})

test('invalid prices, quantities and names cannot mutate inventory; empty stock cannot be listed', async () => {
  const state = await inventory()
  const count = state.products.value.length
  for (const fields of [
    { name: ' ' },
    { priceYuan: '-1' },
    { priceYuan: '1.001' },
    { priceYuan: 'NaN' },
    { stock: '-1' },
    { stock: '1.5' },
    { stock: '' },
    { category: 'invalid' },
  ])
    assert.equal(typeof state.saveProduct(draft(fields)), 'string')
  assert.equal(state.products.value.length, count)
  assert.equal(state.saveProduct(draft({ stock: '0' })), null)
  const id = state.products.value[0].id
  assert.equal(typeof state.toggleStatus(id), 'string')
  assert.equal(state.products.value[0].status, 'off-shelf')
  assert.equal(state.saveProduct(draft()), null)
  const listedId = state.products.value[0].id
  state.toggleStatus(listedId)
  assert.equal(typeof state.saveProduct(draft({ stock: '0' }), listedId), 'string')
  assert.equal(state.products.value[0].stock, 5)
})

test('search and status filters combine and a new page instance resets demo changes', async () => {
  const state = await inventory()
  state.saveProduct(draft({ name: '专用 RTK', model: 'SEARCH-42' }))
  state.keyword.value = ' search-42 '
  assert.equal(state.filteredProducts.value.length, 1)
  state.status.value = 'on-sale'
  assert.equal(state.filteredProducts.value.length, 0)
  state.status.value = 'off-shelf'
  assert.equal(state.filteredProducts.value[0].name, '专用 RTK')
  const fresh = await inventory()
  assert.equal(
    fresh.products.value.some((p) => p.model === 'SEARCH-42'),
    false,
  )
})
