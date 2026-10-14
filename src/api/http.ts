import axios, {
  type AxiosRequestConfig,
  type AxiosResponse,
  type InternalAxiosRequestConfig,
} from 'axios'

const apiBaseURL = import.meta.env.VITE_API_BASE_URL?.trim() || undefined

/** Same-origin by default; Vite proxies /api to localhost:8080 in development. */
export const http = axios.create({
  baseURL: apiBaseURL,
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

interface AuthState {
  getAuthorization: () => string | null
  logout: () => void
}

let requestInterceptor: number | undefined
let responseInterceptor: number | undefined

function backendRequest(config: AxiosRequestConfig): { isAuthEntry: boolean } | null {
  try {
    const pageURL = window.location.href
    // Use Axios's URL joining rules, including per-request baseURL overrides.
    const target = new URL(http.getUri({ ...config, params: undefined }), pageURL)
    if (!/^https?:$/.test(target.protocol)) return null

    const bases = [new URL('/api', pageURL)]
    if (apiBaseURL) bases.push(new URL(apiBaseURL, pageURL))
    const trusted = bases.some((base) => {
      const path = base.pathname.replace(/\/+$/, '')
      return (
        target.origin === base.origin &&
        (target.pathname === path || target.pathname.startsWith(`${path}/`))
      )
    })
    if (!trusted) return null

    const authURLs = []
    for (const url of ['/api/auth/login', '/api/auth/register']) {
      authURLs.push(new URL(url, pageURL))
      if (apiBaseURL) authURLs.push(new URL(http.getUri({ baseURL: apiBaseURL, url }), pageURL))
    }
    return {
      isAuthEntry:
        config.method?.toLowerCase() === 'post' &&
        authURLs.some(
          (entry) => target.origin === entry.origin && target.pathname === entry.pathname,
        ),
    }
  } catch {
    // Unresolvable destinations must never receive session credentials.
    return null
  }
}

function isUnauthorizedResponse(response: AxiosResponse<{ code?: unknown }>): boolean {
  return (
    response.status === 401 ||
    (response.status !== 403 && response.status < 500 && response.data?.code === 401)
  )
}

export function configureAuth(auth: AuthState) {
  if (requestInterceptor !== undefined) http.interceptors.request.eject(requestInterceptor)
  if (responseInterceptor !== undefined) http.interceptors.response.eject(responseInterceptor)
  const requests = new WeakMap<
    InternalAxiosRequestConfig,
    { authorization: string | null; isAuthEntry: boolean }
  >()
  requestInterceptor = http.interceptors.request.use((config) => {
    const backend = backendRequest(config)
    const authorization = backend ? auth.getAuthorization() : null
    // This layer owns Authorization; discard stale/default/manual headers too.
    config.headers.delete('Authorization')
    if (authorization) config.headers.set('Authorization', authorization)
    requests.set(config, { authorization, isAuthEntry: backend?.isAuthEntry ?? false })
    return config
  })

  function clearRejectedSession(config: InternalAxiosRequestConfig | undefined) {
    const request = config && requests.get(config)
    if (
      request?.authorization &&
      !request.isAuthEntry &&
      request.authorization === auth.getAuthorization()
    ) {
      auth.logout()
    }
  }
  responseInterceptor = http.interceptors.response.use(
    (response) => {
      if (isUnauthorizedResponse(response)) clearRejectedSession(response.config)
      return response
    },
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response && isUnauthorizedResponse(error.response)) {
        clearRejectedSession(error.config)
      }
      return Promise.reject(error)
    },
  )
}
