import { watch } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useLoginPromptStore } from '@/stores/loginPrompt'

/** Resume this entry only while its login dialog is still active. */
export function useOrderEntry() {
  const router = useRouter(),
    auth = useAuthStore(),
    prompt = useLoginPromptStore()
  let pending = false
  function openOrders() {
    if (auth.getAuthorization()) {
      void router.push({ name: 'orders' })
      return
    }
    pending = true
    prompt.openLogin('登录后即可查看我的订单')
  }
  watch(
    () => auth.accessToken,
    () => {
      if (pending && auth.getAuthorization()) {
        pending = false
        void router.push({ name: 'orders' })
      }
    },
    { flush: 'sync' },
  )
  watch(
    () => prompt.visible,
    (visible) => {
      if (!visible) pending = false
    },
    { flush: 'sync' },
  )
  return { openOrders }
}
