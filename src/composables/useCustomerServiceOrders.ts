import { computed, onScopeDispose, ref, watch } from 'vue'
import { OrderQueryError, queryOrders } from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import { useCustomerServiceStore } from '@/stores/customerService'
import type { OrderLoadState, OrderSummary } from '@/types/order'

export function useCustomerServiceOrders() {
  const auth = useAuthStore()
  const support = useCustomerServiceStore()
  const orders = ref<OrderSummary[]>([])
  const state = ref<OrderLoadState>('loading')
  const selectedOrderNo = ref('')
  const active = computed(() => support.visible && support.entry === 'support')
  const dismissed = ref(false)
  const showPicker = computed(() => active.value && !dismissed.value)
  let controller: AbortController | undefined
  let sequence = 0

  function reset() {
    ++sequence
    controller?.abort()
    controller = undefined
    orders.value = []
    selectedOrderNo.value = ''
    dismissed.value = false
    state.value = 'loading'
  }

  async function load() {
    reset()
    if (!active.value) return
    const authorization = auth.getAuthorization()
    if (!authorization) {
      state.value = 'login-required'
      return
    }
    if (!active.value) return
    const current = new AbortController()
    controller = current
    const expected = sequence
    const isCurrent = () =>
      auth.getAuthorization() === authorization &&
      expected === sequence &&
      !current.signal.aborted &&
      active.value
    try {
      const result = await queryOrders(
        {},
        {
          signal: current.signal,
          expectedAuthorization: authorization,
        },
      )
      if (!isCurrent()) return
      orders.value = result
      state.value = result.length ? 'success' : 'empty'
    } catch (error) {
      if (!isCurrent()) return
      state.value = error instanceof OrderQueryError ? error.kind : 'error'
    }
  }

  function consultOrder(orderNo: string): boolean {
    if (
      !auth.getAuthorization() ||
      !active.value ||
      support.isReplying ||
      !orders.value.some((order) => order.orderNo === orderNo)
    )
      return false
    const previous = support.draft
    support.draft = `我想咨询${orderNo}订单`
    const sent = support.sendText()
    // sendText may clear the session; never restore another account's draft.
    if (active.value) support.draft = previous
    if (sent) selectedOrderNo.value = orderNo
    return sent
  }

  function dismiss() {
    dismissed.value = true
  }

  watch(
    () =>
      [
        support.entry,
        support.messages.filter((message) => message.sender === 'visitor').at(-1)?.id,
      ] as const,
    ([kind, id], [previousKind, previousId]) => {
      if (
        active.value &&
        kind === 'support' &&
        previousKind === 'support' &&
        id !== undefined &&
        id !== previousId
      )
        dismiss()
    },
    { flush: 'sync' },
  )

  watch(
    () => [active.value, auth.user?.id, auth.user?.role, auth.accessToken],
    () => {
      void load()
    },
    { immediate: true, flush: 'sync' },
  )
  onScopeDispose(reset)
  return { orders, state, selectedOrderNo, showPicker, dismiss, load, consultOrder }
}
