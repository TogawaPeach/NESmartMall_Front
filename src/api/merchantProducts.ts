import axios from 'axios'
import { http, type SessionRequestOptions } from './http'
import { merchantCategoryLabel } from '@/utils/merchantProduct'
import { parseFlashSaleTime } from '@/utils/flashSaleTime'
import { readMerchantDetailImages } from '@/utils/merchantProductForm'
import type {
  MerchantProductPageQuery,
  MerchantProductPageResult,
  MerchantProductRow,
} from '@/types/merchant'

export const MERCHANT_PAGE_SIZE = 8

export class MerchantProductsError extends Error {
  constructor(public readonly kind: 'error' | 'login-required' | 'forbidden' = 'error') {
    super(
      kind === 'login-required'
        ? '登录已过期，请重新登录'
        : kind === 'forbidden'
          ? '暂无权限查看商品列表'
          : '商品列表加载失败，请稍后重试',
    )
    this.name = 'MerchantProductsError'
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MerchantProductsError()
  return value as Record<string, unknown>
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new MerchantProductsError()
  return value
}

function image(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url.href : null
  } catch {
    return null
  }
}

function product(value: unknown): MerchantProductRow {
  const data = record(value)
  if (
    typeof data.id !== 'string' ||
    !/^[1-9]\d*$/.test(data.id) ||
    typeof data.name !== 'string' ||
    !data.name.trim() ||
    ![0, 1, 2].includes(data.status as number) ||
    typeof data.isSeckill !== 'boolean'
  )
    throw new MerchantProductsError()
  const categoryId = count(data.categoryId)
  return {
    id: data.id,
    name: data.name.trim(),
    model: typeof data.model === 'string' ? data.model.trim() : '',
    imageUrl: image(data.coverUrl),
    ...(data.detailImages === undefined
      ? {}
      : { detailImages: readMerchantDetailImages(data.detailImages) }),
    categoryId,
    categoryLabel: merchantCategoryLabel(categoryId),
    priceFen: data.price === null || data.price === undefined ? null : count(data.price),
    stock: count(data.stock),
    status: data.status as 0 | 1 | 2,
    isSeckill: data.isSeckill,
    startsAtMs: parseFlashSaleTime(data.seckillStartTime),
    endsAtMs: parseFlashSaleTime(data.seckillEndTime),
  }
}

function failure(code: unknown): MerchantProductsError {
  return new MerchantProductsError(
    code === 401 ? 'login-required' : code === 403 ? 'forbidden' : 'error',
  )
}

export async function queryMerchantProductPage(
  query: MerchantProductPageQuery,
  options: SessionRequestOptions = {},
): Promise<MerchantProductPageResult> {
  if (
    !Number.isSafeInteger(query.pageNum) ||
    query.pageNum < 1 ||
    (query.status !== undefined && !['all', 'on-sale', 'off-shelf'].includes(query.status))
  )
    throw new MerchantProductsError()
  const params: Record<string, string | number> = {
    pageNum: query.pageNum,
    pageSize: MERCHANT_PAGE_SIZE,
  }
  if (query.status && query.status !== 'all') params.status = query.status
  try {
    const response = await http.get<unknown>('/api/merchant/products/page', { ...options, params })
    const body = record(response.data)
    if (body.code !== 200) throw failure(body.code)
    const data = record(body.data)
    const total = count(data.total)
    if (
      data.pageNum !== query.pageNum ||
      data.pageSize !== MERCHANT_PAGE_SIZE ||
      !Array.isArray(data.list) ||
      data.list.length > MERCHANT_PAGE_SIZE ||
      data.list.length > total
    )
      throw new MerchantProductsError()
    const list = data.list.map(product)
    if (new Set(list.map((p) => p.id)).size !== list.length) throw new MerchantProductsError()
    return { list, total, pageNum: query.pageNum, pageSize: MERCHANT_PAGE_SIZE }
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) throw failure(error.response?.status)
    throw error
  }
}
