import axios from 'axios'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { CartQueryError, queryCart } from '@/api/cart'
import { useAuthStore } from '@/stores/auth'
import type { CartItem } from '@/types/cart'
import { cartItemIssue, safeCartAmount } from '@/utils/cart'

/** Query current prices; payment itself remains a local demo action. */
export function useCheckoutPayment(visible: Ref<boolean>, items: () => CartItem[]) {
  const auth = useAuthStore()
  const confirmVisible = ref(false)
  const loading = ref(false)
  const error = ref('')
  const paid = ref(false)
  const quoteItems = ref<CartItem[]>([])
  const totalFen = ref<number | null>(null)
  let controller: AbortController | undefined
  let disposed = false

  function reset() {
    controller?.abort()
    controller = undefined
    confirmVisible.value = false
    loading.value = false
    error.value = ''
    paid.value = false
    quoteItems.value = []
    totalFen.value = null
  }

  async function requestConfirmation() {
    const authorization = auth.getAuthorization()
    if (
      disposed ||
      !authorization ||
      !visible.value ||
      loading.value ||
      paid.value ||
      !items().length
    )
      return
    reset()
    const selected = items().map((item) => ({ ...item }))
    const current = new AbortController()
    controller = current
    confirmVisible.value = true
    loading.value = true
    const isCurrent = () =>
      auth.getAuthorization() === authorization &&
      !disposed &&
      !current.signal.aborted &&
      controller === current &&
      visible.value
    try {
      const latest = await queryCart({ signal: current.signal })
      if (!isCurrent()) return
      const byId = new Map(latest.map((item) => [item.cartItemId, item]))
      const quoted = selected.map((item) => {
        const fresh = byId.get(item.cartItemId)
        if (!fresh || fresh.productId !== item.productId || fresh.quantity !== item.quantity)
          throw new Error('购物车商品或数量已变化，请刷新购物车后重试')
        const issue = cartItemIssue(fresh)
        if (issue) throw new Error(`${fresh.name ?? '所选商品'}：${issue}，请刷新购物车后重试`)
        return fresh
      })
      const amount = safeCartAmount(
        quoted.reduce((sum, item) => sum + BigInt(item.priceFen!) * BigInt(item.quantity), 0n),
      )
      if (amount === null) throw new Error('所选金额超出可计算范围，请减少勾选商品')
      quoteItems.value = quoted
      totalFen.value = amount
    } catch (cause) {
      if (!isCurrent() || axios.isCancel(cause)) return
      if (cause instanceof CartQueryError) {
        error.value =
          cause.kind === 'login-required'
            ? '请重新登录后查询价格'
            : cause.kind === 'forbidden'
              ? '暂无权限查询商品价格'
              : '商品价格服务暂未开放，请稍后重试'
      } else {
        error.value = axios.isAxiosError(cause)
          ? '价格查询失败，请检查网络后重试'
          : cause instanceof Error
            ? cause.message
            : '价格查询失败，请稍后重试'
      }
    } finally {
      if (controller === current) {
        controller = undefined
        loading.value = false
      }
    }
  }

  function confirm() {
    if (
      !auth.getAuthorization() ||
      disposed ||
      !visible.value ||
      !confirmVisible.value ||
      loading.value ||
      error.value ||
      totalFen.value === null ||
      paid.value
    )
      return
    paid.value = true
    confirmVisible.value = false
  }

  watch([visible, () => auth.accessToken, () => JSON.stringify(items())], reset, { flush: 'sync' })
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  return {
    confirmVisible,
    loading,
    error,
    paid,
    quoteItems,
    totalFen,
    requestConfirmation,
    cancel: reset,
    confirm,
  }
}
