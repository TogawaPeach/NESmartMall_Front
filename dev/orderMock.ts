import type { Plugin } from 'vite'
import type { Order, OrderStatus } from '../src/types/order.ts'

/** Local, read-only fixtures, installed only by explicit Vite serve configuration. */
export function orderMockPlugin(scenario = 'normal'): Plugin {
  if (!['normal', 'empty', 'forbidden', 'unavailable', 'error', 'malformed'].includes(scenario))
    throw new Error(`未知订单模拟场景：${scenario}`)
  const statuses: OrderStatus[] = [
    'PENDING_PAYMENT',
    'PENDING_RECEIPT',
    'PENDING_SHIPMENT',
    'COMPLETED',
    'CANCELLED',
    'COMPLETED',
    'PENDING_PAYMENT',
  ]
  const products = [
    { name: '高精度 GNSS RTK 测量接收机', model: 'RTK Pro · 标准套装', unitPriceFen: 1288000 },
    { name: '激光测距仪', model: 'LDM-100 · 100 米', unitPriceFen: 89900 },
    { name: '工程测量全站仪', model: 'TS-02 · 2 秒精度', unitPriceFen: 1980000 },
    { name: '自动安平水准仪', model: 'AL-32 · 32 倍', unitPriceFen: 158000 },
  ]
  const orders: Order[] = statuses.map((status, index) => {
    const paid = ['PENDING_RECEIPT', 'PENDING_SHIPMENT', 'COMPLETED'].includes(status)
    const shipped = ['PENDING_RECEIPT', 'COMPLETED'].includes(status)
    const day = String(16 - index).padStart(2, '0')
    const timestamp = (hour: string) => `2026-10-${day}T${hour}:00:00Z`
    const items = [
      {
        id: String(100 + index),
        productId: String(900 + index),
        ...products[index % products.length]!,
        coverUrl: null,
        quantity: index === 1 ? 2 : 1,
      },
    ]
    if (index === 0)
      items.push({
        id: '200',
        productId: '999',
        name: '测量仪器铝合金三脚架',
        model: 'TR-150 · 通用型',
        unitPriceFen: 39900,
        coverUrl: null,
        quantity: 1,
      })
    const goodsAmountFen = items.reduce((sum, item) => sum + item.quantity * item.unitPriceFen, 0)
    const discountAmountFen = index === 0 ? 10000 : 0
    const shippingFeeFen = index === 1 ? 1200 : 0
    const payableAmountFen = goodsAmountFen + shippingFeeFen - discountAmountFen
    return {
      id: `900719925474099310${index + 1}`,
      orderNo: `JW202610${day}000${index + 1}`,
      status,
      createdAt: timestamp('01'),
      paidAt: paid ? timestamp('02') : null,
      shippedAt: shipped ? timestamp('03') : null,
      completedAt: status === 'COMPLETED' ? timestamp('04') : null,
      cancelledAt: status === 'CANCELLED' ? timestamp('02') : null,
      items,
      goodsAmountFen,
      shippingFeeFen,
      discountAmountFen,
      payableAmountFen,
      paidAmountFen: paid ? payableAmountFen : null,
      recipient: {
        name: '演示收货人',
        phone: '138****0000',
        address: '上海市 · 演示区 · 经纬路 100 号（虚构地址）',
      },
      logistics: shipped
        ? { carrier: '演示物流', trackingNo: `DEMO202610${day}000${index + 1}` }
        : null,
    }
  })
  return {
    name: 'local-order-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        if (req.method !== 'GET' || !/^\/api\/orders(?:\/[1-9]\d*)?$/.test(url.pathname))
          return next()
        const send = (status: number, data: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(JSON.stringify({ code: status, message: '开发模拟订单', data }))
        }
        if (!/^Bearer \S+$/.test(req.headers.authorization || '')) return send(401, null)
        const failure = { forbidden: 403, unavailable: 503, error: 500 }[scenario as string]
        if (failure) return send(failure, null)
        const data = scenario === 'empty' ? [] : orders
        if (url.pathname !== '/api/orders') {
          const detail = data.find((o) => o.id === url.pathname.split('/').pop())
          return send(detail ? 200 : 404, scenario === 'malformed' ? {} : detail || null)
        }
        const pageNum = Number(url.searchParams.get('pageNum') || 1)
        const pageSize = Number(url.searchParams.get('pageSize') || 5)
        const status = url.searchParams.get('status')
        if (
          !Number.isSafeInteger(pageNum) ||
          pageNum < 1 ||
          pageSize !== 5 ||
          (status && !statuses.includes(status as OrderStatus))
        )
          return send(400, null)
        const filtered = data.filter((o) => !status || o.status === status)
        return send(200, {
          list: scenario === 'malformed' ? null : filtered.slice((pageNum - 1) * 5, pageNum * 5),
          total: filtered.length,
          pageNum,
          pageSize,
        })
      })
    },
  }
}
