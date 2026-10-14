import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { isAuthUser, login } from '@/api/auth'
import type { AuthSession, LoginCredentials } from '@/types/auth'

const SESSION_KEY = 'nesmartmall.auth'

function saveSession(session: AuthSession | null) {
  try {
    if (session) sessionStorage.setItem(SESSION_KEY, JSON.stringify(session))
    else sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Login remains available in memory when browser storage is disabled.
  }
}

function restoreSession(): AuthSession | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    if (!raw) return null
    const value: unknown = JSON.parse(raw)
    if (typeof value === 'object' && value !== null) {
      const session = value as Partial<AuthSession>
      if (
        typeof session.accessToken === 'string' &&
        !!session.accessToken &&
        !/\s/.test(session.accessToken) &&
        session.tokenType === 'Bearer' &&
        typeof session.expiresAt === 'number' &&
        Number.isSafeInteger(session.expiresAt) &&
        session.expiresAt > Date.now() &&
        isAuthUser(session.user)
      ) {
        return {
          accessToken: session.accessToken,
          tokenType: 'Bearer',
          expiresAt: session.expiresAt,
          user: {
            id: session.user.id,
            account: session.user.account,
            nickname: session.user.nickname,
            role: session.user.role,
          },
        }
      }
    }
  } catch {
    // Invalid/disabled storage should never block the storefront.
  }
  saveSession(null)
  return null
}

export const useAuthStore = defineStore('auth', () => {
  const session = ref<AuthSession | null>(restoreSession())
  const isAuthenticated = computed(() => session.value !== null)
  const user = computed(() => session.value?.user ?? null)
  const accessToken = computed(() => session.value?.accessToken ?? null)
  const displayName = computed(
    () => user.value?.nickname.trim() || user.value?.account || '用户入口',
  )
  let version = 0
  let expiryTimer: ReturnType<typeof setTimeout> | undefined

  function logout() {
    version++
    session.value = null
    saveSession(null)
  }

  function getAuthorization(): string | null {
    if (session.value && session.value.expiresAt <= Date.now()) logout()
    return session.value ? `Bearer ${session.value.accessToken}` : null
  }

  async function signIn(credentials: LoginCredentials, options: { signal?: AbortSignal } = {}) {
    const requestVersion = ++version
    const data = await login(credentials, options)
    if (requestVersion !== version || options.signal?.aborted) return false
    session.value = {
      accessToken: data.accessToken,
      tokenType: data.tokenType,
      expiresAt: Date.now() + data.expiresIn * 1000,
      user: data.user,
    }
    saveSession(session.value)
    return true
  }

  function scheduleExpiry() {
    clearTimeout(expiryTimer)
    if (!session.value) return
    const remaining = session.value.expiresAt - Date.now()
    if (remaining <= 0) {
      logout()
      return
    }
    expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2_147_483_647))
  }
  watch(session, scheduleExpiry, { immediate: true, flush: 'sync' })
  onScopeDispose(() => clearTimeout(expiryTimer))

  return { isAuthenticated, user, accessToken, displayName, signIn, logout, getAuthorization }
})
