import axios from 'axios'
import { http, type SessionRequestOptions } from './http'
import { flashSaleContract, flashSaleDemoEnabled } from './flashSaleContract'
import type { OrderRecipient } from '@/types/order'

export interface FlashSaleOrderInput {
  productId: string
  recipient: OrderRecipient
}

export class FlashSaleOrderError extends Error {
  constructor(
    message: string,
    public readonly uncertain = false,
  ) {
    super(message)
    this.name = 'FlashSaleOrderError'
  }
}

/** Whitelist purchase intent and shipping details. Each request buys exactly one item. */
export function prepareFlashSaleOrder(input: FlashSaleOrderInput): FlashSaleOrderInput {
  if (!/^[1-9]\d*$/.test(input.productId)) throw new FlashSaleOrderError('商品信息无效，请刷新页面')
  const recipient = {
    name: input.recipient.name.trim(),
    phone: input.recipient.phone.trim(),
    address: input.recipient.address.trim(),
  }
  if (!recipient.name || recipient.name.length > 100)
    throw new FlashSaleOrderError('请填写收货人（最多 100 字）')
  if (
    recipient.phone.length > 32 ||
    !/^\+?[0-9][0-9 ()-]{5,30}[0-9]$/.test(recipient.phone) ||
    recipient.phone.replace(/\D/g, '').length < 7
  )
    throw new FlashSaleOrderError('请填写有效手机号（7–32 位，可含国际区号）')
  if (!recipient.address || recipient.address.length > 500)
    throw new FlashSaleOrderError('请填写完整收货地址（最多 500 字）')
  return { productId: input.productId, recipient }
}

function rejection(body: unknown, status?: number): FlashSaleOrderError {
  const value =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined
  const code = status ?? value?.code
  if (typeof code !== 'number' || code >= 500)
    return new FlashSaleOrderError('购买结果暂未确认，请稍后查看“我的订单”，避免重复购买。', true)
  const fallback =
    code === 401
      ? '登录已过期，请重新登录后购买'
      : code === 403
        ? '暂无权限购买此秒杀商品'
        : code === 404 || code === 405
          ? '秒杀购买服务暂未开放'
          : '秒杀购买失败，请稍后重试'
  return new FlashSaleOrderError(
    typeof value?.message === 'string' && value.message.trim() ? value.message.trim() : fallback,
  )
}

/** Submit purchase intent only; acceptance does not imply a payable order already exists. */
export async function submitFlashSaleOrder(
  input: FlashSaleOrderInput,
  options: SessionRequestOptions = {},
): Promise<void> {
  if (flashSaleDemoEnabled) throw new FlashSaleOrderError('演示商品暂不可购买')
  const intent = prepareFlashSaleOrder(input)
  try {
    const response = await http.post<unknown>(flashSaleContract.order.endpoint, intent, options)
    const body = response.data
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('code' in body) ||
      body.code !== flashSaleContract.response.successCode
    )
      throw rejection(body)
  } catch (error) {
    if (axios.isCancel(error) || error instanceof FlashSaleOrderError) throw error
    if (axios.isAxiosError(error) && error.response)
      throw rejection(error.response.data, error.response.status)
    throw rejection(null)
  }
}
