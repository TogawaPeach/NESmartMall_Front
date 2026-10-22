import axios from 'axios'
import { onBeforeUnmount, ref, watch } from 'vue'
import { FlashSaleError, queryFlashSaleList } from '@/api/flashSale'
import { useAuthStore } from '@/stores/auth'
import type { FlashSaleCard, FlashSaleLoadState } from '@/types/flashSale'

export function useFlashSaleList() {
  const auth = useAuthStore()
  const products = ref<FlashSaleCard[]>([])
  const state = ref<FlashSaleLoadState>('loading')
  const clockOffsetMs = ref(0)
  let controller: AbortController | undefined
  let sequence = 0

  async function load() {
    const current = ++sequence
    controller?.abort()
    const request = new AbortController()
    controller = request
    products.value = []
    clockOffsetMs.value = 0
    state.value = 'loading'
    try {
      const result = await queryFlashSaleList({ signal: request.signal })
      if (current !== sequence || request.signal.aborted) return
      products.value = result.data
      clockOffsetMs.value = result.clockOffsetMs
      state.value = result.data.length ? 'success' : 'empty'
    } catch (error: unknown) {
      if (current !== sequence || request.signal.aborted || axios.isCancel(error)) return
      state.value = error instanceof FlashSaleError ? error.kind : 'error'
    }
  }

  watch(
    () => auth.accessToken,
    () => void load(),
    { immediate: true, flush: 'sync' },
  )
  onBeforeUnmount(() => {
    ++sequence
    controller?.abort()
  })
  return { products, state, clockOffsetMs, retry: load }
}
