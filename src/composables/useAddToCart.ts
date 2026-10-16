import axios from 'axios'
import { onBeforeUnmount, ref, watch, type Ref } from 'vue'
import { useRoute } from 'vue-router'
import { addCartItem, CartAddError } from '@/api/cart'
import { useAuthStore } from '@/stores/auth'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import type { ProductDetail } from '@/types/product'

export function useAddToCart(product: Ref<ProductDetail | null>) {
  const route = useRoute()
  const auth = useAuthStore()
  const loginPrompt = useLoginPromptStore()
  const adding = ref(false)
  const feedback = ref<{ type: 'error' | 'success'; message: string } | null>(null)
  let controller: AbortController | undefined
  let sequence = 0
  let authVersion = 0
  let pageVersion = 0
  let disposed = false

  function reset() {
    ++sequence
    controller?.abort()
    controller = undefined
    adding.value = false
    feedback.value = null
  }

  async function add() {
    if (adding.value) return
    feedback.value = null
    const currentProduct = product.value
    if (!currentProduct) return
    // Validate before posting, including when a click reaches us for an out-of-stock item.
    if (currentProduct.stock < 1) {
      feedback.value = { type: 'error', message: '库存不足' }
      return
    }
    if (currentProduct.priceFen === null) return
    if (!loginPrompt.requireLogin('登录后即可加入购物车')) return
    const authorization = auth.getAuthorization()
    const requestAuthVersion = authVersion
    const requestPageVersion = pageVersion
    const requestSequence = ++sequence
    const requestController = new AbortController()
    controller = requestController
    adding.value = true
    const isCurrent = () => {
      const currentAuthorization = auth.getAuthorization()
      return (
        requestSequence === sequence &&
        !requestController.signal.aborted &&
        currentAuthorization === authorization &&
        product.value?.id === currentProduct.id
      )
    }
    try {
      await addCartItem(currentProduct.id, 1, { signal: requestController.signal })
      if (isCurrent()) feedback.value = { type: 'success', message: '已加入购物车' }
    } catch (error: unknown) {
      // The shared 401 interceptor clears auth before this catch. Allow that one
      // transition to open login, while rejecting older accounts/pages and unmounts.
      if (
        error instanceof CartAddError &&
        error.loginRequired &&
        !disposed &&
        requestPageVersion === pageVersion &&
        authVersion === requestAuthVersion + 1 &&
        !auth.getAuthorization()
      ) {
        loginPrompt.openLogin('登录后即可加入购物车')
        return
      }
      if (!isCurrent() || axios.isCancel(error)) return
      if (error instanceof CartAddError && error.loginRequired) {
        loginPrompt.openLogin('登录后即可加入购物车')
      }
      feedback.value = {
        type: 'error',
        message: error instanceof CartAddError ? error.message : '加入购物车失败，请稍后重试',
      }
    } finally {
      if (requestSequence === sequence) {
        adding.value = false
        controller = undefined
      }
    }
  }

  watch(
    () => [route.fullPath, product.value?.id, auth.accessToken] as const,
    (current, previous) => {
      if (current[0] !== previous[0]) ++pageVersion
      if (current[2] !== previous[2]) ++authVersion
      reset()
    },
    { flush: 'sync' },
  )
  onBeforeUnmount(() => {
    disposed = true
    reset()
  })
  return { adding, feedback, add }
}
