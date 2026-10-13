import type {
  CoreParameter,
  Product,
  ProductCategoryKey,
  ProductPageQuery,
  ProductPageResult,
  ProductQuery,
} from '@/types/product'
import { http } from './http'
import {
  productContract,
  productPageContract,
  PRODUCT_PAGE_SIZE,
  ProductContractError,
  ProductResponseError,
  validateProductContract,
  type FieldPath,
} from './productContract'

export { PRODUCT_PAGE_SIZE } from './productContract'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readPath(source: unknown, path: FieldPath | null): unknown {
  if (path === null) return undefined
  return path.reduce<unknown>((value, key) => (isRecord(value) ? value[key] : undefined), source)
}

function readText(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new ProductResponseError(`${field}字段类型异常`)
  return value.trim() || null
}

function readParameterValue(value: unknown): string {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  throw new ProductResponseError('商品参数值异常')
}

function readParameters(source: unknown): CoreParameter[] {
  const raw = readPath(source, productContract.fields.parameters)
  if (raw === undefined || raw === null) return []
  if (!Array.isArray(raw)) throw new ProductResponseError('商品参数列表异常')

  return raw.map((entry): CoreParameter => {
    if (productContract.parameters.format === 'strings') {
      if (typeof entry !== 'string') throw new ProductResponseError('商品参数类型异常')
      return { label: null, value: readParameterValue(entry), unit: null }
    }
    if (!isRecord(entry)) throw new ProductResponseError('商品参数对象异常')
    return {
      label: readText(readPath(entry, productContract.parameters.label), '参数名称'),
      value: readParameterValue(readPath(entry, productContract.parameters.value)),
      unit: readText(readPath(entry, productContract.parameters.unit), '参数单位'),
    }
  })
}

function readPrice(source: unknown): number | null {
  const raw = readPath(source, productContract.fields.price)
  if (raw === undefined || raw === null || raw === '') return null
  if (typeof raw !== 'number' && typeof raw !== 'string') {
    throw new ProductResponseError('商品价格类型异常')
  }
  if (typeof raw === 'string' && !/^\d+(?:\.\d+)?$/.test(raw.trim())) {
    throw new ProductResponseError('商品价格格式异常')
  }
  const amount = Number(raw)
  if (!Number.isFinite(amount) || amount < 0 || amount > Number.MAX_SAFE_INTEGER) {
    throw new ProductResponseError('商品价格数值异常')
  }
  if (productContract.priceUnit === 'fen' && !Number.isSafeInteger(amount)) {
    throw new ProductResponseError('以分为单位的价格必须为整数')
  }
  return productContract.priceUnit === 'fen' ? amount / 100 : amount
}

function mapProduct(source: unknown): Product {
  if (!isRecord(source)) throw new ProductResponseError('商品条目不是对象')
  const fields = productContract.fields
  const id = readPath(source, fields.id)
  if (!((typeof id === 'string' && id.trim()) || (typeof id === 'number' && Number.isFinite(id)))) {
    throw new ProductResponseError('商品缺少有效标识')
  }
  const name = readText(readPath(source, fields.name), '商品名称')
  const model = readText(readPath(source, fields.model), '商品型号')
  if (!name && !model) throw new ProductResponseError('商品缺少名称或型号')
  const sales = readPath(source, fields.sales)
  if (
    sales !== undefined &&
    sales !== null &&
    (typeof sales !== 'number' || !Number.isSafeInteger(sales) || sales < 0)
  ) {
    throw new ProductResponseError('商品购买人数异常')
  }

  return {
    id: id as string | number,
    name,
    model,
    imageUrl: readText(readPath(source, fields.imageUrl), '商品图片'),
    categoryName: readText(readPath(source, fields.categoryName), '商品分类'),
    parameters: readParameters(source),
    priceYuan: readPrice(source),
    sales: sales === undefined || sales === null ? null : (sales as number),
  }
}

