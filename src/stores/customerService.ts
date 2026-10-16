import { computed, onScopeDispose, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth'
import {
  CUSTOMER_SERVICE_TEXT_LIMIT,
  customerServiceQuestions,
  customerServiceReply,
  customerServiceWelcome,
} from '@/constants/customerService'
import type { CustomerServiceMessage, SupportContext } from '@/types/customerService'

/** Frontend demonstration only: no network, persistence, or real delivery receipts. */
export const useCustomerServiceStore = defineStore('customerService', () => {
  const auth = useAuthStore()
  const visible = ref(false)
  const draft = ref('')
  const error = ref('')
  const unreadCount = ref(0)
  const pendingContext = ref<SupportContext | null>(null)
  const pendingReplies = ref(0)
  const isReplying = computed(() => pendingReplies.value > 0)
  const timers = new Set<ReturnType<typeof setTimeout>>()
  let nextId = 0
  let generation = 0
  const welcome = (): CustomerServiceMessage => ({
    id: ++nextId,
    sender: 'service',
    createdAt: Date.now(),
    kind: 'text',
    text: customerServiceWelcome,
  })
  const messages = ref<CustomerServiceMessage[]>([welcome()])

  function cancelReplies() {
    ++generation
    for (const timer of timers) clearTimeout(timer)
    timers.clear()
    pendingReplies.value = 0
  }
  function clearConversation() {
    cancelReplies()
    messages.value = [welcome()]
    pendingContext.value = null
    draft.value = ''
    error.value = ''
    unreadCount.value = 0
  }
  watch(
    () => (auth.user ? `${auth.user.id}:${auth.user.role}` : 'guest'),
    () => {
      clearConversation()
      visible.value = false
    },
    { flush: 'sync' },
  )
  function open(context?: SupportContext) {
    const expectedGeneration = generation
    auth.getAuthorization()
    if (context && expectedGeneration === generation) pendingContext.value = { ...context }
    visible.value = true
    unreadCount.value = 0
  }
  function close() {
    visible.value = false
  }
  function scheduleReply(text: string) {
    const expectedGeneration = generation
    pendingReplies.value++
    const timer = setTimeout(() => {
      timers.delete(timer)
      // Storage events can lag: refresh identity before appending any delayed message.
      auth.getAuthorization()
      if (expectedGeneration !== generation) return
      pendingReplies.value--
      messages.value.push({
        id: ++nextId,
        sender: 'service',
        createdAt: Date.now(),
        kind: 'text',
        text,
      })
      if (!visible.value) unreadCount.value++
    }, 650)
    timers.add(timer)
  }
  function sendText(): boolean {
    const expectedGeneration = generation
    auth.getAuthorization()
    // A send triggered by an old account must not submit its draft into the new one.
    if (expectedGeneration !== generation) return false
    const text = draft.value.trim()
    if (!text) return false
    if (text.length > CUSTOMER_SERVICE_TEXT_LIMIT) {
      error.value = `最多输入 ${CUSTOMER_SERVICE_TEXT_LIMIT} 字`
      return false
    }
    error.value = ''
    messages.value.push({
      id: ++nextId,
      sender: 'visitor',
      createdAt: Date.now(),
      kind: 'text',
      text,
    })
    draft.value = ''
    scheduleReply(customerServiceReply(text))
    return true
  }
  function sendQuestion(id: string) {
    const item = customerServiceQuestions.find((question) => question.id === id)
    if (!item) return
    auth.getAuthorization()
    // Quick questions are independent of the user's unsent draft.
    const previous = draft.value
    draft.value = item.question
    sendText()
    draft.value = previous
  }
  function sendContext(): boolean {
    const expectedGeneration = generation
    auth.getAuthorization()
    if (expectedGeneration !== generation || !pendingContext.value) return false
    const context = { ...pendingContext.value }
    messages.value.push({
      id: ++nextId,
      sender: 'visitor',
      createdAt: Date.now(),
      kind: 'context',
      context,
    })
    pendingContext.value = null
    scheduleReply(
      context.kind === 'order'
        ? '演示答复：已在本次会话中关联这笔订单，请继续说明你要咨询的问题。当前不会查询或修改真实订单。'
        : '演示答复：已在本次会话中关联这件商品，请继续说明你的用途或需要了解的参数。当前不会向真实客服发送消息。',
    )
    return true
  }
  function removeContext() {
    pendingContext.value = null
  }
  onScopeDispose(cancelReplies)
  return {
    visible,
    draft,
    error,
    unreadCount,
    messages,
    pendingContext,
    isReplying,
    open,
    close,
    clearConversation,
    sendText,
    sendQuestion,
    sendContext,
    removeContext,
  }
})
