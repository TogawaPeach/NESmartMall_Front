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

export interface Order {
  id: string
  orderNo: string
  status: OrderStatus
  createdAt: string
  paidAt: string | null
  shippedAt: string | null
  completedAt: string | null
  cancelledAt: string | null
  items: OrderItem[]
  goodsAmountFen: number
  shippingFeeFen: number
  discountAmountFen: number
  payableAmountFen: number
  paidAmountFen: number | null
  recipient: { name: string; phone: string; address: string }
  logistics: { carrier: string; trackingNo: string } | null
}

export interface OrderPage {
  list: Order[]
  total: number
  pageNum: number
  pageSize: number
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
