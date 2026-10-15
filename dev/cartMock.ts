import type { Plugin } from 'vite'

/** Explicit local fixtures only. This middleware is never installed in a production build. */
export function cartMockPlugin(scenario = 'mixed'): Plugin {
  const normal = {
    cartItemId: '101',
    productId: '9007199254740993123',
    name: 'GNSS 接收机（模拟商品）',
    model: 'RTK-01',
    coverUrl: null,
    price: 129900,
    quantity: 2,
    stock: 8,
    availability: 'AVAILABLE',
  }
  const items = [
    normal,
    {
      ...normal,
      cartItemId: '102',
      productId: '43',
      name: '测量三脚架（模拟商品）',
      model: null,
      price: 39900,
      quantity: 1,
    },
    {
      ...normal,
      cartItemId: '103',
      productId: '44',
      name: '配件赠品（模拟商品）',
      price: 0,
      quantity: 1,
    },
  ]
  const mixed = [
    ...items,
    {
      ...normal,
      cartItemId: '104',
      name: '缺货商品（模拟商品）',
      stock: 0,
      availability: 'OUT_OF_STOCK',
    },
    { ...normal, cartItemId: '105', name: '库存不足商品（模拟商品）', quantity: 9 },
    { ...normal, cartItemId: '106', name: '待定价格商品（模拟商品）', price: null },
    { ...normal, cartItemId: '107', name: '下架商品（模拟商品）', availability: 'OFF_SHELF' },
    {
      ...normal,
      cartItemId: '108',
      name: null,
      model: null,
      price: null,
      stock: null,
      availability: 'DELETED',
    },
    {
      ...normal,
      cartItemId: '109',
      name: '超长名称测试：工程测量设备及配件'.repeat(6),
      coverUrl: 'https://images.example.invalid/broken.jpg',
    },
  ]
  const statuses: Record<string, number> = { forbidden: 403, unavailable: 404, error: 500 }
  const supported = ['normal', 'mixed', 'empty', 'forbidden', 'unavailable', 'error', 'malformed']
  if (!supported.includes(scenario)) throw new Error(`未知购物车模拟场景：${scenario}`)
  return {
    name: 'local-cart-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        if (request.method !== 'GET' || request.url?.split('?')[0] !== '/api/cart') return next()
        const status = !/^Bearer \S+$/.test(request.headers.authorization || '')
          ? 401
          : statuses[scenario] || 200
        response.statusCode = status
        response.setHeader('Content-Type', 'application/json; charset=utf-8')
        response.setHeader('Cache-Control', 'no-store')
        response.end(
          JSON.stringify(
            status !== 200
              ? { code: status, message: '开发模拟错误', data: null }
              : {
                  code: 200,
                  message: '开发模拟数据',
                  data: {
                    items:
                      scenario === 'malformed'
                        ? null
                        : scenario === 'empty'
                          ? []
                          : scenario === 'normal'
                            ? items
                            : mixed,
                  },
                },
          ),
        )
      })
    },
  }
}
