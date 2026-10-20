import { onBeforeUnmount, watch, type Ref } from 'vue'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { useCheckoutStore } from '@/stores/checkout'
import type { CartItem } from '@/types/cart'

export function useCheckoutPayment(
  visible: Ref<boolean>,
  items: () => CartItem[],
  refreshCart?: () => Promise<unknown>,
) {
  const checkout = useCheckoutStore()
  const auth = useAuthStore()
  const refs = storeToRefs(checkout)
  let disposed = false
  async function requestConfirmation() {
    if (!visible.value || disposed) return
    const authorization = auth.getAuthorization()
    const created = await checkout.create(
      items().map(({ productId, quantity }) => ({ productId, quantity })),
    )
    if (auth.getAuthorization() !== authorization) return
    if (!visible.value || disposed) checkout.cancel()
    // Cart cleanup is asynchronous. Its failure cannot change a committed order.
    if (created && !disposed && refreshCart) {
      try {
        await refreshCart()
      } catch {
        /* The known order remains available. */
      }
    }
  }
  watch(
    visible,
    (value) => {
      if (!value) checkout.cancel()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    disposed = true
    checkout.cancel()
  })
  return {
    ...refs,
    requestConfirmation,
    cancel: checkout.cancel,
    newPurchase: checkout.newPurchase,
  }
}
