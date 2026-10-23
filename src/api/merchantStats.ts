import axios from 'axios'
import { http, type SessionRequestOptions } from './http'
import type { MerchantStats, MerchantStatsState } from '@/types/merchant'

export class MerchantStatsError extends Error {
  constructor(public readonly kind: Exclude<MerchantStatsState, 'loading' | 'success'> = 'error') {
    super(
      kind === 'login-required'
        ? '登录已过期，请重新登录'
        : kind === 'forbidden'
          ? '暂无权限查看商品统计'
          : '商品统计加载失败，请稍后重试',
    )
    this.name = 'MerchantStatsError'
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new MerchantStatsError()
  return value as Record<string, unknown>
}

function count(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0)
    throw new MerchantStatsError()
  return value
}

function failure(code: unknown): MerchantStatsError {
  return new MerchantStatsError(
    code === 401 ? 'login-required' : code === 403 ? 'forbidden' : 'error',
  )
}

/** Read the full-store count object; never derive it from a page of products. */
export async function queryMerchantStats(
  options: SessionRequestOptions = {},
): Promise<MerchantStats> {
  try {
    const response = await http.get<unknown>('/api/merchant/products/stats', options)
    const body = record(response.data)
    if (body.code !== 200) throw failure(body.code)
    const data = record(body.data)
    return {
      allCount: count(data.allCount),
      onSaleCount: count(data.onSaleCount),
      offShelfCount: count(data.offShelfCount),
    }
  } catch (error) {
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) throw failure(error.response?.status)
    throw error
  }
}
