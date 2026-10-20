import axios from 'axios'
import { http, type SessionRequestOptions } from './http'
import { isOrderStatus } from '@/constants/orderStatus'
import type {
  CancelOrderResult,
  CreateOrderInput,
  CreateOrderResult,
  Order,
  OrderItem,
  OrderLoadState,
  OrderStatus,
  OrderSummary,
} from '@/types/order'

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
export class OrderReceiptError extends Error {
  constructor(message = '确认收货失败，请稍后重试') {
    super(message)
    this.name = 'OrderReceiptError'
  }
}

function receiptError(body: unknown, status?: number): OrderReceiptError {
  const value =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined
  const code = status ?? value?.code
  const fallback =
    code === 401
      ? '登录已过期，请重新登录后确认收货'
      : code === 403
        ? '无权确认此订单收货'
        : code === 404
          ? '订单不存在或确认收货服务暂未开放'
          : code === 409
            ? '订单状态已变化，请刷新订单后重试'
            : '确认收货失败，请稍后重试'
  return new OrderReceiptError(
    typeof value?.message === 'string' && value.message.trim() ? value.message.trim() : fallback,
  )
}

/** Proposed contract: POST confirms receipt; GET at the same path queries the order. */
export async function confirmReceipt(
  orderNo: string,
  options: SessionRequestOptions = {},
): Promise<void> {
  const path = `/api/orders/${orderNumber(orderNo)}`
  try {
    const { data: body } = await http.post<unknown>(path, undefined, options)
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('code' in body) ||
      body.code !== 200
    )
      throw receiptError(body)
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) throw receiptError(error.response.data, error.response.status)
      throw new OrderReceiptError('无法确认收货结果，请检查网络并刷新订单确认')
    }
    throw error
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
function orderNumber(value: unknown): string {
  if (typeof value !== 'string' || value.length > 64 || !/^JW[1-9]\d*$/.test(value))
    throw new OrderResponseError()
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
function readPaymentFields(v: Record<string, unknown>): Partial<OrderSummary> {
  const fields = ['payExpireAt', 'serverTime', 'canPay', 'displayStatus', 'cancelReason']
  if (fields.every((key) => v[key] === undefined)) return {}
  const payExpireAt = time(v.payExpireAt)
  if (Date.parse(payExpireAt) !== Date.parse(time(v.createdAt)) + 15 * 60_000)
    throw new OrderResponseError()
  // The current backend supplies the deadline before the remaining eligibility fields.
  if (fields.slice(1).every((key) => v[key] === undefined)) return { payExpireAt }
  const serverTime = time(v.serverTime)
  if (
    typeof v.canPay !== 'boolean' ||
    (!isOrderStatus(v.displayStatus) && v.displayStatus !== 'PAYMENT_EXPIRED') ||
    (v.cancelReason !== null && typeof v.cancelReason !== 'string')
  )
    throw new OrderResponseError()
  const expired = Date.parse(serverTime) >= Date.parse(payExpireAt)
  if (
    v.canPay !== (v.status === 'PENDING_PAYMENT' && !expired) ||
    v.displayStatus !==
      (v.status === 'PENDING_PAYMENT' && expired ? 'PAYMENT_EXPIRED' : v.status) ||
    (v.status !== 'CANCELLED' && v.cancelReason !== null)
  )
    throw new OrderResponseError()
  return {
    payExpireAt,
    serverTime,
    canPay: v.canPay,
    displayStatus: v.displayStatus,
    cancelReason: v.cancelReason,
  }
}

function readOrderSummary(value: unknown): OrderSummary {
  const v = record(value)
  if (!isOrderStatus(v.status) || !Array.isArray(v.items) || !v.items.length)
    throw new OrderResponseError()
  const items = v.items.map(readItem)
  if (new Set(items.map((item) => item.id)).size !== items.length) throw new OrderResponseError()
  const goods = items.reduce(
    (sum, item) => sum + BigInt(item.unitPriceFen) * BigInt(item.quantity),
    0n,
  )
  if (goods > BigInt(Number.MAX_SAFE_INTEGER)) throw new OrderResponseError()
  return {
    orderNo: orderNumber(v.orderNo),
    status: v.status,
    createdAt: time(v.createdAt),
    items,
    payableAmountFen: count(v.payableAmountFen),
    ...readPaymentFields(v),
  }
}
function readOrder(value: unknown): Order {
  const v = record(value)
  const summary = readOrderSummary(v)
  const recipient = record(v.recipient)
  const logistics = v.logistics === null ? null : record(v.logistics)
  const result: Order = {
    ...summary,
    paidAt: v.paidAt === null ? null : time(v.paidAt),
    shippedAt: v.shippedAt === null ? null : time(v.shippedAt),
    completedAt: v.completedAt === null ? null : time(v.completedAt),
    cancelledAt: v.cancelledAt === null ? null : time(v.cancelledAt),
    goodsAmountFen: count(v.goodsAmountFen),
    shippingFeeFen: count(v.shippingFeeFen),
    discountAmountFen: count(v.discountAmountFen),
    paidAmountFen: v.paidAmountFen === null ? null : count(v.paidAmountFen),
    recipient: {
      name: text(recipient.name),
      phone: maskedPhone(recipient.phone),
      address: text(recipient.address),
    },
    logistics: logistics ? { trackingNo: text(logistics.trackingNo) } : null,
  }
  const goods = summary.items.reduce(
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
  options: SessionRequestOptions & { params?: Record<string, unknown> },
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
  query: { status?: OrderStatus } = {},
  options: SessionRequestOptions = {},
): Promise<OrderSummary[]> {
  if (query.status !== undefined && !isOrderStatus(query.status)) throw new OrderResponseError()
  const params = query.status ? { status: query.status } : {}
  const data = await request('/api/orders', false, { ...options, params })
  if (!Array.isArray(data)) throw new OrderResponseError()
  const orders = data.map(readOrderSummary)
  if (new Set(orders.map((order) => order.orderNo)).size !== orders.length)
    throw new OrderResponseError()
  return orders
}
export async function queryOrder(
  orderNo: string,
  options: SessionRequestOptions = {},
): Promise<Order> {
  const result = readOrder(await request(`/api/orders/${orderNumber(orderNo)}`, true, options))
  if (result.orderNo !== orderNo) throw new OrderResponseError()
  return result
}

export const CANCEL_UNKNOWN_MESSAGE = '取消结果暂未确认，请刷新订单查看'

export class OrderCancelError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message)
    this.name = 'OrderCancelError'
  }
}

