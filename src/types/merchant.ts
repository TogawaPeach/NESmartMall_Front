import type { ProductCategoryKey } from './product'

export type MerchantCategory = Exclude<ProductCategoryKey, 'all'>
export type MerchantProductStatus = 'on-sale' | 'off-shelf'

export interface MerchantStats {
  allCount: number
  onSaleCount: number
  offShelfCount: number
}

export type MerchantStatsState = 'loading' | 'success' | 'error' | 'login-required' | 'forbidden'

export type MerchantProductFilter = 'all' | MerchantProductStatus
export type MerchantProductPageState = MerchantStatsState | 'empty'

export interface MerchantProductRow {
  id: string
  name: string
  model: string
  imageUrl: string | null
  categoryId: number
  categoryLabel: string
  priceFen: number | null
  stock: number
  status: 0 | 1 | 2
  isSeckill: boolean
  startsAtMs: number | null
  endsAtMs: number | null
}

export interface MerchantProductPageQuery {
  pageNum: number
  status?: MerchantProductFilter
}

export interface MerchantProductPageResult {
  list: MerchantProductRow[]
  total: number
  pageNum: number
  pageSize: number
}

export interface MerchantProductForm {
  name: string
  model: string
  coverUrl: string
  categoryId: number
  priceYuan: string
  stock: string
  isSeckill: boolean
  seckillStartTime: string
  seckillEndTime: string
}

export interface MerchantProductSaveInput {
  id?: string
  name: string
  model: string
  coverUrl: string | null
  categoryId: number
  price: number
  stock: number
  isSeckill: boolean
  seckillStartTime: string | null
  seckillEndTime: string | null
}

export interface MerchantProduct {
  id: string
  name: string
  model: string
  category: MerchantCategory
  priceFen: number
  stock: number
  description: string
  status: MerchantProductStatus
}

export interface MerchantProductDraft {
  name: string
  model: string
  category: MerchantCategory
  priceYuan: string
  stock: string
  description: string
}
