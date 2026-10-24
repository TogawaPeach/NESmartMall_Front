import axios from 'axios'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ProductDetailError, queryProductDetail } from '@/api/productDetail'
import { useAuthStore } from '@/stores/auth'
import type { ProductDetail, ProductDetailLoadState } from '@/types/product'
import { FlashSaleError, queryFlashSaleDetail } from '@/api/flashSale'
import type { FlashSaleWindow } from '@/types/flashSale'

export function useProductDetail() {
  const route = useRoute()
  const router = useRouter()
  const auth = useAuthStore()
  const isFlashSale = computed(() => route.meta.productSource === 'flash-sale')
  const product = ref<ProductDetail | null>(null)
  const state = ref<ProductDetailLoadState | 'unconfigured'>('loading')
  const saleWindow = ref<FlashSaleWindow | null>(null)
  const clockOffsetMs = ref(0)
  let controller: AbortController | undefined
  let sequence = 0

  async function load() {
    const requestSequence = ++sequence
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    product.value = null
    saleWindow.value = null
    clockOffsetMs.value = 0
    state.value = 'loading'
    const id = route.params.id
    if (typeof id !== 'string' || !/^[1-9]\d*$/.test(id)) {
      state.value = 'unavailable'
      return
    }
    try {
      if (isFlashSale.value) {
        const saleResult = await queryFlashSaleDetail(id, { signal: requestController.signal })
        if (requestSequence !== sequence || requestController.signal.aborted) return
        product.value = saleResult.data
        saleWindow.value = saleResult.data
        clockOffsetMs.value = saleResult.clockOffsetMs
      } else {
        const result = await queryProductDetail(id, { signal: requestController.signal })
        if (requestSequence !== sequence || requestController.signal.aborted) return
        if (result.isSeckill) {
          // Keep sale content out of ordinary checkout while the sale route loads its own data.
          await router.replace({
            name: 'flash-sale-detail',
            params: { id },
            query: route.query,
            hash: route.hash,
          })
          return
        }
        product.value = result
      }
      state.value = 'success'
    } catch (error: unknown) {
      if (
        requestSequence !== sequence ||
        requestController.signal.aborted ||
        axios.isCancel(error)
      ) {
        return
      }
      state.value =
        error instanceof ProductDetailError || error instanceof FlashSaleError
          ? error.kind
          : 'error'
    }
  }

  // Permission is decided by the gateway. A 401 shows login guidance; signing in retries.
  watch(
    () => [route.params.id, isFlashSale.value, auth.accessToken],
    () => void load(),
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => {
    ++sequence
    controller?.abort()
  })

  return { product, state, isFlashSale, saleWindow, clockOffsetMs, retry: load }
}
