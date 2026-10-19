import axios from 'axios'
import { onBeforeUnmount, ref, watch } from 'vue'
import { confirmReceipt, OrderReceiptError } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import type { OrderSummary } from '@/types/order'

export function useConfirmReceipt(order: () => Pick<OrderSummary, 'orderNo' | 'status'>) {
  const auth = useAuthStore()
  const visible = ref(false)
  const submitting = ref(false)
  const error = ref('')
  const submitted = ref(false)
  let controller: AbortController | undefined
  let disposed = false

  function reset() {
    controller?.abort()
    controller = undefined
    visible.value = false
    submitting.value = false
    submitted.value = false
    error.value = ''
  }

  function open() {
    if (
      disposed ||
      !auth.getAuthorization() ||
      order().status !== 'PENDING_RECEIPT' ||
      submitting.value ||
      submitted.value
    )
      return
    error.value = ''
    visible.value = true
  }

  function close() {
    if (!submitting.value) visible.value = false
  }

  async function confirm(): Promise<boolean> {
    const authorization = auth.getAuthorization()
    if (
      disposed ||
      !authorization ||
      !visible.value ||
      submitting.value ||
      submitted.value ||
      order().status !== 'PENDING_RECEIPT'
    )
      return false
    const orderNo = order().orderNo
    const current = new AbortController()
    controller = current
    submitting.value = true
    error.value = ''
    const isCurrent = () => {
      const latest = auth.getAuthorization()
      return (
        !disposed &&
        !current.signal.aborted &&
        controller === current &&
        latest === authorization &&
        order().orderNo === orderNo &&
        order().status === 'PENDING_RECEIPT'
      )
    }
    try {
      await confirmReceipt(orderNo, {
        signal: current.signal,
        expectedAuthorization: authorization,
      })
      if (!isCurrent()) return false
      submitted.value = true
      visible.value = false
      return true
    } catch (cause) {
      if (isCurrent() && !axios.isCancel(cause)) {
        error.value =
          cause instanceof OrderReceiptError ? cause.message : '确认收货失败，请刷新订单后重试'
      }
      return false
    } finally {
      if (controller === current) {
        controller = undefined
        submitting.value = false
      }
    }
  }

  watch([() => auth.accessToken, () => order().orderNo, () => order().status], reset, {
    flush: 'sync',
  })
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  return { visible, submitting, error, submitted, open, close, confirm }
}
