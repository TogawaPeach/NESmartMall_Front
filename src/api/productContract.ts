import type { ProductCategoryKey } from '@/types/product'

/** A path from the response/product root. [] means the root itself. */
export type FieldPath = readonly string[]
type CategoryValue = string | number
type BusinessStatus = string | number | boolean | null

export interface ProductContract {
  /** Set true only after the following mappings match the actual backend. */
  confirmed: boolean
  endpoint: string
  query: {
    sort: { parameter: string; value: string }
    categoryParameter: string | null
    keywordParameter: string | null
    /** Confirm whether an empty keyword is omitted or explicitly sent. */
    sendEmptyKeyword: boolean | null
    limit: { enabled: boolean | null; parameter: string | null }
    allCategory: { mode: 'omit' | 'value' | null; value: CategoryValue | null }
  }
  categoryValues: Record<Exclude<ProductCategoryKey, 'all'>, CategoryValue | null>
  response: {
    listPath: FieldPath | null
    /** http-only is an explicit confirmation that HTTP status is sufficient. */
    businessStatus: {
      mode: 'http-only' | 'field' | null
      path: FieldPath | null
      successValues: readonly BusinessStatus[] | null
    }
  }
  fields: {
    id: FieldPath | null
    name: FieldPath | null
    model: FieldPath | null
    imageUrl: FieldPath | null
    categoryName: FieldPath | null
    parameters: FieldPath | null
    price: FieldPath | null
    sales: FieldPath | null
  }
  parameters: {
    format: 'objects' | 'strings' | null
    label: FieldPath | null
    value: FieldPath | null
    unit: FieldPath | null
  }
  /** Must be confirmed even when this particular result contains no prices. */
  priceUnit: 'yuan' | 'fen' | null
}

/**
 * The all-products query is confirmed. Category and keyword filters remain
 * unconfigured until the backend supports them. See docs/product-api-contract.md.
 */
export const productContract: ProductContract = {
  confirmed: true,
  endpoint: import.meta.env.VITE_PRODUCTS_ENDPOINT?.trim() || '/api/products',
  query: {
    sort: { parameter: 'sort', value: 'sales_desc' },
    categoryParameter: null,
    keywordParameter: null,
    sendEmptyKeyword: false,
    limit: { enabled: true, parameter: 'limit' },
    allCategory: { mode: 'omit', value: null },
  },
  categoryValues: {
    'total-station': null,
    'gnss-rtk': null,
    level: null,
    'distance-meter': null,
    accessory: null,
  },
  response: {
    listPath: ['data'],
    businessStatus: { mode: 'field', path: ['code'], successValues: [200] },
  },
  fields: {
    id: ['id'],
    name: ['name'],
    model: null,
    imageUrl: ['coverUrl'],
    categoryName: null,
    parameters: null,
    price: ['price'],
    sales: ['sales'],
  },
  parameters: { format: null, label: null, value: null, unit: null },
  priceUnit: 'fen',
}

export class ProductContractError extends Error {
  constructor(message = '商品接口契约尚未配置') {
    super(message)
    this.name = 'ProductContractError'
  }
}

export class ProductResponseError extends Error {
  constructor(message = '商品接口响应格式异常') {
    super(message)
    this.name = 'ProductResponseError'
  }
}

export function validateProductContract(): void {
  const contract = productContract
  const query = contract.query
  const status = contract.response.businessStatus
  const missing =
    !contract.confirmed ||
    !contract.endpoint ||
    !query.sort.parameter.trim() ||
    !query.sort.value.trim() ||
    query.sendEmptyKeyword === null ||
    query.limit.enabled === null ||
    (query.limit.enabled && !query.limit.parameter?.trim()) ||
    query.allCategory.mode === null ||
    (query.allCategory.mode === 'value' &&
      (!query.categoryParameter?.trim() || query.allCategory.value === null)) ||
    (query.sendEmptyKeyword && !query.keywordParameter?.trim()) ||
    contract.response.listPath === null ||
    status.mode === null ||
    (status.mode === 'field' && (!status.path || !status.successValues?.length)) ||
    contract.fields.id === null ||
    (contract.fields.name === null && contract.fields.model === null) ||
    contract.priceUnit === null ||
    (contract.fields.parameters !== null &&
      (contract.parameters.format === null ||
        (contract.parameters.format === 'objects' && contract.parameters.value === null)))

  if (missing) throw new ProductContractError()
}
