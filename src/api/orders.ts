import axios from 'axios'
import { http } from './http'
import { isOrderStatus, ORDER_PAGE_SIZE } from '@/constants/orderStatus'
import type { Order, OrderItem, OrderLoadState, OrderPage, OrderStatus } from '@/types/order'

export class OrderResponseError extends Error {
  constructor(message = '订单响应格式异常') {
    super(message)
    this.name = 'OrderResponseError'
  }
}
export class OrderQueryError extends Error {
  constructor(public readonly kind: OrderLoadState) {
    super(kind)
    this.name = 'OrderQueryError'
  }
}
function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new OrderResponseError()
  return value as Record<string, unknown>
}
function text(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new OrderResponseError()
  return value.trim()
}
function id(value: unknown): string {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new OrderResponseError()
  return value
}
function count(value: unknown, min = 0): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < min)
    throw new OrderResponseError()
  return value
}
function time(value: unknown): string {
  const result = text(value)
  const parts =
    /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.exec(result)
  if (!parts) throw new OrderResponseError()
  const [year, month, day, hour, minute, second] = parts.slice(1).map(Number) as [
    number,
    number,
    number,
    number,
    number,
    number,
  ]
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0)
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (
    month < 1 ||
    month > 12 ||
    day < 1 ||
    day > days[month - 1]! ||
    hour > 23 ||
    minute > 59 ||
    second > 59
  )
    throw new OrderResponseError()
  if (
    !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(result) ||
    !Number.isFinite(Date.parse(result))
  )
    throw new OrderResponseError()
  return result
}
function maskedPhone(value: unknown): string {
  const phone = text(value)
  if (/[*•]/.test(phone)) return phone
  const digits = phone.replace(/\D/g, '')
  return digits.length >= 8 ? `${digits.slice(0, 3)}****${digits.slice(-4)}` : '已隐藏'
}
function image(value: unknown): string | null {
  if (value === null) return null
  try {
    const url = new URL(text(value))
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch {
    /* The response stays an error rather than a fabricated placeholder record. */
  }
  throw new OrderResponseError()
}
function readItem(value: unknown): OrderItem {
  const v = record(value)
  return {
    id: id(v.id),
    productId: id(v.productId),
    name: text(v.name),
    model: v.model === null ? null : text(v.model),
    coverUrl: image(v.coverUrl),
    unitPriceFen: count(v.unitPriceFen),
    quantity: count(v.quantity, 1),
  }
}
function readOrder(value: unknown): Order {
  const v = record(value)
  if (!isOrderStatus(v.status) || !Array.isArray(v.items) || !v.items.length)
    throw new OrderResponseError()
  const items = v.items.map(readItem)
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new OrderResponseError()
  const recipient = record(v.recipient)
  const logistics = v.logistics === null ? null : record(v.logistics)
  const result: Order = {
    id: id(v.id),
    orderNo: text(v.orderNo),
    status: v.status,
    createdAt: time(v.createdAt),
    paidAt: v.paidAt === null ? null : time(v.paidAt),
    shippedAt: v.shippedAt === null ? null : time(v.shippedAt),
    completedAt: v.completedAt === null ? null : time(v.completedAt),
    cancelledAt: v.cancelledAt === null ? null : time(v.cancelledAt),
    items,
    goodsAmountFen: count(v.goodsAmountFen),
    shippingFeeFen: count(v.shippingFeeFen),
    discountAmountFen: count(v.discountAmountFen),
    payableAmountFen: count(v.payableAmountFen),
    paidAmountFen: v.paidAmountFen === null ? null : count(v.paidAmountFen),
    recipient: {
      name: text(recipient.name),
      phone: maskedPhone(recipient.phone),
      address: text(recipient.address),
    },
    logistics: logistics
      ? { carrier: text(logistics.carrier), trackingNo: text(logistics.trackingNo) }
      : null,
  }
  const goods = items.reduce(
    (sum, item) => sum + BigInt(item.unitPriceFen) * BigInt(item.quantity),
    0n,
  )
  if (
    goods > BigInt(Number.MAX_SAFE_INTEGER) ||
    goods !== BigInt(result.goodsAmountFen) ||
    goods + BigInt(result.shippingFeeFen) - BigInt(result.discountAmountFen) !==
      BigInt(result.payableAmountFen)
  )
    throw new OrderResponseError()
  const paid = ['PENDING_SHIPMENT', 'PENDING_RECEIPT', 'COMPLETED'].includes(result.status)
  if (
    (paid && (!result.paidAt || result.paidAmountFen === null)) ||
    (result.status === 'PENDING_PAYMENT' &&
      (result.paidAt !== null || result.paidAmountFen !== null)) ||
    (['PENDING_RECEIPT', 'COMPLETED'].includes(result.status) && !result.shippedAt) ||
    (result.status === 'COMPLETED' && !result.completedAt) ||
    (result.status === 'CANCELLED' && !result.cancelledAt)
  )
    throw new OrderResponseError()
  const { status, paidAt, shippedAt, completedAt, cancelledAt } = result
  if (
    (status !== 'CANCELLED' && cancelledAt !== null) ||
    (status === 'PENDING_PAYMENT' && (shippedAt !== null || completedAt !== null)) ||
    (status === 'PENDING_SHIPMENT' && (shippedAt !== null || completedAt !== null)) ||
    (status === 'PENDING_RECEIPT' && completedAt !== null) ||
    (status === 'CANCELLED' && (shippedAt !== null || completedAt !== null)) ||
    (paidAt === null) !== (result.paidAmountFen === null)
  )
    throw new OrderResponseError()
  let previous = Date.parse(result.createdAt)
  for (const event of [paidAt, shippedAt, completedAt, cancelledAt]) {
    if (event === null) continue
    const instant = Date.parse(event)
    if (instant < previous) throw new OrderResponseError()
    previous = instant
  }
  return result
}
function rejectStatus(status: unknown, detail: boolean): never {
  const kind =
    status === 401
      ? 'login-required'
      : status === 403
        ? 'forbidden'
        : status === 404
          ? detail
            ? 'not-found'
            : 'unavailable'
          : status === 503
            ? 'unavailable'
            : 'error'
  throw new OrderQueryError(kind)
}
async function request(
  path: string,
  detail: boolean,
  options: { params?: Record<string, unknown>; signal?: AbortSignal },
): Promise<unknown> {
  try {
    const { data } = await http.get<unknown>(path, options)
    const body = record(data)
    if (body.code !== 200) rejectStatus(body.code, detail)
    return body.data
  } catch (error) {
    if (axios.isAxiosError(error) && error.response) rejectStatus(error.response.status, detail)
    throw error
  }
}
export async function queryOrders(
  query: { status?: OrderStatus; pageNum: number },
  options: { signal?: AbortSignal } = {},
): Promise<OrderPage> {
  count(query.pageNum, 1)
  if (query.status !== undefined && !isOrderStatus(query.status)) throw new OrderResponseError()
  const params = {
    ...(query.status ? { status: query.status } : {}),
    pageNum: query.pageNum,
    pageSize: ORDER_PAGE_SIZE,
  }
  const data = record(await request('/api/orders', false, { ...options, params }))
  if (!Array.isArray(data.list)) throw new OrderResponseError()
  const list = data.list.map(readOrder),
    total = count(data.total),
    pageNum = count(data.pageNum, 1),
    pageSize = count(data.pageSize, 1)
  const offset = BigInt(pageNum - 1) * BigInt(ORDER_PAGE_SIZE)
  const expected = Number(
    BigInt(total) > offset
      ? BigInt(total) - offset < BigInt(ORDER_PAGE_SIZE)
        ? BigInt(total) - offset
        : BigInt(ORDER_PAGE_SIZE)
      : 0n,
  )
  if (
    pageNum !== query.pageNum ||
    pageSize !== ORDER_PAGE_SIZE ||
    list.length !== expected ||
    new Set(list.map((o) => o.id)).size !== list.length
  )
    throw new OrderResponseError()
  return { list, total, pageNum, pageSize }
}
export async function queryOrder(
  orderId: string,
  options: { signal?: AbortSignal } = {},
): Promise<Order> {
  const result = readOrder(await request(`/api/orders/${id(orderId)}`, true, options))
  if (result.id !== orderId) throw new OrderResponseError()
  return result
}
