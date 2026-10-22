import type { FlashSaleStatus, FlashSaleWindow } from '@/types/flashSale'

/** Timezone-less activity timestamps are Beijing time, regardless of the device timezone. */
export function parseFlashSaleTime(value: unknown): number | null {
  if (typeof value !== 'string') return null
  const match =
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,3}))?(Z|[+-]\d{2}:\d{2})?$/.exec(
      value,
    )
  if (!match) return null
  const [, year, month, day, hour, minute, second, , offset] = match
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  const days = new Date(Date.UTC(y, m, 0)).getUTCDate()
  if (
    y < 1000 ||
    m < 1 ||
    m > 12 ||
    d < 1 ||
    d > days ||
    Number(hour) > 23 ||
    Number(minute) > 59 ||
    Number(second) > 59
  )
    return null
  if (offset && offset !== 'Z') {
    const h = Number(offset.slice(1, 3))
    const min = Number(offset.slice(4, 6))
    if (h > 14 || min > 59 || (h === 14 && min !== 0)) return null
  }
  const timestamp = Date.parse(value.replace(' ', 'T') + (offset ? '' : '+08:00'))
  return Number.isFinite(timestamp) ? timestamp : null
}

export function getFlashSaleStatus(window: FlashSaleWindow, now: number): FlashSaleStatus {
  const { startsAtMs, endsAtMs } = window
  if (
    startsAtMs === null ||
    endsAtMs === null ||
    !Number.isFinite(startsAtMs) ||
    !Number.isFinite(endsAtMs) ||
    endsAtMs <= startsAtMs ||
    !Number.isFinite(now)
  )
    return 'invalid'
  if (now < startsAtMs) return 'upcoming'
  return now < endsAtMs ? 'active' : 'ended'
}

export function formatFlashSaleCountdown(remainingMs: number): string {
  const total = Math.max(0, Math.ceil(remainingMs / 1000))
  const days = Math.floor(total / 86400)
  const hours = String(Math.floor(total / 3600) % 24).padStart(2, '0')
  const minutes = String(Math.floor(total / 60) % 60).padStart(2, '0')
  const seconds = String(total % 60).padStart(2, '0')
  return `${days ? `${days}天 ` : ''}${hours}:${minutes}:${seconds}`
}
