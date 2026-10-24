import type { FieldPath } from './productContract'

interface QueryEntry {
  confirmed: boolean
  /** List is a path; detail must contain exactly one {id} placeholder. */
  endpoint: string | null
  dataPath: FieldPath
}

interface FlashSaleContract {
  list: QueryEntry
  detail: QueryEntry
  response: { codePath: FieldPath; successCode: number }
  fields: {
    id: string
    name: string
    model: string
    coverUrl: string
    price: string
    sales: string
    stock: string
    detailImages: string
    startsAt: string
    endsAt: string
  }
  priceUnit: 'fen'
  time: {
    format: 'beijing-local-or-iso8601-with-offset'
    displayTimeZone: string
    clock: 'device' | 'response-field'
    /** Required when clock=response-field; same timestamp format as activity times. */
    serverTimePath: FieldPath | null
  }
  /** Body: { productId, recipient: { name, phone, address } }; one item, no quantity field. */
  order: { endpoint: string; feedbackDelayMs: number }
}

/**
 * Keep sale queries and purchases separate from ordinary product/checkout APIs.
 * Do not point either entry at the ordinary /api/products endpoints.
 */
export const flashSaleContract: FlashSaleContract = {
  list: { confirmed: true, endpoint: '/api/seckill/products', dataPath: ['data'] },
  detail: { confirmed: true, endpoint: '/api/seckill/products/{id}', dataPath: ['data'] },
  response: { codePath: ['code'], successCode: 200 },
  fields: {
    id: 'id',
    name: 'name',
    model: 'model',
    coverUrl: 'coverUrl',
    price: 'price',
    sales: 'sales',
    stock: 'stock',
    detailImages: 'detailImages',
    startsAt: 'seckillStartTime',
    endsAt: 'seckillEndTime',
  },
  priceUnit: 'fen',
  time: {
    // Confirmed: bare timestamps represent Beijing time, never the device's local timezone.
    format: 'beijing-local-or-iso8601-with-offset',
    displayTimeZone: 'Asia/Shanghai',
    // No server clock field has been confirmed. Device time is for display only.
    clock: 'device',
    serverTimePath: null,
  },
  order: { endpoint: '/api/orders/seckill', feedbackDelayMs: 1_000 },
}

export const flashSaleCarousel = { intervalMs: 4_000 } as const
/** Explicit, development-only opt-in. Failed live requests NEVER enable this mode. */
export const flashSaleDemoEnabled =
  import.meta.env.DEV && import.meta.env.VITE_FLASH_SALE_DEMO === 'true'
