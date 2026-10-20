import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { isPaidOrder, OrderWriteError, payOrder, queryOrder } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import type { PaymentOrder } from '@/types/order'

/** Server time is anchored to monotonic elapsed time, never the device's calendar clock. */
export function useOrderPayment(
  order: Ref<PaymentOrder | null>,
  options: { keepConfirmationOnSuccess?: boolean } = {},
) {
  const auth = useAuthStore()
  const confirmVisible = ref(false)
  const paying = ref(false)
  const querying = ref(false)
  const paymentError = ref('')
  const uncertain = ref(false)
  const paidOrderNo = ref('')
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
  const paid = computed(
    () => !!order.value && (paidOrderNo.value === order.value.orderNo || isPaidOrder(order.value)),
  )
  const canPay = computed(
    () =>
      !!order.value &&
      (order.value.status === undefined || order.value.status === 'PENDING_PAYMENT') &&
      order.value.canPay !== false &&
      order.value.displayStatus !== 'PAYMENT_EXPIRED' &&
      remainingMs.value !== 0 &&
      !paid.value &&
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
    if (paid.value) return '模拟支付成功，未产生实际扣款'
    if (value.status === 'CANCELLED')
      return value.cancelReason === 'PAYMENT_TIMEOUT' ? '订单已取消：支付超时' : '订单已取消'
    if (value.status !== undefined && value.status !== 'PENDING_PAYMENT') return ''
    if (remainingMs.value === 0 || value.displayStatus === 'PAYMENT_EXPIRED')
      return '支付已超时，订单关闭处理中'
    if (value.canPay === false) return '当前订单暂不可支付，请刷新订单'
    if (remainingMs.value === null) return '模拟支付不会实际扣款，是否可支付以服务器处理结果为准。'
    return `剩余支付时间 ${countdown.value}`
  })
  watch(
    order,
    (value, previous) => {
      if (value) ownerAuthorization = auth.getAuthorization()
      anchor = performance.now()
      elapsed.value = 0
      if (value?.orderNo !== previous?.orderNo) {
        expiryQueried = false
        paidOrderNo.value = ''
      }
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
      if (isPaidOrder(result) && !options.keepConfirmationOnSuccess) confirmVisible.value = false
      return true
    } catch {
      if (auth.getAuthorization() === authorization && revision === current)
        paymentError.value = paid.value
          ? '支付成功，订单刷新失败，请稍后刷新订单'
          : uncertain.value
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
      await payOrder(orderNo, { expectedAuthorization: authorization })
      if (auth.getAuthorization() !== authorization || revision !== current) return
      paidOrderNo.value = orderNo
      uncertain.value = false
      if (!options.keepConfirmationOnSuccess) confirmVisible.value = false
    } catch (cause) {
      if (auth.getAuthorization() !== authorization || revision !== current) return
      if (cause instanceof OrderWriteError && cause.kind !== 'unknown') {
        paymentError.value = cause.message
        return
      }
      uncertain.value = true
      paymentError.value = '支付结果暂未确认，请查看订单'
    } finally {
      if (revision === current) paying.value = false
    }
    if (revision === current && (paid.value || uncertain.value)) await refresh(orderNo)
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
    paidOrderNo.value = ''
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
          !paid.value &&
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
