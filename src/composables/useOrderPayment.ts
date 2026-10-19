import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { isPaidOrder, OrderWriteError, payOrder, queryOrder } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import type { Order } from '@/types/order'

/** Server time is anchored to monotonic elapsed time, never the device's calendar clock. */
export function useOrderPayment(order: Ref<Order | null>) {
  const auth = useAuthStore()
  const confirmVisible = ref(false)
  const paying = ref(false)
  const querying = ref(false)
  const paymentError = ref('')
  const uncertain = ref(false)
  const elapsed = ref(0)
  let anchor = performance.now()
  let revision = 0
  let ownerAuthorization = auth.getAuthorization()
  let expiryQueried = false
  const remainingMs = computed(() => {
    if (!order.value?.serverTime || !order.value.payExpireAt) return null
    return Math.max(
      0,
      Date.parse(order.value.payExpireAt) - Date.parse(order.value.serverTime) - elapsed.value,
    )
  })
  const paid = computed(() => !!order.value && isPaidOrder(order.value))
  const canPay = computed(
    () =>
      order.value?.status === 'PENDING_PAYMENT' &&
      order.value.canPay === true &&
      remainingMs.value !== null &&
      remainingMs.value > 0 &&
      !uncertain.value,
  )
  const countdown = computed(() => {
    if (remainingMs.value === null) return ''
    const seconds = Math.ceil(remainingMs.value / 1000)
    return `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  })
  const paymentNotice = computed(() => {
    const value = order.value
    if (!value) return ''
    if (value.status === 'CANCELLED')
      return value.cancelReason === 'PAYMENT_TIMEOUT' ? '订单已取消：支付超时' : '订单已取消'
    if (value.status !== 'PENDING_PAYMENT') return paid.value ? '模拟支付成功，未产生实际扣款' : ''
    if (remainingMs.value === 0 || value.displayStatus === 'PAYMENT_EXPIRED')
      return '支付已超时，订单关闭处理中'
    if (remainingMs.value === null || value.canPay !== true) return '付款信息暂未就绪，请刷新订单'
    return `剩余支付时间 ${countdown.value}`
  })
  watch(
    order,
    (value, previous) => {
      if (value) ownerAuthorization = auth.getAuthorization()
      anchor = performance.now()
      elapsed.value = 0
      if (value?.orderNo !== previous?.orderNo) expiryQueried = false
    },
    { flush: 'sync' },
  )

  async function refresh(orderNo = order.value?.orderNo): Promise<boolean> {
    const authorization = auth.getAuthorization()
    if (
      !authorization ||
      authorization !== ownerAuthorization ||
      !orderNo ||
      querying.value ||
      paying.value
    )
      return false
    const current = revision
    querying.value = true
    try {
      const result = await queryOrder(orderNo, { expectedAuthorization: authorization })
      if (auth.getAuthorization() !== authorization || revision !== current) return false
      order.value = result
      uncertain.value = false
      paymentError.value = ''
      if (isPaidOrder(result)) confirmVisible.value = false
      return true
    } catch {
      if (auth.getAuthorization() === authorization && revision === current)
        paymentError.value = uncertain.value
          ? '支付结果暂未确认，请查看订单'
          : '订单查询失败，请稍后刷新订单'
      return false
    } finally {
      if (revision === current) querying.value = false
    }
  }

  async function confirm() {
    const authorization = auth.getAuthorization()
    // Re-read elapsed time at the click boundary, including background-tab timer throttling.
    elapsed.value = Math.max(0, performance.now() - anchor)
    if (
      !authorization ||
      !confirmVisible.value ||
      !canPay.value ||
      paying.value ||
      querying.value ||
      !order.value
    )
      return
    const current = revision
    const orderNo = order.value.orderNo
    paying.value = true
    paymentError.value = ''
    try {
      const result = await payOrder(orderNo, { expectedAuthorization: authorization })
      if (auth.getAuthorization() !== authorization || revision !== current) return
      order.value = result
      uncertain.value = false
      confirmVisible.value = false
    } catch (cause) {
      if (auth.getAuthorization() !== authorization || revision !== current) return
      if (cause instanceof OrderWriteError && cause.kind !== 'unknown') {
        paymentError.value =
          cause.kind === 'rejected' ? '支付未完成，请刷新订单确认当前状态' : cause.message
        return
      }
      uncertain.value = true
      paymentError.value = '支付结果暂未确认，请查看订单'
    } finally {
      if (revision === current) paying.value = false
    }
    if (revision === current && uncertain.value) await refresh(orderNo)
  }

  function cancel() {
    confirmVisible.value = false
  }
  function reset() {
    revision++
    ownerAuthorization = null
    order.value = null
    confirmVisible.value = false
    paying.value = false
    querying.value = false
    uncertain.value = false
    paymentError.value = ''
  }
  watch(() => auth.accessToken, reset, { flush: 'sync' })
  let timer: ReturnType<typeof setInterval> | undefined
  watch(
    order,
    (value) => {
      clearInterval(timer)
      if (value?.status !== 'PENDING_PAYMENT') return
      timer = setInterval(() => {
        elapsed.value = Math.max(0, performance.now() - anchor)
        if (
          remainingMs.value === 0 &&
          order.value?.status === 'PENDING_PAYMENT' &&
          !expiryQueried &&
          !paying.value &&
          !querying.value
        ) {
          expiryQueried = true
          void refresh()
        }
      }, 1000)
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(() => {
    clearInterval(timer)
    revision++
  })
  return {
    confirmVisible,
    paying,
    querying,
    paymentError,
    uncertain,
    paid,
    canPay,
    countdown,
    paymentNotice,
    confirm,
    cancel,
    refresh,
    reset,
  }
}
