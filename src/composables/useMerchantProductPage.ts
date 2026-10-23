import axios from 'axios'
import { computed, onMounted, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  MERCHANT_PAGE_SIZE,
  MerchantProductsError,
  queryMerchantProductPage,
} from '@/api/merchantProducts'
import { useAuthStore } from '@/stores/auth'
import type {
  MerchantProductFilter,
  MerchantProductPageState,
  MerchantProductRow,
} from '@/types/merchant'

export function useMerchantProductPage() {
  const auth = useAuthStore()
  const products = shallowRef<MerchantProductRow[]>([])
  const total = ref<number | null>(null)
  const state = ref<MerchantProductPageState>('loading')
  const errorMessage = ref('')
  const pageNum = ref(1)
  const status = ref<MerchantProductFilter>('all')
  const now = ref(Date.now())
  const pageCount = computed(() => Math.max(1, Math.ceil((total.value ?? 0) / MERCHANT_PAGE_SIZE)))
  let sequence = 0
  let controller: AbortController | undefined
  let timer: ReturnType<typeof setInterval> | undefined
  let disposed = false

  async function load(): Promise<void> {
    if (disposed) return
    const request = ++sequence
    controller?.abort()
    products.value = []
    total.value = null
    errorMessage.value = ''
    const authorization = auth.getAuthorization()
    if (request !== sequence) return
    if (!authorization || auth.user?.role !== 0) {
      const error = new MerchantProductsError(authorization ? 'forbidden' : 'login-required')
      state.value = error.kind
      errorMessage.value = error.message
      return
    }
    const current = new AbortController()
    controller = current
    const query = { pageNum: pageNum.value, status: status.value }
    state.value = 'loading'
    const isCurrent = () => {
      const latest = auth.getAuthorization()
      return (
        !disposed &&
        request === sequence &&
        !current.signal.aborted &&
        latest === authorization &&
        auth.user?.role === 0
      )
    }
    try {
      const result = await queryMerchantProductPage(query, {
        signal: current.signal,
        expectedAuthorization: authorization,
      })
      if (!isCurrent()) return
      const lastPage = Math.max(1, Math.ceil(result.total / MERCHANT_PAGE_SIZE))
      if (query.pageNum > lastPage) {
        pageNum.value = lastPage
        return load()
      }
      products.value = result.list
      total.value = result.total
      state.value = result.list.length ? 'success' : 'empty'
    } catch (error) {
      if (!isCurrent() || axios.isCancel(error)) return
      const failure = error instanceof MerchantProductsError ? error : new MerchantProductsError()
      state.value = failure.kind
      errorMessage.value = failure.message
    }
  }

  function selectStatus(next: MerchantProductFilter) {
    if (!['all', 'on-sale', 'off-shelf'].includes(next) || next === status.value) return
    status.value = next
    pageNum.value = 1
    void load()
  }
  function changePage(next: number) {
    if (
      !Number.isSafeInteger(next) ||
      next < 1 ||
      next === pageNum.value ||
      (total.value !== null && next > pageCount.value)
    )
      return
    pageNum.value = next
    void load()
  }
  function resetFilters() {
    status.value = 'all'
    pageNum.value = 1
    return load()
  }

  watch(
    () => [auth.accessToken, auth.user?.id, auth.user?.role],
    () => {
      status.value = 'all'
      pageNum.value = 1
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onMounted(() => {
    now.value = Date.now()
    timer = setInterval(() => {
      now.value = Date.now()
    }, 1000)
  })
  onScopeDispose(() => {
    disposed = true
    ++sequence
    controller?.abort()
    clearInterval(timer)
  })
  return {
    products,
    total,
    state,
    errorMessage,
    pageNum,
    pageSize: MERCHANT_PAGE_SIZE,
    pageCount,
    status,
    now,
    selectStatus,
    changePage,
    resetFilters,
    retry: load,
  }
}