function buildCategoryParams(categoryKey: ProductCategoryKey): Record<string, string | number> {
  const config = productContract.query
  const params: Record<string, string | number> = {}
  if (
    categoryKey !== 'all' &&
    (!config.categoryParameter || productContract.categoryValues[categoryKey] === null)
  ) {
    throw new ProductContractError('分类查询暂未开放，请选择“全部”')
  }
  const category =
    categoryKey === 'all'
      ? config.allCategory.mode === 'value'
        ? config.allCategory.value
        : null
      : productContract.categoryValues[categoryKey]
  if (category !== null) params[config.categoryParameter!] = category
  return params
}

function buildParams(query: ProductQuery): Record<string, string | number> {
  const config = productContract.query
  const params = buildCategoryParams(query.category)
  const keyword = query.keyword.trim()
  if (keyword && !config.keywordParameter) {
    throw new ProductContractError('关键词搜索暂未开放，请清空搜索词')
  }
  if (keyword || config.sendEmptyKeyword) params[config.keywordParameter!] = keyword
  if (config.limit.enabled) params[config.limit.parameter!] = query.limit
  return params
}

function validateBusinessStatus(response: unknown): void {
  const status = productContract.response.businessStatus
  if (status.mode === 'field') {
    const actual = readPath(response, status.path)
    if (!status.successValues?.some((expected) => actual === expected)) {
      throw new ProductResponseError('商品接口返回业务失败状态')
    }
  }
}

function mapProductList(list: unknown): Product[] {
  if (!Array.isArray(list)) throw new ProductResponseError('商品列表字段不是数组')
  const products = list.map(mapProduct)
  const ids = new Set(products.map((product) => `${typeof product.id}:${product.id}`))
  if (ids.size !== products.length) throw new ProductResponseError('商品标识重复')
  return products
}

export async function queryProducts(
  query: ProductQuery,
  options: { signal?: AbortSignal } = {},
): Promise<Product[]> {
  // Only send confirmed query parameters to the backend.
  validateProductContract()
  const response = await http.get<unknown>(productContract.endpoint, {
    params: buildParams(query),
    signal: options.signal,
  })
  validateBusinessStatus(response.data)
  const list = readPath(response.data, productContract.response.listPath)
  const products = mapProductList(list)
  return products.slice(0, query.limit)
}

export async function queryProductPage(
  query: ProductPageQuery,
  options: { signal?: AbortSignal } = {},
): Promise<ProductPageResult> {
  validateProductContract()
  if (!Number.isSafeInteger(query.pageNum) || query.pageNum < 1) {
    throw new ProductContractError('商品页码必须为正整数')
  }

  const keyword = query.keyword?.trim() ?? ''
  // Search always covers all categories, even if the caller has a selected category.
  const params = buildCategoryParams(keyword ? 'all' : query.category)
  if (keyword) params[productPageContract.keywordParameter] = keyword
  params[productPageContract.pageParameter] = query.pageNum
  const response = await http.get<unknown>(productPageContract.endpoint, {
    params,
    signal: options.signal,
  })
  validateBusinessStatus(response.data)

  const paths = productPageContract.response
  const total = readPath(response.data, paths.totalPath)
  const pageNum = readPath(response.data, paths.pageNumPath)
  const pageSize = readPath(response.data, paths.pageSizePath)
  if (typeof total !== 'number' || !Number.isSafeInteger(total) || total < 0) {
    throw new ProductResponseError('商品总数字段异常')
  }
  if (
    typeof pageNum !== 'number' ||
    !Number.isSafeInteger(pageNum) ||
    pageNum < 1 ||
    pageNum !== query.pageNum
  ) {
    throw new ProductResponseError('商品页码字段与请求不一致')
  }
  if (pageSize !== PRODUCT_PAGE_SIZE) {
    throw new ProductResponseError('商品接口每页数量必须为 12')
  }

  const list = readPath(response.data, paths.listPath)
  if (!Array.isArray(list)) throw new ProductResponseError('商品列表字段不是数组')
  if (list.length > PRODUCT_PAGE_SIZE) {
    throw new ProductResponseError('商品接口单页返回数量超过 12')
  }
  if (list.length > total) {
    throw new ProductResponseError('商品总数小于本页商品数量')
  }
  return { list: mapProductList(list), total, pageNum, pageSize }
}
