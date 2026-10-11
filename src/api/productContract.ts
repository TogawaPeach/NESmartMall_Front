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
 * Integration is intentionally pending. Null does not invent a field or ID.
 * Once confirmed is true, null optional field paths mean the field is absent
 * from the agreed response. See docs/product-api-contract.md before editing.
 */
export const productContract: ProductContract = {
  confirmed: false,
  endpoint: import.meta.env.VITE_PRODUCTS_ENDPOINT?.trim() || '',
  query: {
    categoryParameter: null,
    keywordParameter: null,
    sendEmptyKeyword: null,
    limit: { enabled: null, parameter: null },
    allCategory: { mode: null, value: null },
  },
  categoryValues: {
    'total-station': null,
    'gnss-rtk': null,
    level: null,
    'distance-meter': null,
    accessory: null,
  },
  response: {
    listPath: null,
    businessStatus: { mode: null, path: null, successValues: null },
  },
  fields: {
    id: null,
    name: null,
    model: null,
    imageUrl: null,
    categoryName: null,
    parameters: null,
    price: null,
  },
  parameters: { format: null, label: null, value: null, unit: null },
  priceUnit: null,
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
    !query.categoryParameter?.trim() ||
    !query.keywordParameter?.trim() ||
    query.sendEmptyKeyword === null ||
    query.limit.enabled === null ||
    (query.limit.enabled && !query.limit.parameter?.trim()) ||
    query.allCategory.mode === null ||
    (query.allCategory.mode === 'value' && query.allCategory.value === null) ||
    Object.values(contract.categoryValues).some((value) => value === null) ||
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
