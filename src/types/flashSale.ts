import type { ProductDetail } from './product'

export interface FlashSaleWindow {
  startsAtMs: number | null
  endsAtMs: number | null
}

export interface FlashSaleCard extends FlashSaleWindow {
  id: string
  name: string
  model: string | null
  imageUrl: string | null
  priceFen: number | null
}

export interface FlashSaleDetail extends ProductDetail, FlashSaleWindow {}

export type FlashSaleLoadState =
  | 'loading'
  | 'success'
  | 'empty'
  | 'unconfigured'
  | 'login-required'
  | 'forbidden'
  | 'unavailable'
  | 'error'

export type FlashSaleStatus = 'upcoming' | 'active' | 'ended' | 'invalid'

export interface FlashSaleResult<T> {
  data: T
  /** Display-only offset; never sent as proof of purchase eligibility. */
  clockOffsetMs: number
}
