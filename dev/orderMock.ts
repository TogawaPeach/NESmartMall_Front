import type { Plugin } from 'vite'
import type { Order, OrderStatus } from '../src/types/order.ts'

/** Isolated local transactions, installed only by explicit Vite serve configuration. */
export function orderMockPlugin(
  scenario = 'normal',
  options: { transactions?: boolean } = {},
): Plugin {
  if (
    ![
      'normal',
      'empty',
      'forbidden',
      'unavailable',
      'error',
      'malformed',
      'create-unknown',
      'create-malformed',
      'pay-unknown',
      'expired',
    ].includes(scenario)
  )
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
      logistics: shipped ? { trackingNo: `DEMO202610${day}000${index + 1}` } : null,
    }
  })
  const sessions = new Map<string, Order[]>()
  let sequence = 100
  return {
    name: 'local-order-mock',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = new URL(req.url || '/', 'http://localhost')
        const detailMatch = /^\/api\/orders\/(JW[1-9]\d*)(\/pay|\/cancel)?$/.exec(url.pathname)
        const creating = req.method === 'POST' && url.pathname === '/api/orders'
        const paying = req.method === 'POST' && detailMatch?.[2] === '/pay'
        const cancelling = req.method === 'POST' && detailMatch?.[2] === '/cancel'
        if (
          !creating &&
          !paying &&
          !cancelling &&
          !(
            req.method === 'GET' &&
            (url.pathname === '/api/orders' || (detailMatch && !detailMatch[2]))
          )
        )
          return next()
        const send = (status: number, data: unknown) => {
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json; charset=utf-8')
          res.setHeader('Cache-Control', 'no-store')
          res.end(
            JSON.stringify({
              code: status,
              message: status === 200 ? 'OK' : '开发模拟订单错误',
              data,
            }),
          )
        }
        if (!/^Bearer \S+$/.test(req.headers.authorization || '')) return send(401, null)
        const failure = { forbidden: 403, unavailable: 503, error: 500 }[scenario as string]
        if (failure) return send(failure, null)
        const authorization = req.headers.authorization!
        if (!sessions.has(authorization))
          sessions.set(authorization, structuredClone(scenario === 'empty' ? [] : orders))
        const data = sessions.get(authorization)!
        if ((creating || paying || cancelling) && !options.transactions) return send(404, null)
        const currentSnapshot = (order: Order) => {
          if (!order.payExpireAt) return order // Existing fixtures intentionally cover legacy GET.
          const expired = Date.now() >= Date.parse(order.payExpireAt)
          return {
            ...order,
            serverTime: new Date().toISOString(),
            canPay: order.status === 'PENDING_PAYMENT' && !expired,
            displayStatus:
              order.status === 'PENDING_PAYMENT' && expired ? 'PAYMENT_EXPIRED' : order.status,
          }
        }
        if (creating) {
          let raw = ''
          req.on('data', (chunk: Buffer) => {
            raw += chunk.toString()
          })
          req.on('end', () => {
            try {
              const input = JSON.parse(raw)
              if (
                Object.keys(input).sort().join(',') !== 'items,recipient' ||
                !Array.isArray(input.items) ||
                !input.items.length ||
                !input.recipient ||
                Object.keys(input.recipient).sort().join(',') !== 'address,name,phone' ||
                ['name', 'phone', 'address'].some(
                  (key) => typeof input.recipient[key] !== 'string' || !input.recipient[key].trim(),
                )
              )
                return send(400, null)
              const catalog: Record<string, { name: string; unitPriceFen: number }> = {
                '9007199254740993123': {
                  name: 'GNSS 接收机（模拟成交快照）',
                  unitPriceFen: 134400,
                },
                '43': { name: '测量三脚架（模拟成交快照）', unitPriceFen: 39900 },
                '44': { name: '配件赠品（模拟成交快照）', unitPriceFen: 0 },
              }
              const ids = new Set<string>()
              const items = input.items.map(
                (entry: { productId: string; quantity: number }, index: number) => {
                  if (
                    Object.keys(entry).sort().join(',') !== 'productId,quantity' ||
                    !catalog[entry.productId] ||
                    ids.has(entry.productId) ||
                    !Number.isSafeInteger(entry.quantity) ||
                    entry.quantity < 1 ||
                    entry.quantity > 8
                  )
                    throw new Error('invalid mock intent')
                  ids.add(entry.productId)
                  return {
                    id: String(++sequence + index),
                    productId: entry.productId,
                    ...catalog[entry.productId]!,
                    model: null,
                    coverUrl: null,
                    quantity: entry.quantity,
                  }
                },
              )
              const goodsAmountFen = items.reduce(
                (sum: number, item: { unitPriceFen: number; quantity: number }) =>
                  sum + item.unitPriceFen * item.quantity,
                0,
              )
              const created = Date.now() - (scenario === 'expired' ? 16 * 60_000 : 0)
              const shippingFeeFen = goodsAmountFen === 0 ? 0 : 1200
              const order: Order = {
                orderNo: `JW${Date.now()}${++sequence}`,
                status: 'PENDING_PAYMENT',
                createdAt: new Date(created).toISOString(),
                paidAt: null,
                shippedAt: null,
                completedAt: null,
                cancelledAt: null,
                items,
                goodsAmountFen,
                shippingFeeFen,
                discountAmountFen: 0,
                payableAmountFen: goodsAmountFen + shippingFeeFen,
                paidAmountFen: null,
                recipient: { ...input.recipient, phone: '138****0000' },
                logistics: null,
                payExpireAt: new Date(created + 15 * 60_000).toISOString(),
                serverTime: new Date().toISOString(),
                canPay: scenario !== 'expired',
                displayStatus: scenario === 'expired' ? 'PAYMENT_EXPIRED' : 'PENDING_PAYMENT',
                cancelReason: null,
              }
              data.unshift(order)
              if (scenario === 'create-unknown') return send(500, null)
              return send(
                200,
                scenario === 'create-malformed'
                  ? {}
                  : { orderNo: order.orderNo, payableAmountFen: order.payableAmountFen },
              )
            } catch {
              return send(400, null)
            }
          })
          return
        }
        if (cancelling) {
          const order = data.find((order) => order.orderNo === detailMatch[1])
          if (!order) return send(404, null)
          if (order.status === 'PENDING_PAYMENT') {
            order.status = 'CANCELLED'
            order.cancelledAt = new Date().toISOString()
          }
          if (order.status !== 'CANCELLED') return send(409, null)
          return send(200, {
            orderNo: order.orderNo,
            status: order.status,
          })
        }
        if (paying) {
          const order = data.find((order) => order.orderNo === detailMatch[1])
          if (!order) return send(404, null)
          if (order.status === 'PENDING_PAYMENT') {
            if (!order.payExpireAt || Date.now() >= Date.parse(order.payExpireAt))
              return send(409, null)
            order.status = 'PENDING_SHIPMENT'
            order.paidAt = new Date().toISOString()
            order.paidAmountFen = order.payableAmountFen
          }
          if (!['PENDING_SHIPMENT', 'PENDING_RECEIPT', 'COMPLETED'].includes(order.status))
            return send(409, null)
          if (scenario === 'pay-unknown') return send(500, null)
          return send(200, null)
        }
        if (url.pathname !== '/api/orders') {
          const detail = data.find((o) => o.orderNo === url.pathname.split('/').pop())
          return send(
            detail ? 200 : 404,
            scenario === 'malformed' ? {} : detail ? currentSnapshot(detail) : null,
          )
        }
        const status = url.searchParams.get('status')
        if (status && !statuses.includes(status as OrderStatus)) return send(400, null)
        const filtered = data
          .filter((o) => !status || o.status === status)
          .map((order) => {
            const {
              orderNo,
              status,
              createdAt,
              payableAmountFen,
              items,
              payExpireAt,
              serverTime,
              canPay,
              displayStatus,
              cancelReason,
            } = currentSnapshot(order)
            return {
              orderNo,
              status,
              createdAt,
              payableAmountFen,
              items,
              ...(payExpireAt
                ? { payExpireAt, serverTime, canPay, displayStatus, cancelReason }
                : {}),
            }
          })
        return send(200, scenario === 'malformed' ? {} : filtered)
      })
    },
  }
}
