import { computed, onScopeDispose, reactive, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import { useLoginPromptStore } from './loginPrompt'
import {
  CustomerServiceError,
  streamCustomerServiceTurn,
  submitTransferHumanTicket,
  TransferHumanSubmissionError,
} from '@/api/customerService'
import {
  CUSTOMER_SERVICE_TEXT_LIMIT,
  customerServiceQuestions,
  customerServiceWelcome,
} from '@/constants/customerService'
import type {
  CustomerServiceEntry,
  CustomerServiceMessage,
  SupportContext,
} from '@/types/customerService'

interface Conversation {
  draft: string
  error: string
  unreadCount: number
  pendingContext: SupportContext | null
  messages: CustomerServiceMessage[]
  isReplying: boolean
}

function findTransferHumanAction(conversation: Conversation, actionId: string) {
  for (const message of conversation.messages) {
    if (message.sender !== 'service' || message.kind !== 'text') continue
    const action = message.actions?.find((item) => item.actionId === actionId)
    if (action) return { message, action }
  }
}

export const useCustomerServiceStore = defineStore('customerService', () => {
  const auth = useAuthStore()
  const loginPrompt = useLoginPromptStore()
  const visible = ref(false)
  const entry = ref<CustomerServiceEntry>('guide')
  let nextId = 0
  let generation = 0
  const controllers = new Map<CustomerServiceEntry, AbortController>()
  const actionControllers = new Map<string, AbortController>()
  const createConversation = (kind: CustomerServiceEntry): Conversation => ({
    draft: '',
    error: '',
    unreadCount: 0,
    pendingContext: null,
    isReplying: false,
    messages: [
      {
        id: ++nextId,
        sender: 'service',
        createdAt: Date.now(),
        kind: 'text',
        text: customerServiceWelcome[kind],
      },
    ],
  })
  const conversations = reactive({
    guide: createConversation('guide'),
    support: createConversation('support'),
  })
  const current = computed(() => conversations[entry.value])
  const draft = computed({
    get: () => current.value.draft,
    set: (value: string) => {
      current.value.draft = value
    },
  })
  const error = computed({
    get: () => current.value.error,
    set: (value: string) => {
      current.value.error = value
    },
  })
  const messages = computed(() => current.value.messages)
  const pendingContext = computed(() => current.value.pendingContext)
  const isReplying = computed(() => current.value.isReplying)
  const unreadCount = computed(
    () => conversations.guide.unreadCount + conversations.support.unreadCount,
  )

  function cancel(kind: CustomerServiceEntry) {
    controllers.get(kind)?.abort()
    controllers.delete(kind)
    conversations[kind].isReplying = false
    for (const message of conversations[kind].messages) {
      if (message.kind === 'text' && message.replyStatus === 'streaming') {
        message.replyStatus = 'interrupted'
      }
    }
    if (kind !== 'support') return

    for (const controller of actionControllers.values()) controller.abort()
    actionControllers.clear()
    // Token renewal keeps messages; do not leave a preserved action submitting.
    for (const message of conversations.support.messages) {
      if (message.sender !== 'service' || message.kind !== 'text') continue
      for (const action of message.actions ?? []) {
        if (action.submission.status === 'submitting') {
          action.submission = {
            status: 'failed',
            error: '提交已取消，暂未确认结果，请使用此按钮重试。',
          }
        }
      }
    }
  }
  function clearConversation() {
    cancel(entry.value)
    conversations[entry.value] = createConversation(entry.value)
  }
  function clearAllConversations() {
    ++generation
    for (const kind of ['guide', 'support'] as const) {
      cancel(kind)
      conversations[kind] = createConversation(kind)
    }
  }
  watch(
    () => [auth.user?.id, auth.user?.role, auth.accessToken] as const,
    (next, previous) => {
      const identityChanged = next[0] !== previous[0] || next[1] !== previous[1]
      ++generation
      for (const kind of ['guide', 'support'] as const) {
        if (!identityChanged && conversations[kind].isReplying) {
          conversations[kind].error = '登录状态已更新，请重新发送。'
        }
        cancel(kind)
        if (identityChanged) conversations[kind] = createConversation(kind)
      }
      if (identityChanged) visible.value = false
    },
    { flush: 'sync' },
  )
  function open(kind: CustomerServiceEntry = 'guide', context?: SupportContext) {
    const expected = generation
    auth.getAuthorization()
    conversations[kind].pendingContext = context && expected === generation ? { ...context } : null
    entry.value = kind
    visible.value = true
    conversations[kind].unreadCount = 0
  }
  function close() {
    visible.value = false
    conversations.guide.pendingContext = null
    conversations.support.pendingContext = null
  }

  async function receive(
    kind: CustomerServiceEntry,
    text: string,
    authorization: string,
    controller: AbortController,
    expected: number,
  ) {
    const conversation = conversations[kind]
    let answerId: number | undefined
    let receivedAction = false
    const isCurrent = () => {
      const latest = auth.getAuthorization()
      return (
        expected === generation &&
        conversations[kind] === conversation &&
        controllers.get(kind) === controller &&
        !controller.signal.aborted &&
        latest === authorization
      )
    }
    function ensureAnswer() {
      if (answerId === undefined) {
        answerId = ++nextId
        conversation.messages.push({
          id: answerId,
          sender: 'service',
          createdAt: Date.now(),
          kind: 'text',
          text: '',
          replyStatus: 'streaming',
        })
        if (!visible.value || entry.value !== kind) conversation.unreadCount++
      }
      const answer = conversation.messages.find((message) => message.id === answerId)
      if (answer?.kind !== 'text') throw new CustomerServiceError('protocol')
      return answer
    }
    try {
      await streamCustomerServiceTurn(kind, text, {
        signal: controller.signal,
        expectedAuthorization: authorization,
        onDelta: (chunk) => {
          if (!isCurrent() || !chunk) return
          ensureAnswer().text += chunk
        },
        onAction: (payload) => {
          if (!isCurrent() || kind !== 'support') return
          receivedAction = true
          if (findTransferHumanAction(conversation, payload.actionId)) return
          const answer = ensureAnswer()
          answer.actions ??= []
          answer.actions.push({ ...payload, submission: { status: 'idle' } })
        },
      })
      if (isCurrent()) {
        if (answerId !== undefined) {
          ensureAnswer().replyStatus = 'done'
        } else if (!receivedAction) {
          conversation.error = '未收到回答内容，请重新发送。'
        }
      }
    } catch (error) {
      const failure = error instanceof CustomerServiceError ? error : new CustomerServiceError()
      // The shared HTTP interceptor may already have cleared a rejected login.
      if (failure.kind === 'login-required' && !auth.getAuthorization()) {
        loginPrompt.openLogin(failure.message)
      }
      if (!isCurrent()) return
      if (answerId !== undefined) ensureAnswer().replyStatus = 'interrupted'
      if (failure.kind === 'login-required') {
        auth.logout()
        loginPrompt.openLogin(failure.message)
        return
      }
      conversation.error = failure.message
    } finally {
      if (controllers.get(kind) === controller) {
        controllers.delete(kind)
        conversation.isReplying = false
      }
    }
  }
  async function submitTransferHuman(actionId: string): Promise<boolean> {
    if (entry.value !== 'support') return false

    const expected = generation
    const authorization = auth.getAuthorization()
    if (expected !== generation || !authorization) return false
    const conversation = conversations.support
    const found = findTransferHumanAction(conversation, actionId)
    if (!found || found.message.replyStatus !== 'done') return false
    const { action } = found
    if (
      action.submission.status === 'submitting' ||
      action.submission.status === 'submitted' ||
      action.submission.status === 'expired' ||
      actionControllers.has(actionId)
    ) {
      return false
    }
    const controller = new AbortController()
    actionControllers.set(actionId, controller)
    action.submission = { status: 'submitting' }
    const isCurrent = () => {
      const latest = auth.getAuthorization()
      return (
        expected === generation &&
        conversations.support === conversation &&
        actionControllers.get(actionId) === controller &&
        !controller.signal.aborted &&
        latest === authorization
      )
    }
    try {
      const result = await submitTransferHumanTicket(actionId, {
        signal: controller.signal,
        expectedAuthorization: authorization,
      })
      if (!isCurrent()) return false
      action.submission = {
        status: 'submitted',
        ticketNo: result.ticketNo,
        message: result.message,
      }
      return true
    } catch (error) {
      const failure =
        error instanceof TransferHumanSubmissionError ? error : new TransferHumanSubmissionError()
      // The shared interceptor can clear the login and cancel this request first.
      if (failure.kind === 'login-required' && !auth.getAuthorization()) {
        loginPrompt.openLogin(failure.message)
      }
      if (!isCurrent()) return false
      if (failure.kind === 'login-required') {
        auth.logout()
        loginPrompt.openLogin(failure.message)
        return false
      }
      action.submission =
        failure.kind === 'expired'
          ? { status: 'expired', error: failure.message }
          : { status: 'failed', error: failure.message }
      return false
    } finally {
      if (actionControllers.get(actionId) === controller) actionControllers.delete(actionId)
    }
  }
  function sendText(): boolean {
    const expected = generation
    const authorization = auth.getAuthorization()
    if (expected !== generation) return false
    const conversation = current.value
    if (conversation.isReplying) return false
    const text = conversation.draft.trim()
    if (!text) return false
    if (text.length > CUSTOMER_SERVICE_TEXT_LIMIT) {
      conversation.error = `最多输入 ${CUSTOMER_SERVICE_TEXT_LIMIT} 字`
      return false
    }
    if (!authorization) {
      loginPrompt.openLogin('登录后即可咨询智能导购和客服')
      return false
    }
    conversation.error = ''
    conversation.messages.push({
      id: ++nextId,
      sender: 'visitor',
      createdAt: Date.now(),
      kind: 'text',
      text,
    })
    conversation.draft = ''
    conversation.isReplying = true
    const controller = new AbortController()
    controllers.set(entry.value, controller)
    void receive(entry.value, text, authorization, controller, expected)
    return true
  }
  function sendQuestion(id: string) {
    const expected = generation
    auth.getAuthorization()
    if (expected !== generation || current.value.isReplying) return
    const question = customerServiceQuestions.find((item) => item.id === id)
    if (!question) return
    const previous = draft.value
    draft.value = question.question
    sendText()
    if (expected === generation) draft.value = previous
  }
  function removeContext() {
    current.value.pendingContext = null
  }
  onScopeDispose(() => {
    ++generation
    cancel('guide')
    cancel('support')
  })
  return {
    entry,
    visible,
    draft,
    error,
    unreadCount,
    messages,
    pendingContext,
    isReplying,
    submitTransferHuman,
    open,
    close,
    clearConversation,
    clearAllConversations,
    sendText,
    sendQuestion,
    removeContext,
  }
})
