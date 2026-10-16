import type { OrderStatus } from '@/types/order'

export const ORDER_PAGE_SIZE = 5
export const orderStatuses: { value: OrderStatus; label: string; description: string }[] = [
  { value: 'PENDING_PAYMENT', label: '待付款', description: '订单已提交，等待完成付款。' },
  { value: 'PENDING_SHIPMENT', label: '待发货', description: '付款已完成，等待商家安排发货。' },
  { value: 'PENDING_RECEIPT', label: '待收货', description: '商品已发出，等待收货。' },
  { value: 'COMPLETED', label: '已完成', description: '这笔订单已完成。' },
  { value: 'CANCELLED', label: '已取消', description: '订单已取消，交易已关闭。' },
]
export function isOrderStatus(value: unknown): value is OrderStatus {
  return orderStatuses.some((status) => status.value === value)
}
export function orderStatusInfo(value: OrderStatus) {
  return orderStatuses.find((status) => status.value === value)!
}
export function orderPageNumber(value: unknown): number {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) ? page : 1
}
export function formatOrderTime(value: string | null): string {
  if (!value) return '待完成'
  return new Intl.DateTimeFormat('zh-CN', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(value))
}
