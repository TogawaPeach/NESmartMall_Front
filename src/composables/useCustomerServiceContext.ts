import { useCustomerServiceStore } from '@/stores/customerService'
import type { ProductDetail } from '@/types/product'
import type { Order } from '@/types/order'

/** Only minimal consultation snapshots; never copy order recipient or authentication data. */
export function useCustomerServiceContext() {
  const support = useCustomerServiceStore()
  function consultProduct(product: ProductDetail) {
    support.open('support', {
      kind: 'product',
      id: product.id,
      name: product.name,
      model: product.model,
      priceFen: product.priceFen,
    })
  }
  function consultOrder(order: Order) {
    support.open('support', {
      kind: 'order',
      orderNo: order.orderNo,
      status: order.status,
      amountFen: order.paidAmountFen ?? order.payableAmountFen,
      amountLabel: order.paidAmountFen === null ? '应付金额' : '实付金额',
    })
  }
  return { consultProduct, consultOrder }
}
