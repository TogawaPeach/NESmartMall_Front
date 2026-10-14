import { ref } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'

export const useLoginPromptStore = defineStore('loginPrompt', () => {
  const auth = useAuthStore()
  const visible = ref(false)
  const reason = ref('')

  function openLogin(message = '') {
    reason.value = message
    visible.value = true
  }

  function requireLogin(message: string): boolean {
    if (auth.getAuthorization()) return true
    openLogin(message)
    return false
  }

  return { visible, reason, openLogin, requireLogin }
})
