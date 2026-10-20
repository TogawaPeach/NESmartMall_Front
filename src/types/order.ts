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
  payExpireAt?: string
  serverTime?: string
  canPay?: boolean
  displayStatus?: OrderStatus | 'PAYMENT_EXPIRED'
  cancelReason?: string | null
}

export interface OrderRecipient {
  name: string
  phone: string
  address: string
}

export interface CreateOrderInput {
  items: { productId: string; quantity: number }[]
  recipient: OrderRecipient
}

export interface CreateOrderResult {
  orderNo: string
  payableAmountFen: number
}

export interface CancelOrderResult {
  orderNo: string
  status: 'CANCELLED'
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
  logistics: { trackingNo: string } | null
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
