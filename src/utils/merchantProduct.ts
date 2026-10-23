import { getFlashSaleStatus } from './flashSaleTime'
import type { MerchantProductRow } from '@/types/merchant'

export function merchantCategoryLabel(id: number): string {
  return ['未分类', '全站仪', 'GNSS / RTK', '水准仪', '测距仪', '配件'][id] ?? '未知分类'
}

/** Activity labels never overwrite the numeric listing status used for filtering. */
export function merchantProductDisplay(product: MerchantProductRow, now: number) {
  if (product.status === 2) return { label: '已下架', selling: false }
  if (product.status === 0) return { label: '草稿', selling: false }
  if (!product.isSeckill) return { label: '在售中', selling: true }
  const stage = getFlashSaleStatus(product, now)
  return {
    label: { upcoming: '未开始', active: '正在秒杀', ended: '已结束', invalid: '秒杀时间异常' }[
      stage
    ],
    selling: stage === 'active',
  }
}
