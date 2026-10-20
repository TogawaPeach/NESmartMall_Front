import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { defineStore } from 'pinia'
import {
  createOrder,
  CREATE_UNKNOWN_MESSAGE,
  OrderWriteError,
  prepareCreateOrder,
} from '@/api/orders'
import { useAuthStore } from '@/stores/auth'
import { useOrderPayment } from '@/composables/useOrderPayment'
import type { CreateOrderInput, PaymentOrder, OrderRecipient } from '@/types/order'

/** In-memory, account-scoped intent. Dialogs and cart GETs cannot reset transaction facts. */
export const useCheckoutStore = defineStore('checkout', () => {
  const auth = useAuthStore()
  const order = shallowRef<PaymentOrder | null>(null)
  const payment = useOrderPayment(order, { keepConfirmationOnSuccess: true })
  const { confirmVisible } = payment
  const stage = ref<'draft' | 'creating' | 'unknown' | 'created'>('draft')
  const recipient = ref<OrderRecipient>({ name: '', phone: '', address: '' })
  const error = ref('')
  const loading = computed(() => stage.value === 'creating')
  const hasAttempt = computed(() => stage.value !== 'draft')
  let revision = 0
  function resetAccount() {
    revision++
    order.value = null
    confirmVisible.value = false
    stage.value = 'draft'
    recipient.value = { name: '', phone: '', address: '' }
    error.value = ''
  }
  watch(() => auth.accessToken, resetAccount, { flush: 'sync' })
  onScopeDispose(() => {
    revision++
  })

  async function create(items: CreateOrderInput['items']): Promise<boolean> {
    const authorization = auth.getAuthorization()
    if (!authorization || stage.value === 'creating' || stage.value === 'unknown') return false
    if (order.value) {
      confirmVisible.value = true
      return false
    }
    let intent: CreateOrderInput
    try {
      intent = prepareCreateOrder({ items, recipient: recipient.value })
    } catch (cause) {
      error.value = cause instanceof Error ? cause.message : '请检查购买及收货信息'
      return false
    }
    const current = revision
    stage.value = 'creating'
    error.value = ''
    try {
      const result = await createOrder(intent, { expectedAuthorization: authorization })
      if (auth.getAuthorization() !== authorization || revision !== current) return false
      order.value = result
      stage.value = 'created'
      confirmVisible.value = true
      return true
    } catch (cause) {
      if (auth.getAuthorization() !== authorization || revision !== current) return false
      if (cause instanceof OrderWriteError && cause.kind !== 'unknown') {
        stage.value = 'draft'
        error.value = cause.message
      } else {
        stage.value = 'unknown'
        error.value = CREATE_UNKNOWN_MESSAGE
      }
      return false
    }
  }
  function newPurchase() {
    if (
      stage.value !== 'created' ||
      payment.paying.value ||
      payment.querying.value ||
      payment.uncertain.value
    )
      return
    payment.reset()
    stage.value = 'draft'
    error.value = ''
  }
  return {
    order,
    stage,
    recipient,
    error,
    loading,
    hasAttempt,
    confirmVisible,
    cancel: payment.cancel,
    confirm: payment.confirm,
    refreshPayment: payment.refresh,
    paying: payment.paying,
    querying: payment.querying,
    paid: payment.paid,
    canPay: payment.canPay,
    uncertain: payment.uncertain,
    paymentError: payment.paymentError,
    paymentNotice: payment.paymentNotice,
    create,
    newPurchase,
  }
})