function cancelError(body: unknown, status: number): OrderCancelError {
  const value = body && typeof body === 'object' ? (body as Record<string, unknown>) : null
  const fallback: Record<number, string> = {
    400: '订单号格式错误',
    401: '登录已过期，请重新登录',
    403: '无权取消此订单',
    404: '订单不存在或取消服务暂未开放',
    409: '当前订单状态不允许取消',
    500: '取消订单失败，请稍后重试',
  }
  return new OrderCancelError(
    typeof value?.message === 'string' && value.message.trim()
      ? value.message.trim()
      : (fallback[status] ?? '取消订单失败，请稍后重试'),
    status,
  )
}

export async function cancelOrder(
  orderNo: string,
  options: SessionRequestOptions = {},
): Promise<CancelOrderResult> {
  const path = `/api/orders/${orderNumber(orderNo)}/cancel`
  try {
    const response = await http.post<unknown>(path, undefined, options)
    if (response.status !== 200) throw cancelError(response.data, response.status)
    const body = record(response.data)
    if (typeof body.code === 'number' && body.code >= 400) throw cancelError(body, body.code)
    if (body.code !== 200 || body.message !== 'OK') throw new OrderResponseError()
    const data = record(body.data)
    if (data.orderNo !== orderNo || data.status !== 'CANCELLED') throw new OrderResponseError()
    return { orderNo, status: 'CANCELLED' }
  } catch (cause) {
    if (axios.isCancel(cause) || cause instanceof OrderCancelError) throw cause
    if (axios.isAxiosError(cause) && cause.response)
      throw cancelError(cause.response.data, cause.response.status)
    throw new OrderCancelError(CANCEL_UNKNOWN_MESSAGE)
  }
}

export const CREATE_UNKNOWN_MESSAGE = '下单结果暂未确认，请刷新购物车并查看‘我的订单’。'

