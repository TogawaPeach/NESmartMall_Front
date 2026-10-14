import axios from 'axios'

/** Same-origin by default; Vite proxies /api to localhost:8080 in development. */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim() || undefined,
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})

interface AuthState {
  getAuthorization: () => string | null
  logout: () => void
}

let requestInterceptor: number | undefined
let responseInterceptor: number | undefined

export function configureAuth(auth: AuthState) {
  if (requestInterceptor !== undefined) http.interceptors.request.eject(requestInterceptor)
  if (responseInterceptor !== undefined) http.interceptors.response.eject(responseInterceptor)
  requestInterceptor = http.interceptors.request.use((config) => {
    // Credentials are the only authentication needed by the login endpoint.
    if (
      config.url !== '/api/auth/login' &&
      !/^https?:\/\//i.test(config.url ?? '') &&
      !config.url?.startsWith('//')
    ) {
      const authorization = auth.getAuthorization()
      if (authorization) config.headers.set('Authorization', authorization)
    }
    return config
  })

  function clearRejectedSession(
    config: { headers?: { get?: (key: string) => unknown } } | undefined,
  ) {
    const authorization = config?.headers?.get?.('Authorization')
    if (authorization && authorization === auth.getAuthorization()) auth.logout()
  }
  responseInterceptor = http.interceptors.response.use(
    (response) => {
      if (response.data?.code === 401) clearRejectedSession(response.config)
      return response
    },
    (error: unknown) => {
      if (axios.isAxiosError(error) && error.response?.status === 401) {
        clearRejectedSession(error.config)
      }
      return Promise.reject(error)
    },
  )
}
