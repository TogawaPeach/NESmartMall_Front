import axios from 'axios'
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { OrderQueryError, queryOrder, queryOrders } from '@/api/orders'
import { isOrderStatus } from '@/constants/orderStatus'
import { useAuthStore } from '@/stores/auth'
import type { OrderLoadState, OrderStatus } from '@/types/order'

function useOrderQuery<T>(
  key: () => string,
  query: (signal: AbortSignal, authorization: string) => Promise<T>,
  empty: (data: T) => boolean,
) {
  const auth = useAuthStore()
  const data = shallowRef<T | null>(null)
  const state = ref<OrderLoadState>('loading')
  let sequence = 0
  let controller: AbortController | undefined
  function clear() {
    ++sequence
    controller?.abort()
    controller = undefined
    data.value = null
  }
  async function load() {
    const authorization = auth.getAuthorization()
    clear()
    if (!authorization) {
      state.value = 'login-required'
      return
    }
    const currentSequence = sequence
    const current = new AbortController()
    controller = current
    state.value = 'loading'
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
      state.value = error instanceof OrderQueryError ? error.kind : 'error'
    }
  }
  watch([() => auth.accessToken, key], () => void load(), { immediate: true, flush: 'sync' })
  onBeforeUnmount(clear)
  return { data, state, retry: load }
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
  return { ...resource, status, changeStatus, listQuery }
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
  return { ...resource, listLocation }
}