export class OrderWriteError extends Error {
  constructor(
    public readonly kind: 'rejected' | 'unavailable' | 'login-required' | 'forbidden' | 'unknown',
    message: string,
  ) {
    super(message)
    this.name = 'OrderWriteError'
  }
}

/** Whitelist only purchase intent. Never copy client pricing or identity into the body. */
export function prepareCreateOrder(input: CreateOrderInput): CreateOrderInput {
  if (!Array.isArray(input.items) || !input.items.length) throw new Error('请选择购买商品')
  const items = input.items.map((item) => ({
    productId: id(item.productId),
    quantity: count(item.quantity, 1),
  }))
  if (new Set(items.map((item) => item.productId)).size !== items.length)
    throw new Error('商品重复，请刷新购物车')
  const { name, phone, address } = input.recipient
  const recipient = { name: name.trim(), phone: phone.trim(), address: address.trim() }
  if (!recipient.name || recipient.name.length > 100)
    throw new Error('请填写收货姓名（最多 100 字）')
  if (
    recipient.phone.length > 32 ||
    !/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(recipient.phone) ||
    recipient.phone.replace(/\D/g, '').length < 7
  )
    throw new Error('请填写有效手机号（7–32 位，可含国际区号）')
  if (!recipient.address || recipient.address.length > 500)
    throw new Error('请填写完整收货地址（最多 500 字）')
  return { items, recipient }
}

function writeRejection(status: unknown): OrderWriteError {
  if (status === 400 || status === 409)
    return new OrderWriteError(
      'rejected',
      status === 409
        ? '商品或库存已变化，请刷新购物车并修改后下单'
        : '下单信息未通过校验，请检查商品及收货信息',
    )
  if (status === 404 || status === 405)
    return new OrderWriteError('unavailable', '订单交易服务暂未开放')
  if (status === 401) return new OrderWriteError('login-required', '请重新登录后操作订单')
  if (status === 403) return new OrderWriteError('forbidden', '暂无权限操作此订单')
  return new OrderWriteError('unknown', CREATE_UNKNOWN_MESSAGE)
}

async function writeOrderData(
  path: string,
  input?: CreateOrderInput,
  options: SessionRequestOptions = {},
): Promise<Record<string, unknown>> {
  let response
  try {
    response = await http.post<unknown>(path, input, options)
  } catch (cause) {
    if (axios.isAxiosError(cause) && cause.response) throw writeRejection(cause.response.status)
    throw new OrderWriteError('unknown', CREATE_UNKNOWN_MESSAGE)
  }
  if (response.status !== 200) throw writeRejection(response.status)
  const body = record(response.data)
  if (body.code !== 200) throw writeRejection(body.code)
  if (body.message !== 'OK') throw new OrderResponseError()
  return record(body.data)
}

async function writeOrder(path: string, options: SessionRequestOptions): Promise<Order> {
  const value = await writeOrderData(path, undefined, options)
  const order = readOrder(value)
  if (
    order.recipient.name.length > 100 ||
    order.recipient.phone.length > 32 ||
    order.recipient.address.length > 500 ||
    order.discountAmountFen !== 0 ||
    (order.paidAmountFen !== null && order.paidAmountFen !== order.payableAmountFen)
  )
    throw new OrderResponseError()
  return order
}

export async function createOrder(
  input: CreateOrderInput,
  options: SessionRequestOptions = {},
): Promise<CreateOrderResult> {
  const intent = prepareCreateOrder(input)
  const result = await writeOrderData('/api/orders', intent, options)
  return {
    orderNo: orderNumber(result.orderNo),
    payableAmountFen: count(result.payableAmountFen),
  }
}

export function isPaidOrder(order: Order): boolean {
  return (
    ['PENDING_SHIPMENT', 'PENDING_RECEIPT', 'COMPLETED'].includes(order.status) &&
    order.paidAt !== null &&
    order.paidAmountFen === order.payableAmountFen
  )
}

export async function payOrder(
  orderNo: string,
  options: SessionRequestOptions = {},
): Promise<Order> {
  const result = await writeOrder(`/api/orders/${orderNumber(orderNo)}/pay`, options)
  if (result.orderNo !== orderNo || !isPaidOrder(result)) throw new OrderResponseError()
  return result
}
