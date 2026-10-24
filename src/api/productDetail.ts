import axios from 'axios'
import type { ProductDetail } from '@/types/product'
import { http } from './http'
import { ProductResponseError } from './productContract'

type DetailFailure = 'login-required' | 'unavailable' | 'forbidden'

export class ProductDetailError extends Error {
  constructor(public readonly kind: DetailFailure) {
    super(kind)
    this.name = 'ProductDetailError'
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readId(value: unknown): string {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value
  if (typeof value === 'number' && Number.isSafeInteger(value) && value > 0) return String(value)
  throw new ProductResponseError('商品标识异常')
}

function rejectStatus(status: unknown): never {
  if (status === 401) throw new ProductDetailError('login-required')
  if (status === 403) throw new ProductDetailError('forbidden')
  if (status === 404) throw new ProductDetailError('unavailable')
  throw new ProductResponseError('商品详情查询失败')
}

function readData(body: unknown): Record<string, unknown> {
  if (!isRecord(body)) throw new ProductResponseError('商品详情响应异常')
  if (body.code !== 200) rejectStatus(body.code)
  if (!isRecord(body.data)) throw new ProductResponseError('商品详情数据异常')
  return body.data
}

function readText(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null
  if (typeof value !== 'string') throw new ProductResponseError('商品详情文字类型异常')
  return value.trim() || null
}

function readImageUrl(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new ProductResponseError('商品图片地址异常')
  }
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return value.trim()
  } catch {
    // Only full external HTTP/HTTPS image URLs are part of the detail contract.
  }
  throw new ProductResponseError('商品图片地址异常')
}

function readCount(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new ProductResponseError(`${field}必须为非负安全整数`)
  }
  return value
}

/** Shared presentation adapter; callers remain responsible for choosing the correct API. */
export function adaptProductDetail(data: Record<string, unknown>, id: string): ProductDetail {
  if (readId(data.id) !== id) throw new ProductResponseError('商品详情与请求商品不一致')
  const name = readText(data.name)
  if (!name) throw new ProductResponseError('商品名称缺失')
  if (!Array.isArray(data.detailImages)) throw new ProductResponseError('详情图片必须为数组')
  return {
    id,
    name,
    model: readText(data.model),
    imageUrl: data.coverUrl === null ? null : readImageUrl(data.coverUrl),
    priceFen: data.price === null ? null : readCount(data.price, '价格'),
    sales: readCount(data.sales, '已售数量'),
    stock: readCount(data.stock, '库存'),
    detailImages: data.detailImages.map(readImageUrl),
  }
}

/** Read content directly through the shared gateway client. */
export async function queryProductDetail(
  productId: string,
  options: { signal?: AbortSignal } = {},
): Promise<ProductDetail> {
  const id = readId(productId)
  const endpoint = `/api/products/${id}`
  try {
    const response = await http.get<unknown>(endpoint, options)
    const data = readData(response.data)
    return { ...adaptProductDetail(data, id), isSeckill: data.isSeckill === true }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) {
      // HTTP failures take precedence over a potentially misleading business code.
      rejectStatus(error.response.status)
    }
    throw error
  }
}
