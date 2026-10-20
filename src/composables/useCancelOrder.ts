import axios from 'axios'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { cancelOrder, CANCEL_UNKNOWN_MESSAGE, OrderCancelError, queryOrder } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import type { CancelOrderResult, Order, OrderSummary } from '@/types/order'

export function useCancelOrder(
  order: () => Pick<OrderSummary, 'orderNo' | 'status'>,
  blocked: () => boolean,
) {
  const auth = useAuthStore()
  const visible = ref(false)
  const submitting = ref(false)
  const querying = ref(false)
  const uncertain = ref(false)
  const settled = ref(false)
  const error = ref('')
  const blocking = computed(
    () => submitting.value || querying.value || uncertain.value || settled.value,
  )
  let controller: AbortController | undefined
  let disposed = false

  function reset() {
    controller?.abort()
    controller = undefined
    visible.value = submitting.value = querying.value = uncertain.value = settled.value = false
    error.value = ''
  }
  function open() {
    if (
      disposed ||
      !auth.getAuthorization() ||
      order().status !== 'PENDING_PAYMENT' ||
      blocked() ||
      submitting.value ||
      querying.value ||
      settled.value
    )
      return
    if (!uncertain.value) error.value = ''
    visible.value = true
  }
  function close() {
    if (!submitting.value && !querying.value) visible.value = false
  }
  function begin(authorization: string) {
    const orderNo = order().orderNo
    const current = new AbortController()
    controller = current
    return {
      orderNo,
      options: { signal: current.signal, expectedAuthorization: authorization },
      isCurrent: () =>
        !disposed &&
        !current.signal.aborted &&
        controller === current &&
        auth.getAuthorization() === authorization &&
        order().orderNo === orderNo &&
        order().status === 'PENDING_PAYMENT',
      finish: () => {
        if (controller === current) controller = undefined
      },
    }
  }
  async function refresh(): Promise<Order | null> {
    const authorization = auth.getAuthorization()
    if (
      disposed ||
      !authorization ||
      blocked() ||
      submitting.value ||
      querying.value ||
      settled.value ||
      order().status !== 'PENDING_PAYMENT'
    )
      return null
    const request = begin(authorization)
    querying.value = true
    try {
      const result = await queryOrder(request.orderNo, request.options)
      if (!request.isCurrent()) return null
      uncertain.value = false
      if (result.status === 'PENDING_PAYMENT') {
        error.value = '订单仍待付款，可再次确认取消'
        return null
      }
      settled.value = true
      visible.value = false
      return result
    } catch (cause) {
      if (request.isCurrent() && !axios.isCancel(cause)) {
        uncertain.value = true
        error.value = `${CANCEL_UNKNOWN_MESSAGE}；订单查询失败，请稍后重试`
      }
      return null
    } finally {
      if (request.isCurrent()) querying.value = false
      request.finish()
    }
  }
  async function confirm(): Promise<CancelOrderResult | Order | null> {
    const authorization = auth.getAuthorization()
    if (
      disposed ||
      !authorization ||
      !visible.value ||
      blocking.value ||
      blocked() ||
      order().status !== 'PENDING_PAYMENT'
    )
      return null
    const request = begin(authorization)
    submitting.value = true
    error.value = ''
    let reconcile = false
    try {
      const result = await cancelOrder(request.orderNo, request.options)
      if (!request.isCurrent()) return null
      settled.value = true
      visible.value = false
      return result
    } catch (cause) {
      if (!request.isCurrent() || axios.isCancel(cause)) return null
      error.value = cause instanceof OrderCancelError ? cause.message : CANCEL_UNKNOWN_MESSAGE
      reconcile =
        !(cause instanceof OrderCancelError) || cause.status === undefined || cause.status === 409
      uncertain.value = reconcile
    } finally {
      if (request.isCurrent()) submitting.value = false
      request.finish()
    }
    return reconcile ? refresh() : null
  }
  watch([() => auth.accessToken, () => order().orderNo, () => order().status], reset, {
    flush: 'sync',
  })
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  return {
    visible,
    submitting,
    querying,
    uncertain,
    blocking,
    error,
    open,
    close,
    confirm,
    refresh,
  }
}
