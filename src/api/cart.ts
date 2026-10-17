import axios from 'axios'
import { http } from './http'
import type { CartAvailability, CartItem } from '@/types/cart'
import { MAX_CART_QUANTITY } from '@/utils/cart'

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

export class CartAddError extends Error {
  constructor(
    message: string,
    public readonly loginRequired = false,
  ) {
    super(message)
    this.name = 'CartAddError'
  }
}

export class CartQuantityError extends Error {
  constructor(message = '修改数量失败，请稍后重试') {
    super(message)
    this.name = 'CartQuantityError'
  }
}

export class CartRemoveError extends Error {
  constructor(message = '删除失败，请稍后重试') {
    super(message)
    this.name = 'CartRemoveError'
  }
}

function removeError(body: unknown, status?: number): CartRemoveError {
  const code = status ?? (isRecord(body) ? body.code : undefined)
  const fallback = code === 401 ? '请重新登录后删除商品' : '删除失败，请稍后重试'
  return new CartRemoveError(
    isRecord(body) && typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : fallback,
  )
}

/** Delete this product only from the current user's cart. */
export async function deleteCartItem(
  productId: string,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  readId(productId)
  try {
    const { data: body } = await http.delete<unknown>(`/api/cart/${productId}`, options)
    if (!isRecord(body) || body.code !== 200) throw removeError(body)
  } catch (error: unknown) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) throw removeError(error.response.data, error.response.status)
      throw new CartRemoveError('无法确认删除结果，请检查网络并刷新购物车确认')
    }
    throw error
  }
}

function quantityError(body: unknown, status?: number): CartQuantityError {
  const code = status ?? (isRecord(body) ? body.code : undefined)
  const fallback = code === 401 ? '请重新登录后修改数量' : '修改数量失败，请稍后重试'
  return new CartQuantityError(
    isRecord(body) && typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : fallback,
  )
}

/** Set the final quantity of a product already in the current user's cart. */
export async function setCartItemQuantity(
  productId: string,
  quantity: number,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  readId(productId)
  readCount(quantity, 1)
  if (quantity > MAX_CART_QUANTITY) throw new CartQuantityError('商品数量超出可保存范围')
  try {
    const { data: body } = await http.put<unknown>(
      `/api/cart/${productId}/quantity`,
      { quantity },
      options,
    )
    if (!isRecord(body) || body.code !== 200) throw quantityError(body)
  } catch (error: unknown) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) throw quantityError(error.response.data, error.response.status)
      throw new CartQuantityError('无法确认修改结果，请检查网络并刷新购物车确认数量')
    }
    throw error
  }
}

function addError(body: unknown, status?: number): CartAddError {
  const code = status ?? (isRecord(body) ? body.code : undefined)
  const loginRequired = code === 401
  const fallback = loginRequired ? '请先登录后再加入购物车' : '加入购物车失败，请稍后重试'
  const message =
    isRecord(body) && typeof body.message === 'string' && body.message.trim()
      ? body.message.trim()
      : fallback
  return new CartAddError(message, loginRequired)
}

/** Add only the product reference and quantity; the gateway supplies user identity. */
export async function addCartItem(
  productId: string,
  quantity: number,
  options: { signal?: AbortSignal } = {},
): Promise<void> {
  readId(productId)
  readCount(quantity, 1)
  try {
    const { data: body } = await http.post<unknown>('/api/cart', { productId, quantity }, options)
    if (!isRecord(body) || body.code !== 200) throw addError(body)
  } catch (error: unknown) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) throw addError(error.response.data, error.response.status)
      throw new CartAddError(
        error.code === 'ECONNABORTED'
          ? '加入购物车请求超时，请先查看购物车确认结果'
          : '无法确认加入结果，请检查网络并查看购物车',
      )
    }
    throw error
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
