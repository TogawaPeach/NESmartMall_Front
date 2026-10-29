import axios from 'axios'
import { http } from './http'
import type { CustomerServiceEntry, TransferHumanActionPayload } from '@/types/customerService'

type TicketErrorKind =
  'login-required' | 'forbidden' | 'expired' | 'timeout' | 'protocol' | 'unavailable'

export class TransferHumanSubmissionError extends Error {
  constructor(public readonly kind: TicketErrorKind = 'unavailable') {
    super(
      {
        'login-required': '登录已失效，请重新登录后提交。',
        forbidden: '当前账号无权提交人工服务申请。',
        expired: '入口已过期或不可用，请重新提出人工服务请求。',
        timeout: '请求超时，暂未确认提交结果，请使用此按钮重试。',
        protocol: '未收到有效提交结果，请稍后使用此按钮重试。',
        unavailable: '暂未确认提交结果，请稍后使用此按钮重试。',
      }[kind],
    )
  }
}

function ticketError(code: unknown): TransferHumanSubmissionError {
  return new TransferHumanSubmissionError(
    code === 401
      ? 'login-required'
      : code === 403
        ? 'forbidden'
        : code === 410
          ? 'expired'
          : 'unavailable',
  )
}

export async function submitTransferHumanTicket(
  actionId: string,
  options: {
    signal: AbortSignal
    expectedAuthorization: string
  },
): Promise<{ ticketNo: string; message: string }> {
  try {
    const response = await http.post<{
      code?: unknown
      data?: { ticketNo?: unknown; message?: unknown }
    } | null>(
      '/api/support/tickets',
      { actionId },
      {
        ...options,
        timeout: 130_000,
        headers: { 'Content-Type': 'application/json' },
      },
    )
    if (response.data?.code !== 200) throw ticketError(response.data?.code)
    const data = response.data.data
    if (
      typeof data?.ticketNo !== 'string' ||
      !data.ticketNo.trim() ||
      typeof data.message !== 'string' ||
      !data.message.trim()
    ) {
      throw new TransferHumanSubmissionError('protocol')
    }
    // Preserve both the string identifier and the backend's Demo explanation.
    return { ticketNo: data.ticketNo, message: data.message }
  } catch (error) {
    if (error instanceof TransferHumanSubmissionError) throw error
    if (axios.isCancel(error)) throw error
    if (axios.isAxiosError(error)) {
      if (error.response) throw ticketError(error.response.status)
      if (error.code === 'ECONNABORTED' || error.code === 'ETIMEDOUT') {
        throw new TransferHumanSubmissionError('timeout')
      }
    }
    throw new TransferHumanSubmissionError('unavailable')
  }
}

export class CustomerServiceError extends Error {
  constructor(
    public readonly kind:
      | 'login-required'
      | 'forbidden'
      | 'timeout'
      | 'protocol'
      | 'interrupted'
      | 'unavailable' = 'unavailable',
  ) {
    super(
      {
        'login-required': '登录已失效，请重新登录后发送。',
        forbidden: '当前账号暂时无法使用咨询服务。',
        timeout: '等待回答超时，请稍后重新发送。',
        protocol: '咨询服务返回了无法识别的响应，请稍后重新发送。',
        interrupted: '回答中断，已保留收到的内容，请重新发送。',
        unavailable: '暂时无法连接咨询服务，请稍后重新发送。',
      }[kind],
    )
  }
}

interface StreamOptions {
  signal?: AbortSignal
  expectedAuthorization: string
  onDelta: (text: string) => void
  onAction?: (action: TransferHumanActionPayload) => void
}
const endpoints: Record<CustomerServiceEntry, string> = {
  guide: '/api/guide/turns/stream',
  support: '/api/support/turns/stream',
}

