import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { isAuthUser, login } from '@/api/auth'
import type { AuthSession, LoginCredentials } from '@/types/auth'

const SESSION_KEY = 'nesmartmall.auth'
const REVISION_KEY = 'nesmartmall.auth.revision'

interface SharedSession {
  session: AuthSession | null
  raw: string | null
  revision: string | null
}

function snapshot(shared: SharedSession): string {
  return JSON.stringify([shared.raw, shared.revision])
}

function saveSession(session: AuthSession | null): SharedSession | undefined {
  const raw = session ? JSON.stringify(session) : null
  try {
    if (raw) localStorage.setItem(SESSION_KEY, raw)
    else localStorage.removeItem(SESSION_KEY)
  } catch {
    // Login remains available in memory when browser storage is disabled.
    return undefined
  }
  let revision: string | null = `${Date.now()}-${Math.random()}`
  try {
    // Remember changes even when login followed by logout returns to an empty session.
    // The marker also prevents another tab's legacy session from undoing logout.
    localStorage.setItem(REVISION_KEY, revision)
  } catch {
    // Metadata failure must not prevent clearing the actual token.
    try {
      revision = localStorage.getItem(REVISION_KEY)
    } catch {
      revision = null
    }
  }
  // Record our own write, never a later value another tab wrote before a readback.
  return { session, raw, revision }
}

function parseSession(raw: string | null): AuthSession | null {
  if (!raw) return null
  try {
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
    // Invalid storage should never block the storefront.
  }
  return null
}

function restoreSession(): SharedSession | undefined {
  try {
    const raw = localStorage.getItem(SESSION_KEY)
    const session = parseSession(raw)
    return { session, raw, revision: localStorage.getItem(REVISION_KEY) }
  } catch {
    // Undefined distinguishes inaccessible storage from an anonymous session.
    return undefined
  }
}

export const useAuthStore = defineStore('auth', () => {
  let shared = restoreSession()
  if (shared?.raw && !shared.session) shared = saveSession(null) ?? shared
  let initialSession = shared?.session ?? null
  try {
    // Preserve valid logins from the previous per-tab storage implementation.
    const legacySession = parseSession(sessionStorage.getItem(SESSION_KEY))
    if (shared && !initialSession && legacySession && !shared.revision) {
      initialSession = legacySession
      shared = saveSession(legacySession) ?? shared
    }
    sessionStorage.removeItem(SESSION_KEY)
  } catch {
    // Legacy storage is optional and must not prevent a new login.
  }
  let sharedSnapshot = shared && snapshot(shared)
  const session = ref<AuthSession | null>(initialSession ?? null)
  const isAuthenticated = computed(() => session.value !== null)
  const user = computed(() => session.value?.user ?? null)
  const accessToken = computed(() => session.value?.accessToken ?? null)
  const displayName = computed(
    () => user.value?.nickname.trim() || user.value?.account || '用户入口',
  )
  let version = 0
  let expiryTimer: ReturnType<typeof setTimeout> | undefined

  function synchronizeSession() {
    const shared = restoreSession()
    if (!shared) return
    const latestSnapshot = snapshot(shared)
    // Keep an unsaved memory login while storage is unchanged, and keep checking
    // for another tab's changes even after a read/write failure.
    if (latestSnapshot === sharedSnapshot) return
    if (sharedSnapshot === undefined && !shared.session) {
      sharedSnapshot = latestSnapshot
      return
    }
    sharedSnapshot = latestSnapshot
    // Another tab's login/logout supersedes pending logins. Expiry alone does not.
    if (shared.session || !session.value || session.value.expiresAt > Date.now()) version++
    session.value = shared.session
  }

  function persistSession() {
    const saved = saveSession(session.value)
    if (saved) sharedSnapshot = snapshot(saved)
  }

  function clearSession() {
    session.value = null
    // Removal may still work when a quota error prevented saving a newer login.
    persistSession()
  }

  function logout() {
    version++
    clearSession()
  }

  function getAuthorization(): string | null {
    // Storage events are asynchronous; requests and 401 handling need the latest token now.
    synchronizeSession()
    // Expiry of the previous session must not cancel a pending new login.
    if (session.value && session.value.expiresAt <= Date.now()) clearSession()
    return session.value ? `Bearer ${session.value.accessToken}` : null
  }

  async function signIn(credentials: LoginCredentials, options: { signal?: AbortSignal } = {}) {
    synchronizeSession()
    const requestVersion = ++version
    const data = await login(credentials, options)
    synchronizeSession()
    if (requestVersion !== version || options.signal?.aborted) return false
    session.value = {
      accessToken: data.accessToken,
      tokenType: data.tokenType,
      expiresAt: Date.now() + data.expiresIn * 1000,
      user: data.user,
    }
    persistSession()
    return true
  }

  function scheduleExpiry() {
    clearTimeout(expiryTimer)
    if (!session.value) return
    const remaining = session.value.expiresAt - Date.now()
    if (remaining <= 0) {
      // A different tab may have renewed the session before this timer ran.
      synchronizeSession()
      if (session.value && session.value.expiresAt <= Date.now()) clearSession()
      return
    }
    expiryTimer = setTimeout(scheduleExpiry, Math.min(remaining, 2_147_483_647))
  }
  function onStorage(event: StorageEvent) {
    if (event.key !== SESSION_KEY && event.key !== REVISION_KEY && event.key !== null) return
    try {
      if (event.storageArea !== localStorage) return
    } catch {
      return
    }
    // Read current storage rather than replaying potentially delayed event.newValue.
    synchronizeSession()
  }
  window.addEventListener('storage', onStorage)
  watch(session, scheduleExpiry, { immediate: true, flush: 'sync' })
  onScopeDispose(() => {
    clearTimeout(expiryTimer)
    window.removeEventListener('storage', onStorage)
  })

  return { isAuthenticated, user, accessToken, displayName, signIn, logout, getAuthorization }
})
