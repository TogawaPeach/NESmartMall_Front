/** These keys belong to the UI; they are never sent as backend category IDs. */
export type ProductCategoryKey =
  'all' | 'total-station' | 'gnss-rtk' | 'level' | 'distance-meter' | 'accessory'

export interface CoreParameter {
  label: string | null
  value: string
  unit: string | null
}

export interface Product {
  id: string | number
  name: string | null
  model: string | null
  imageUrl: string | null
  categoryName: string | null
  parameters: CoreParameter[]
  /** Normalized RMB yuan; null means the backend did not provide a price. */
  priceYuan: number | null
  /** Backend sales count; null means no count was provided. */
  sales: number | null
}

export interface ProductDetail {
  id: string
  /** Ordinary detail responses use this flag to select the flash-sale flow. */
  isSeckill?: boolean
  name: string
  model: string | null
  imageUrl: string | null
  /** Preserve integer fen so even large valid prices can be displayed exactly. */
  priceFen: number | null
  sales: number
  stock: number
  detailImages: string[]
}

export type ProductDetailLoadState =
  'loading' | 'success' | 'login-required' | 'unavailable' | 'forbidden' | 'error'

export interface ProductQuery {
  category: ProductCategoryKey
  keyword: string
  limit: number
}

export interface ProductPageQuery {
  category: ProductCategoryKey
  pageNum: number
  keyword?: string
}

export interface ProductPageResult {
  list: Product[]
  total: number
  pageNum: number
  pageSize: 12
}

export type ProductLoadState = 'loading' | 'success' | 'empty' | 'error' | 'login-required'
export type ProductErrorKind = 'contract' | 'request' | 'response' | null
