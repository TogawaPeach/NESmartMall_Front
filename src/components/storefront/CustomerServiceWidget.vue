<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElButton, ElDrawer, ElIcon } from 'element-plus'
import { Close, Delete, Service } from '@element-plus/icons-vue'
import { useCustomerServiceStore } from '@/stores/customerService'
import { useCustomerServiceComposer } from '@/composables/useCustomerServiceComposer'
import { CUSTOMER_SERVICE_TEXT_LIMIT } from '@/constants/customerService'
import CustomerServiceContext from './CustomerServiceContext.vue'
import '@/assets/customerService.css'

const support = useCustomerServiceStore()
const { entry, visible, draft, error, messages, unreadCount, pendingContext, isReplying } =
  storeToRefs(support)
const { handleKeydown } = useCustomerServiceComposer()
const messageList = ref<HTMLElement>()
const composer = ref<HTMLTextAreaElement>()
const trigger = ref<HTMLButtonElement>()
let previousFocus: HTMLElement | null = null
const title = computed(() => (entry.value === 'guide' ? '智能导购' : '经纬智选客服'))
const triggerLabel = computed(() =>
  unreadCount.value ? `导购与客服，${unreadCount.value} 条未读消息` : '智能导购',
)
const canSend = computed(
  () =>
    !isReplying.value &&
    !!draft.value.trim() &&
    draft.value.trim().length <= CUSTOMER_SERVICE_TEXT_LIMIT,
)
const timeFormatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
})
async function scrollToLatest() {
  await nextTick()
  if (messageList.value) messageList.value.scrollTop = messageList.value.scrollHeight
}
function focusComposer() {
  void scrollToLatest()
  composer.value?.focus()
}
watch(
  visible,
  (opened) => {
    if (opened)
      previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { flush: 'sync' },
)
async function restoreFocus() {
  await nextTick()
  if (visible.value) return
  const target =
    previousFocus?.isConnected &&
    previousFocus !== document.body &&
    previousFocus.getClientRects().length
      ? previousFocus
      : trigger.value
  target?.focus()
  previousFocus = null
}
watch(
  () => {
    const last = messages.value.at(-1)
    return [
      entry.value,
      messages.value.length,
      last?.kind === 'text' ? last.text.length : 0,
      isReplying.value,
      visible.value,
    ]
  },
  () => {
    if (visible.value) void scrollToLatest()
  },
  { flush: 'post' },
)
onBeforeUnmount(() => support.clearAllConversations())
</script>

<template>
  <button
    ref="trigger"
    v-show="!visible"
    class="customer-service-trigger"
    type="button"
    :aria-label="triggerLabel"
    aria-haspopup="dialog"
    :aria-expanded="visible"
    @click="support.open()"
  >
    <ElIcon aria-hidden="true"><Service /></ElIcon><span>智能导购</span>
    <span v-if="unreadCount" class="support-unread" aria-hidden="true">{{
      unreadCount > 99 ? '99+' : unreadCount
    }}</span>
  </button>
  <ElDrawer
    v-model="visible"
    class="customer-service-drawer"
    :title="title"
    size="420px"
    append-to-body
    destroy-on-close
    :show-close="false"
    @opened="focusComposer"
    @close="support.close()"
    @closed="restoreFocus"
  >
    <template #header="{ titleId }">
      <div class="support-header">
        <div class="support-avatar" aria-hidden="true">
          <ElIcon><Service /></ElIcon>
        </div>
        <div class="support-heading">
          <h2 :id="titleId">{{ title }}</h2>
        </div>
        <div class="support-header-actions">
          <ElButton
            text
            :icon="Delete"
            aria-label="清空当前聊天记录"
            title="清空当前聊天记录"
            :disabled="messages.length <= 1 && !draft && !pendingContext"
            @click="support.clearConversation()"
          />
          <ElButton
            text
            :icon="Close"
            :aria-label="`关闭${title}`"
            :title="`关闭${title}`"
            @click="support.close()"
          />
        </div>
      </div>
    </template>
    <nav class="support-entry-tabs" aria-label="咨询入口">
      <button type="button" :aria-pressed="entry === 'guide'" @click="support.open('guide')">
        智能导购
      </button>
      <button type="button" :aria-pressed="entry === 'support'" @click="support.open('support')">
        客服
      </button>
    </nav>
    <p class="support-notice">AI 回复供参考，商品信息与售后安排请以商家确认为准。</p>
    <ol
      ref="messageList"
      class="support-messages"
      role="log"
      aria-live="polite"
      aria-relevant="additions text"
      :aria-label="`${title}聊天记录`"
      :aria-busy="isReplying"
    >
      <li
        v-for="message in messages"
        :key="message.id"
        class="support-message"
        :class="`support-message--${message.sender}`"
      >
        <div class="support-message-meta">
          <span v-if="message.sender === 'service'">{{ title }}</span>
          <time :datetime="new Date(message.createdAt).toISOString()">{{
            timeFormatter.format(message.createdAt)
          }}</time>
        </div>
        <p v-if="message.kind === 'text'" class="support-bubble">{{ message.text }}</p>
        <CustomerServiceContext v-else :context="message.context" />
      </li>
    </ol>
    <p v-if="isReplying" class="support-typing" role="status">
      <span aria-hidden="true">•••</span> {{ title }}正在回复
    </p>
    <template #footer>
      <div v-if="pendingContext" class="support-context-preview">
        <div class="support-preview-heading">
          <span>当前页面信息 · 仅供你查看</span
          ><button type="button" aria-label="移除关联信息" @click="support.removeContext()">
            <ElIcon aria-hidden="true"><Close /></ElIcon>
          </button>
        </div>
        <CustomerServiceContext :context="pendingContext" />
        <p class="support-context-hint">信息不会自动发送，请在问题中说明商品或订单。</p>
      </div>
      <form class="support-composer" @submit.prevent="support.sendText()">
        <label class="sr-only" for="support-message-input">咨询内容</label>
        <textarea
          id="support-message-input"
          ref="composer"
          v-model="draft"
          :maxlength="CUSTOMER_SERVICE_TEXT_LIMIT"
          rows="3"
          placeholder="输入你想咨询的问题"
          aria-describedby="support-input-hint"
          @keydown="handleKeydown"
          @input="error = ''"
        />
        <p v-if="error" class="support-input-error" role="alert">{{ error }}</p>
        <div class="support-compose-actions">
          <p id="support-input-hint">
            Enter 发送 · Shift+Enter 换行<span
              >{{ draft.length }}/{{ CUSTOMER_SERVICE_TEXT_LIMIT }}</span
            >
          </p>
          <ElButton type="primary" native-type="submit" :disabled="!canSend">{{
            isReplying ? '回复中' : '发送'
          }}</ElButton>
        </div>
      </form>
    </template>
  </ElDrawer>
</template>
