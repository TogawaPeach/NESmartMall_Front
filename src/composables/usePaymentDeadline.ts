import { computed, onMounted, onScopeDispose, ref, watch } from 'vue'
import type { OrderSummary } from '@/types/order'

export function usePaymentDeadline(source: () => OrderSummary | null) {
  const elapsed = ref(0)
  let anchor = performance.now()
  watch(
    source,
    () => {
      anchor = performance.now()
      elapsed.value = 0
    },
    { flush: 'sync' },
  )
  const remainingMs = computed(() => {
    const order = source()
    if (!order?.payExpireAt || !order.serverTime) return null
    return Math.max(0, Date.parse(order.payExpireAt) - Date.parse(order.serverTime) - elapsed.value)
  })
  let timer: ReturnType<typeof setInterval> | undefined
  onMounted(() => {
    timer = setInterval(() => {
      elapsed.value = Math.max(0, performance.now() - anchor)
    }, 1000)
  })
  onScopeDispose(() => clearInterval(timer))
  const notice = computed(() => {
    const order = source()
    if (!order || order.status !== 'PENDING_PAYMENT') return ''
    if (remainingMs.value === 0 || order.displayStatus === 'PAYMENT_EXPIRED')
      return '支付已超时，订单关闭处理中'
    if (remainingMs.value === null || order.canPay !== true) return '付款信息暂未就绪，请刷新订单'
    const seconds = Math.ceil(remainingMs.value / 1000)
    return `剩余支付时间 ${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  })
  return { remainingMs, notice }
}
