import axios from 'axios'

/** Same-origin by default; Vite proxies /api to localhost:8082 in development. */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim() || undefined,
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})
