import axios from 'axios'
import { computed, onBeforeUnmount, onMounted, ref, watch, type Ref } from 'vue'
import {
  FlashSaleOrderError,
  prepareFlashSaleOrder,
  submitFlashSaleOrder,
} from '@/api/flashSaleOrder'
import { flashSaleContract, flashSaleDemoEnabled } from '@/api/flashSaleContract'
import { useAuthStore } from '@/stores/auth'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import type { FlashSaleWindow } from '@/types/flashSale'
import type { ProductDetail } from '@/types/product'
import { getFlashSaleStatus } from '@/utils/flashSaleTime'

export function useFlashSalePurchase(
  product: Ref<ProductDetail | null>,
  saleWindow: Ref<FlashSaleWindow | null>,
  clockOffsetMs: Ref<number>,
) {
  const auth = useAuthStore()
  const loginPrompt = useLoginPromptStore()
  const visible = ref(false)
  const submitting = ref(false)
  const submitted = ref(false)
  const uncertain = ref(false)
  const feedback = ref('')
  const formError = ref('')
  const recipient = ref({ name: '', phone: '', address: '' })
  const now = ref(Date.now())
  let controller: AbortController | undefined
  let clockTimer: ReturnType<typeof setInterval> | undefined
  let disposed = false
  const status = computed(() =>
    saleWindow.value
      ? getFlashSaleStatus(saleWindow.value, now.value + clockOffsetMs.value)
      : 'invalid',
  )
  const canPurchase = computed(
    () =>
      !flashSaleDemoEnabled &&
      !!product.value &&
      product.value.stock > 0 &&
      product.value.priceFen !== null &&
      status.value === 'active' &&
      !submitting.value &&
      !submitted.value &&
      !uncertain.value,
  )
  const buttonText = computed(() => {
    if (submitting.value) return '正在提交…'
    if (submitted.value) return '购买请求已提交'
    if (uncertain.value) return '请先查看订单'
    if (flashSaleDemoEnabled) return '演示商品暂不可购买'
    if (status.value === 'upcoming') return '秒杀尚未开始'
    if (status.value === 'ended') return '秒杀已结束'
    if (status.value === 'invalid') return '活动时间待确认'
    return '立即购买'
  })

  function open() {
    now.value = Date.now()
    if (!canPurchase.value || !loginPrompt.requireLogin('登录后即可购买秒杀商品')) return
    // Checking shared storage may have switched accounts and cleared the product.
    if (!canPurchase.value) return
    feedback.value = ''
    formError.value = ''
    visible.value = true
  }
  function close() {
    if (!submitting.value) visible.value = false
  }
  async function confirm() {
    now.value = Date.now()
    if (disposed || !visible.value || !canPurchase.value) return
    const authorization = auth.getAuthorization()
    if (!authorization) {
      close()
      loginPrompt.openLogin('登录后即可购买秒杀商品')
      return
    }
    if (!visible.value || !canPurchase.value) return
    const productId = product.value!.id
    let intent
    formError.value = ''
    try {
      intent = prepareFlashSaleOrder({ productId, recipient: recipient.value })
    } catch (error) {
      formError.value = error instanceof Error ? error.message : '请填写完整收货信息'
      return
    }
    const current = new AbortController()
    controller = current
    const isCurrent = () =>
      !disposed &&
      controller === current &&
      !current.signal.aborted &&
      product.value?.id === productId &&
      auth.getAuthorization() === authorization
    submitting.value = true
    feedback.value = ''
    try {
      await submitFlashSaleOrder(intent, {
        signal: current.signal,
        expectedAuthorization: authorization,
      })
      // Keep the purchase controls locked for one second without blocking the browser.
      await new Promise<void>((resolve) =>
        setTimeout(resolve, flashSaleContract.order.feedbackDelayMs),
      )
      if (!isCurrent()) return
      submitted.value = true
      visible.value = false
      feedback.value = '购买请求已提交，请稍后去订单详情页支付。'
    } catch (error) {
      if (!isCurrent() || axios.isCancel(error)) return
      uncertain.value = error instanceof FlashSaleOrderError && error.uncertain
      feedback.value =
        error instanceof FlashSaleOrderError ? error.message : '秒杀购买失败，请稍后重试'
      visible.value = false
    } finally {
      if (controller === current) {
        submitting.value = false
        controller = undefined
      }
    }
  }
  function reset() {
    controller?.abort()
    controller = undefined
    visible.value = submitting.value = submitted.value = uncertain.value = false
    feedback.value = ''
    formError.value = ''
    recipient.value = { name: '', phone: '', address: '' }
  }
  watch([product, () => auth.accessToken], reset, { flush: 'sync' })
  onMounted(() => {
    clockTimer = setInterval(() => (now.value = Date.now()), 1_000)
  })
  onBeforeUnmount(() => {
    disposed = true
    clearInterval(clockTimer)
    reset()
  })
  return {
    visible,
    submitting,
    submitted,
    uncertain,
    feedback,
    formError,
    recipient,
    canPurchase,
    buttonText,
    open,
    close,
    confirm,
  }
}
