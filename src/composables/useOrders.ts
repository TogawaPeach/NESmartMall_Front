import axios from 'axios'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderQueryError, queryOrder, queryOrders } from '@/api/orders'
import { isOrderStatus } from '@/constants/orderStatus'
import { useAuthStore } from '@/stores/auth'
import type {
  CancelOrderResult,
  Order,
  OrderLoadState,
  OrderStatus,
  OrderSummary,
} from '@/types/order'

function useOrderQuery<T>(
  key: () => string,
  query: (signal: AbortSignal, authorization: string) => Promise<T>,
  empty: (data: T) => boolean,
) {
  const auth = useAuthStore()
  const data = shallowRef<T | null>(null)
  const state = ref<OrderLoadState>('loading')
  const refreshing = ref(false)
  const refreshError = ref('')
  let sequence = 0
  let controller: AbortController | undefined
  function clear(keepData = false) {
    ++sequence
    controller?.abort()
    controller = undefined
    if (!keepData) data.value = null
  }
  async function load(keepData = false) {
    const authorization = auth.getAuthorization()
    const preserve = keepData && data.value !== null
    clear(preserve)
    refreshError.value = ''
    refreshing.value = false
    if (!authorization) {
      data.value = null
      state.value = 'login-required'
      return
    }
    const currentSequence = sequence
    const current = new AbortController()
    controller = current
    if (!preserve) state.value = 'loading'
    refreshing.value = true
    const isCurrent = () => {
      const latest = auth.getAuthorization()
      return sequence === currentSequence && !current.signal.aborted && latest === authorization
    }
    try {
      const result = await query(current.signal, authorization)
      if (!isCurrent()) return
      data.value = result
      state.value = empty(result) ? 'empty' : 'success'
    } catch (error) {
      if (!isCurrent() || axios.isCancel(error)) return
      const kind = error instanceof OrderQueryError ? error.kind : 'error'
      if (preserve && !['login-required', 'forbidden', 'not-found'].includes(kind)) {
        refreshError.value = '订单刷新失败，已保留当前状态，请稍后重试'
      } else {
        data.value = null
        state.value = kind
      }
    } finally {
      if (isCurrent()) refreshing.value = false
    }
  }
  watch([() => auth.accessToken, key], () => void load(), { immediate: true, flush: 'sync' })
  onBeforeUnmount(() => clear())
  return {
    data,
    state,
    refreshing,
    refreshError,
    retry: () => load(data.value !== null),
    refresh: () => load(true),
  }
}

function mergeChange<T extends OrderSummary>(order: T, change: CancelOrderResult | Order): T {
  return { ...order, ...change, canPay: false, displayStatus: change.status }
}

export function useOrders() {
  const route = useRoute(),
    router = useRouter()
  const status = computed(() =>
    isOrderStatus(route.query.status) ? route.query.status : undefined,
  )
  const resource = useOrderQuery(
    () => status.value ?? '',
    (signal, authorization) =>
      queryOrders({ status: status.value }, { signal, expectedAuthorization: authorization }),
    (orders) => orders.length === 0,
  )
  function changeStatus(value: OrderStatus | undefined) {
    return router.push({
      name: 'orders',
      query: value ? { status: value } : {},
    })
  }
  const listQuery = computed(() => (status.value ? { status: status.value } : {}))
  async function reconcile(change: CancelOrderResult | Order) {
    if (!resource.data.value?.some((order) => order.orderNo === change.orderNo)) return
    resource.data.value = resource.data.value
      .map((order) => (order.orderNo === change.orderNo ? mergeChange(order, change) : order))
      .filter((order) => !status.value || order.status === status.value)
    resource.state.value = resource.data.value.length ? 'success' : 'empty'
    await resource.refresh()
  }
  return { ...resource, status, changeStatus, listQuery, reconcile }
}

export function useOrderDetail() {
  const route = useRoute()
  const resource = useOrderQuery(
    () => String(route.params.orderNo),
    (signal, authorization) =>
      queryOrder(String(route.params.orderNo), { signal, expectedAuthorization: authorization }),
    () => false,
  )
  const listLocation = computed(() => ({
    name: 'orders',
    query: isOrderStatus(route.query.status) ? { status: route.query.status } : {},
  }))
  async function reconcile(change: CancelOrderResult | Order) {
    if (resource.data.value?.orderNo !== change.orderNo) return
    resource.data.value = mergeChange(resource.data.value, change)
    await resource.refresh()
  }
  return { ...resource, listLocation, reconcile }
}
