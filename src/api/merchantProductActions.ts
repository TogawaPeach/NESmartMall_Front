import axios from 'axios'
import { http, type SessionRequestOptions } from './http'
import type { MerchantProductSaveInput } from '@/types/merchant'
import { readMerchantDetailImages } from '@/utils/merchantProductForm'

export class MerchantMutationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MerchantMutationError'
  }
}

function failure(body: unknown, httpStatus?: number): MerchantMutationError {
  const value =
    body && typeof body === 'object' && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : undefined
  const code = httpStatus ?? value?.code
  if (code === 401) return new MerchantMutationError('登录已过期，请重新登录')
  if (code === 403) return new MerchantMutationError('暂无权限操作该商品')
  return new MerchantMutationError(
    typeof value?.message === 'string' && value.message.trim()
      ? value.message.trim()
      : '商品操作失败，请稍后重试',
  )
}

async function post(path: string, body: unknown, options: SessionRequestOptions): Promise<void> {
  try {
    const { data } = await http.post<unknown>(path, body, options)
    if (
      !data ||
      typeof data !== 'object' ||
      Array.isArray(data) ||
      !('code' in data) ||
      data.code !== 200
    )
      throw failure(data)
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) throw failure(error.response.data, error.response.status)
      throw new MerchantMutationError('无法确认操作结果，请重新加载商品确认后再试')
    }
    throw error
  }
}

export function saveMerchantProduct(
  input: MerchantProductSaveInput,
  options: SessionRequestOptions = {},
): Promise<void> {
  return post('/api/merchant/products/save', input, options)
}

export function setMerchantProductStatus(
  id: string,
  status: 1 | 2,
  options: SessionRequestOptions = {},
): Promise<void> {
  if (!/^[1-9]\d*$/.test(id) || ![1, 2].includes(status))
    return Promise.reject(new MerchantMutationError('商品编号或状态无效'))
  return post(`/api/merchant/products/${id}/status`, { status }, options)
}

/** Missing list images mean unknown, so read the merchant resource before editing. */
export async function queryMerchantProductImages(
  id: string,
  options: SessionRequestOptions = {},
): Promise<string[]> {
  if (!/^[1-9]\d*$/.test(id)) throw new MerchantMutationError('商品编号无效')
  try {
    const { data: body } = await http.get<unknown>(`/api/merchant/products/${id}`, options)
    if (
      !body ||
      typeof body !== 'object' ||
      Array.isArray(body) ||
      !('code' in body) ||
      body.code !== 200
    )
      throw failure(body)
    if (
      !('data' in body) ||
      !body.data ||
      typeof body.data !== 'object' ||
      Array.isArray(body.data)
    )
      throw new MerchantMutationError('商品详情图读取失败，请重新加载后再修改')
    const data = body.data as Record<string, unknown>
    if (data.id !== undefined && data.id !== id)
      throw new MerchantMutationError('商品详情与请求编号不一致')
    return readMerchantDetailImages(data.detailImages)
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) throw failure(error.response?.data, error.response?.status)
    throw error
  }
}
