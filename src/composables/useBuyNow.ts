import { computed, ref, watch, type Ref } from 'vue'
import { useAuthStore } from '@/stores/auth'
import { useCheckoutStore } from '@/stores/checkout'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import type { CartItem } from '@/types/cart'
import type { ProductDetail } from '@/types/product'

/** A single-product receipt; it never adds an item to the persisted cart. */
export function useBuyNow(product: Ref<ProductDetail | null>) {
  const auth = useAuthStore()
  const checkout = useCheckoutStore()
  const loginPrompt = useLoginPromptStore()
  const checkoutOpen = ref(false)
  const hasAttempt = computed(() => checkout.hasAttempt)
  const canPurchase = computed(
    () => !!product.value && product.value.stock > 0 && product.value.priceFen !== null,
  )
  const items = computed<CartItem[]>(() => {
    const current = product.value
    if (!current || !canPurchase.value) return []
    return [
      {
        cartItemId: `buy-now:${current.id}`,
        productId: current.id,
        name: current.name,
        model: current.model,
        imageUrl: current.imageUrl,
        priceFen: current.priceFen,
        quantity: 1,
        stock: current.stock,
        availability: current.stock > 0 ? 'AVAILABLE' : 'OUT_OF_STOCK',
      },
    ]
  })

  function openCheckout() {
    if (!canPurchase.value && !hasAttempt.value) return
    if (!loginPrompt.requireLogin('登录后即可立即购买')) return
    checkoutOpen.value = true
  }

  watch(
    [product, () => auth.accessToken],
    () => {
      checkoutOpen.value = false
    },
    { deep: true, flush: 'sync' },
  )

  return { checkoutOpen, canPurchase, items, hasAttempt, openCheckout }
}
