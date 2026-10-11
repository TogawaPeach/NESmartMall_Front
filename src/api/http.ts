import axios from 'axios'

/** Empty baseURL explicitly uses the deployment's origin; no host is assumed. */
export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL?.trim() || undefined,
  timeout: 10_000,
  headers: { Accept: 'application/json' },
})
