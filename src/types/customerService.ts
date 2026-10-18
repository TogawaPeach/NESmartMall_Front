import type { OrderStatus } from './order'

export interface ProductSupportContext {
  kind: 'product'
  id: string
  name: string
  model: string | null
  priceFen: number | null
}
export interface OrderSupportContext {
  kind: 'order'
  orderNo: string
  status: OrderStatus
  amountFen: number
  amountLabel: '应付金额' | '实付金额'
}
export type SupportContext = ProductSupportContext | OrderSupportContext
interface MessageBase {
  id: number
  sender: 'visitor' | 'service'
  createdAt: number
}
export type CustomerServiceMessage = MessageBase &
  ({ kind: 'text'; text: string } | { kind: 'context'; context: SupportContext })
