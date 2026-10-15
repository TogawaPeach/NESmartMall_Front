import axios from 'axios'
import { http } from './http'
import type { CartAvailability, CartItem } from '@/types/cart'

export class CartResponseError extends Error {
  constructor(message = '购物车响应格式异常') {
    super(message)
    this.name = 'CartResponseError'
  }
}

export class CartQueryError extends Error {
  constructor(public readonly kind: 'login-required' | 'forbidden' | 'unavailable') {
    super(kind)
    this.name = 'CartQueryError'
  }
}

function rejectStatus(status: unknown): never {
  if (status === 401) throw new CartQueryError('login-required')
  if (status === 403) throw new CartQueryError('forbidden')
  if (status === 404) throw new CartQueryError('unavailable')
  throw new CartResponseError('购物车查询失败')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function readId(value: unknown): string {
  if (typeof value === 'string' && /^[1-9]\d*$/.test(value)) return value
  throw new CartResponseError('购物车标识必须为正整数字符串')
}

function readCount(value: unknown, minimum = 0): number {
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum) return value
  throw new CartResponseError('购物车金额或数量异常')
}

function readText(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === 'string') return value.trim() || null
  throw new CartResponseError('购物车文字字段异常')
}

function readImage(value: unknown): string | null {
  if (value === null) return null
  if (typeof value === 'string') {
    try {
      const url = new URL(value.trim())
      if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
    } catch {
      /* Invalid URLs are response errors, not empty images. */
    }
  }
  throw new CartResponseError('购物车图片地址异常')
}

const availabilities: readonly string[] = ['AVAILABLE', 'OUT_OF_STOCK', 'OFF_SHELF', 'DELETED']

function readItem(value: unknown): CartItem {
  if (!isRecord(value) || !availabilities.includes(value.availability as string)) {
    throw new CartResponseError('购物车商品状态异常')
  }
  const name = readText(value.name)
  if (value.availability !== 'DELETED' && !name) throw new CartResponseError('购物车商品名称缺失')
  return {
    cartItemId: readId(value.cartItemId),
    productId: readId(value.productId),
    name,
    model: readText(value.model),
    imageUrl: readImage(value.coverUrl),
    priceFen: value.price === null ? null : readCount(value.price),
    quantity: readCount(value.quantity, 1),
    stock: value.stock === null ? null : readCount(value.stock),
    availability: value.availability as CartAvailability,
  }
}

/** The gateway identifies the user; never send account IDs or query products individually. */
export async function queryCart(options: { signal?: AbortSignal } = {}): Promise<CartItem[]> {
  try {
    const { data: body } = await http.get<unknown>('/api/cart', options)
    if (!isRecord(body)) throw new CartResponseError()
    if (body.code !== 200) rejectStatus(body.code)
    if (!isRecord(body.data) || !Array.isArray(body.data.items)) throw new CartResponseError()
    const items = body.data.items.map(readItem)
    if (new Set(items.map((item) => item.cartItemId)).size !== items.length) {
      throw new CartResponseError('购物车条目标识重复')
    }
    return items
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) rejectStatus(error.response.status)
    throw error
  }
}
