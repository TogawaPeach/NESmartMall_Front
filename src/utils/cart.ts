import type { CartItem } from '@/types/cart'

export function safeCartAmount(amount: bigint): number | null {
  return amount <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(amount) : null
}

export function cartSubtotal(item: CartItem): number | null {
  if (item.availability !== 'AVAILABLE' || item.priceFen === null) return null
  return safeCartAmount(BigInt(item.priceFen) * BigInt(item.quantity))
}

/** A reason also explains why its checkbox is unavailable. */
export function cartItemIssue(item: CartItem): string | null {
  if (item.availability === 'DELETED') return '商品已失效'
  if (item.availability === 'OFF_SHELF') return '商品已下架'
  if (item.availability === 'OUT_OF_STOCK' || item.stock === 0) return '暂时缺货'
  if (item.stock === null) return '库存待确认'
  if (item.quantity > item.stock) return '库存不足'
  if (item.priceFen === null) return '价格待确认'
  if (cartSubtotal(item) === null) return '金额待确认'
  return null
}
