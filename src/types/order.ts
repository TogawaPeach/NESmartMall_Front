export type OrderStatus =
  'PENDING_PAYMENT' | 'PENDING_SHIPMENT' | 'PENDING_RECEIPT' | 'COMPLETED' | 'CANCELLED'

export interface OrderItem {
  id: string
  productId: string
  name: string
  model: string | null
  coverUrl: string | null
  unitPriceFen: number
  quantity: number
}

export interface OrderSummary {
  orderNo: string
  status: OrderStatus
  createdAt: string
  items: OrderItem[]
  payableAmountFen: number
}

export interface Order extends OrderSummary {
  paidAt: string | null
  shippedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  goodsAmountFen: number
  shippingFeeFen: number
  discountAmountFen: number
  paidAmountFen: number | null
  recipient: { name: string; phone: string; address: string }
  logistics: { carrier: string; trackingNo: string } | null
}

export type OrderLoadState =
  | 'loading'
  | 'success'
  | 'empty'
  | 'login-required'
  | 'forbidden'
  | 'unavailable'
  | 'not-found'
  | 'error'