/** One POST, no retry or history. Reuses the shared session and API trust boundary. */
export async function streamCustomerServiceTurn(
  entry: CustomerServiceEntry,
  text: string,
  options: StreamOptions,
): Promise<void> {
  const controller = new AbortController()
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let timedOut = false
  const abort = () => controller.abort()
  const cancelReader = () => {
    void reader?.cancel().catch(() => {})
  }
  const resetTimeout = () => {
    clearTimeout(timer)
    timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, 60_000)
  }
  options.signal?.addEventListener('abort', abort, { once: true })
  controller.signal.addEventListener('abort', cancelReader, { once: true })
  if (options.signal?.aborted) abort()
  resetTimeout()
  try {
    const response = await http.post<ReadableStream<Uint8Array>>(
      endpoints[entry],
      { text },
      {
        adapter: 'fetch',
        responseType: 'stream',
        timeout: 0,
        signal: controller.signal,
        expectedAuthorization: options.expectedAuthorization,
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      },
    )
    if (!response.data?.getReader) throw new CustomerServiceError('protocol')
    reader = response.data.getReader()
    controller.signal.throwIfAborted()
    const decoder = new TextDecoder('utf-8', { fatal: true })
    const read = async () => {
      controller.signal.throwIfAborted()
      const chunk = await reader!.read()
      controller.signal.throwIfAborted()
      resetTimeout()
      return chunk
    }
    if (!/^text\/event-stream(?:\s*;|\s*$)/i.test(String(response.headers['content-type']))) {
      // Gateway may return a JSON business error with HTTP 200.
      let body = ''
      while (body.length < 65_536) {
        const chunk = await read()
        body += decoder.decode(chunk.value, { stream: !chunk.done })
        if (chunk.done) break
      }
      let code: unknown
      try {
        code = JSON.parse(body)?.code
      } catch {
        /* Not a business envelope. */
      }
      throw new CustomerServiceError(
        code === 401 ? 'login-required' : code === 403 ? 'forbidden' : 'protocol',
      )
    }

    let buffer = ''
    let data: string[] = []
    let eventSize = 0
    const dispatch = () => {
      if (!data.length) return false
      let event: {
        type?: unknown
        payload?: { text?: unknown; kind?: unknown; label?: unknown; actionId?: unknown }
      } | null
      try {
        event = JSON.parse(data.join('\n'))
      } catch {
        throw new CustomerServiceError('protocol')
      }
      data = []
      eventSize = 0
      if (event?.type === 'done') return true
      if (event?.type === 'error') throw new CustomerServiceError('interrupted')
      if (event?.type === 'action') {
        const payload = event.payload
        if (
          payload?.kind !== 'transfer_human' ||
          typeof payload.label !== 'string' ||
          !payload.label.trim() ||
          typeof payload.actionId !== 'string' ||
          !payload.actionId.trim()
        ) {
          throw new CustomerServiceError('protocol')
        }
        options.onAction?.({
          kind: 'transfer_human',
          label: payload.label,
          actionId: payload.actionId,
        })
        return false
      }
      if (event?.type !== 'delta' || typeof event.payload?.text !== 'string') {
        throw new CustomerServiceError('protocol')
      }
      options.onDelta(event.payload.text)
      return false
    }
    while (true) {
      const chunk = await read()
      buffer += decoder.decode(chunk.value, { stream: !chunk.done })
      let position: number
      while ((position = buffer.search(/[\r\n]/)) !== -1) {
        // A CR at a network boundary may be the first half of CRLF.
        if (buffer[position] === '\r' && position === buffer.length - 1 && !chunk.done) break
        const line = buffer.slice(0, position)
        const separator = buffer[position] === '\r' && buffer[position + 1] === '\n' ? 2 : 1
        buffer = buffer.slice(position + separator)
        if (line === '') {
          if (dispatch()) return
        } else if (line.startsWith('data:')) {
          const value = line.slice(5).replace(/^ /, '')
          data.push(value)
          eventSize += value.length
        }
        if (eventSize > 1_000_000) throw new CustomerServiceError('protocol')
      }
      if (buffer.length + eventSize > 1_000_000) throw new CustomerServiceError('protocol')
      if (chunk.done) throw new CustomerServiceError('interrupted')
    }
  } catch (error) {
    if (timedOut) throw new CustomerServiceError('timeout')
    if (error instanceof CustomerServiceError) throw error
    if (axios.isAxiosError(error)) {
      // Error bodies are streams too; release them even when Axios rejects headers.
      const body = error.response?.data
      if (body instanceof ReadableStream) void body.cancel().catch(() => {})
      if (error.response?.status === 401) throw new CustomerServiceError('login-required')
      if (error.response?.status === 403) throw new CustomerServiceError('forbidden')
    }
    // A shared HTTP 401 logout may itself abort the caller's signal. Keep its classification.
    if (options.signal?.aborted || axios.isCancel(error)) throw error
    throw new CustomerServiceError()
  } finally {
    clearTimeout(timer)
    options.signal?.removeEventListener('abort', abort)
    controller.signal.removeEventListener('abort', cancelReader)
    controller.abort()
    if (reader) {
      void reader.cancel().catch(() => {})
      reader.releaseLock()
    }
  }
}
