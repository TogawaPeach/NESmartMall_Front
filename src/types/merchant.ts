import type { ProductCategoryKey } from './product'

export type MerchantCategory = Exclude<ProductCategoryKey, 'all'>
export type MerchantProductStatus = 'on-sale' | 'off-shelf'

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
