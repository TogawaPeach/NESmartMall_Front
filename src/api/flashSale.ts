import axios from 'axios'
import { http } from './http'
import { adaptProductDetail } from './productDetail'
import { flashSaleContract, flashSaleDemoEnabled } from './flashSaleContract'
import { parseFlashSaleTime } from '@/utils/flashSaleTime'
import type { FieldPath } from './productContract'
import type {
  FlashSaleCard,
  FlashSaleDetail,
  FlashSaleLoadState,
  FlashSaleResult,
  FlashSaleWindow,
} from '@/types/flashSale'

export class FlashSaleError extends Error {
  constructor(public readonly kind: Exclude<FlashSaleLoadState, 'loading' | 'success' | 'empty'>) {
    super(kind)
    this.name = 'FlashSaleError'
  }
}

function record(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new FlashSaleError('error')
  return value as Record<string, unknown>
}

function at(value: unknown, path: FieldPath): unknown {
  return path.reduce<unknown>((current, key) => record(current)[key], value)
}

function rejectStatus(status: unknown): never {
  if (status === 401) throw new FlashSaleError('login-required')
  if (status === 403) throw new FlashSaleError('forbidden')
  if (status === 404) throw new FlashSaleError('unavailable')
  throw new FlashSaleError('error')
}

function readId(value: unknown): string {
  // BIGINT JSON numbers cannot reliably preserve identifiers; require a string.
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) throw new FlashSaleError('error')
  return value
}

function readPrice(value: unknown): number | null {
  if (value === null) return null
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 0) {
    throw new FlashSaleError('error')
  }
  return value
}

function readName(value: unknown): string {
  if (typeof value !== 'string' || !value.trim()) throw new FlashSaleError('error')
  return value.trim()
}

function readCover(value: unknown): string | null {
  if (typeof value !== 'string' || !value.trim()) return null
  try {
    const url = new URL(value.trim())
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.href
  } catch {
    /* Missing or unusable covers use the image placeholder. */
  }
  return null
}

function readWindow(data: Record<string, unknown>): FlashSaleWindow {
  const fields = flashSaleContract.fields
  return {
    startsAtMs: parseFlashSaleTime(data[fields.startsAt]),
    endsAtMs: parseFlashSaleTime(data[fields.endsAt]),
  }
}

function readCard(value: unknown): FlashSaleCard {
  const data = record(value)
  const f = flashSaleContract.fields
  return {
    id: readId(data[f.id]),
    name: readName(data[f.name]),
    model: typeof data[f.model] === 'string' ? (data[f.model] as string).trim() || null : null,
    imageUrl: readCover(data[f.coverUrl]),
    priceFen: readPrice(data[f.price]),
    ...readWindow(data),
  }
}

async function request(kind: 'list' | 'detail', signal?: AbortSignal, id?: string) {
  const entry = flashSaleContract[kind]
  if (!entry.confirmed || !entry.endpoint) throw new FlashSaleError('unconfigured')
  // Constrain requests to the shared API/Bearer trust boundary. No ordinary fallback.
  const endpoint = entry.endpoint
  if (
    !endpoint.startsWith('/api/') ||
    endpoint.includes('?') ||
    endpoint.includes('#') ||
    (kind === 'detail' && endpoint.split('{id}').length !== 2) ||
    (kind === 'list' && endpoint.includes('{id}'))
  )
    throw new FlashSaleError('unconfigured')
  const path = kind === 'detail' ? endpoint.replace('{id}', encodeURIComponent(id!)) : endpoint
  try {
    const response = await http.get<unknown>(path, { signal })
    const body = response.data
    const code = at(body, flashSaleContract.response.codePath)
    if (code !== flashSaleContract.response.successCode) rejectStatus(code)
    const time = flashSaleContract.time
    let clockOffsetMs = 0
    if (time.clock === 'response-field') {
      if (!time.serverTimePath) throw new FlashSaleError('unconfigured')
      const serverTime = parseFlashSaleTime(at(body, time.serverTimePath))
      if (serverTime === null) throw new FlashSaleError('error')
      clockOffsetMs = serverTime - Date.now()
    }
    return { data: at(body, entry.dataPath), clockOffsetMs }
  } catch (error: unknown) {
    if (axios.isAxiosError(error) && error.response) rejectStatus(error.response.status)
    throw error
  }
}

export async function queryFlashSaleList(
  options: { signal?: AbortSignal } = {},
): Promise<FlashSaleResult<FlashSaleCard[]>> {
  if (import.meta.env.DEV && flashSaleDemoEnabled) {
    const { getFlashSaleDemo } = await import('./flashSaleDemo')
    return { data: getFlashSaleDemo(), clockOffsetMs: 0 }
  }
  const result = await request('list', options.signal)
  if (!Array.isArray(result.data)) throw new FlashSaleError('error')
  const data = result.data.map(readCard)
  if (new Set(data.map((item) => item.id)).size !== data.length) throw new FlashSaleError('error')
  return { ...result, data }
}

export async function queryFlashSaleDetail(
  productId: string,
  options: { signal?: AbortSignal } = {},
): Promise<FlashSaleResult<FlashSaleDetail>> {
  const id = readId(productId)
  if (import.meta.env.DEV && flashSaleDemoEnabled) {
    const { getFlashSaleDemo } = await import('./flashSaleDemo')
    const data = getFlashSaleDemo().find((item) => item.id === id)
    if (!data) throw new FlashSaleError('unavailable')
    return { data, clockOffsetMs: 0 }
  }
  const result = await request('detail', options.signal, id)
  const data = record(result.data)
  const f = flashSaleContract.fields
  if (readId(data[f.id]) !== id) throw new FlashSaleError('error')
  return {
    clockOffsetMs: result.clockOffsetMs,
    data: {
      ...adaptProductDetail(
        {
          id: data[f.id],
          name: data[f.name],
          model: data[f.model],
          coverUrl: readCover(data[f.coverUrl]),
          price: data[f.price],
          sales: data[f.sales],
          stock: data[f.stock],
          detailImages: data[f.detailImages],
        },
        id,
      ),
      ...readWindow(data),
    },
  }
}
