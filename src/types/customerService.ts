import type { OrderStatus } from './order'

export type CustomerServiceEntry = 'guide' | 'support'

export interface TransferHumanActionPayload {
  kind: 'transfer_human'
  label: string
  actionId: string
}

export type TransferHumanSubmissionState =
  | { status: 'idle' }
  | { status: 'submitting' }
  | { status: 'submitted'; ticketNo: string; message: string }
  | { status: 'failed'; error: string }
  | { status: 'expired'; error: string }

export interface TransferHumanAction extends TransferHumanActionPayload {
  submission: TransferHumanSubmissionState
}

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
  (
    | {
        kind: 'text'
        text: string
        replyStatus?: 'streaming' | 'done' | 'interrupted'
        actions?: TransferHumanAction[]
      }
    | { kind: 'context'; context: SupportContext }
  )
