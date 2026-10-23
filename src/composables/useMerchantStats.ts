import axios from 'axios'
import { onScopeDispose, ref, shallowRef, watch } from 'vue'
import { MerchantStatsError, queryMerchantStats } from '@/api/merchantStats'
import { useAuthStore } from '@/stores/auth'
import type { MerchantStats, MerchantStatsState } from '@/types/merchant'

export function useMerchantStats() {
  const auth = useAuthStore()
  const stats = shallowRef<MerchantStats | null>(null)
  const state = ref<MerchantStatsState>('loading')
  const errorMessage = ref('')
  let sequence = 0
  let controller: AbortController | undefined
  let disposed = false

  async function load() {
    if (disposed) return
    const request = ++sequence
    controller?.abort()
    stats.value = null
    errorMessage.value = ''
    const authorization = auth.getAuthorization()
    // Synchronizing the shared session may have synchronously triggered a newer load.
    if (request !== sequence) return
    if (!authorization || auth.user?.role !== 0) {
      const error = new MerchantStatsError(authorization ? 'forbidden' : 'login-required')
      state.value = error.kind
      errorMessage.value = error.message
      return
    }
    const current = new AbortController()
    controller = current
    state.value = 'loading'
    const isCurrent = () => {
      const latestAuthorization = auth.getAuthorization()
      return (
        !disposed &&
        request === sequence &&
        !current.signal.aborted &&
        latestAuthorization === authorization &&
        auth.user?.role === 0
      )
    }
    try {
      const result = await queryMerchantStats({
        signal: current.signal,
        expectedAuthorization: authorization,
      })
      if (!isCurrent()) return
      stats.value = result
      state.value = 'success'
    } catch (error) {
      if (!isCurrent() || axios.isCancel(error)) return
      const failure = error instanceof MerchantStatsError ? error : new MerchantStatsError()
      state.value = failure.kind
      errorMessage.value = failure.message
    }
  }

  watch(
    () => [auth.accessToken, auth.user?.id, auth.user?.role],
    () => void load(),
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    disposed = true
    ++sequence
    controller?.abort()
  })
  return { stats, state, errorMessage, retry: load }
}
