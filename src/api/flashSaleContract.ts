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
  /** Reserved only: no order request implementation until its full contract is reviewed. */
  order: { confirmed: false; endpoint: null }
}

/**
 * Pending integration mappings, NOT an existing backend contract.
 * Verified local backend on 2026-10-22: no seckill query/order controller exists.
 * Confirm paths, envelope, fields and time rules here before setting confirmed=true.
 * Do not point either entry at the ordinary /api/products endpoints.
 */
export const flashSaleContract: FlashSaleContract = {
  list: { confirmed: false, endpoint: null, dataPath: ['data'] },
  detail: { confirmed: false, endpoint: null, dataPath: ['data'] },
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
  order: { confirmed: false, endpoint: null },
}

export const flashSaleCarousel = { intervalMs: 4_000 } as const
/** Explicit, development-only opt-in. Failed live requests NEVER enable this mode. */
export const flashSaleDemoEnabled =
  import.meta.env.DEV && import.meta.env.VITE_FLASH_SALE_DEMO === 'true'

/** Purchase entry is intentionally closed even in demo mode. */
export function getFlashSaleOrderAvailability() {
  return { available: false, message: '秒杀购买暂未开放' } as const
}
