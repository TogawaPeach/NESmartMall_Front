import axios from 'axios'
import { onBeforeUnmount, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import { ProductDetailError, queryProductDetail } from '@/api/productDetail'
import { useAuthStore } from '@/stores/auth'
import type { ProductDetail, ProductDetailLoadState } from '@/types/product'

export function useProductDetail() {
  const route = useRoute()
  const auth = useAuthStore()
  const product = ref<ProductDetail | null>(null)
  const state = ref<ProductDetailLoadState>('loading')
  let controller: AbortController | undefined
  let sequence = 0

  async function load() {
    const requestSequence = ++sequence
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    product.value = null
    state.value = 'loading'
    const id = route.params.id
    if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) {
      state.value = 'unavailable'
      return
    }
    try {
      const result = await queryProductDetail(id, { signal: requestController.signal })
      if (requestSequence !== sequence || requestController.signal.aborted) return
      product.value = result
      state.value = 'success'
    } catch (error: unknown) {
      if (
        requestSequence !== sequence ||
        requestController.signal.aborted ||
        axios.isCancel(error)
      ) {
        return
      }
      state.value = error instanceof ProductDetailError ? error.kind : 'error'
    }
  }

  // Permission is decided by the gateway. A 401 shows login guidance; signing in retries.
  watch(
    () => [route.params.id, auth.accessToken],
    () => void load(),
    { immediate: true },
  )
  onBeforeUnmount(() => {
    ++sequence
    controller?.abort()
  })

  return { product, state, retry: load }
}
