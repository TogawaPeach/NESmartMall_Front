<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { ElButton, ElDrawer, ElIcon } from 'element-plus'
import { ChatDotRound, Close, Delete, Service } from '@element-plus/icons-vue'
import { useCustomerServiceStore } from '@/stores/customerService'
import { useCustomerServiceComposer } from '@/composables/useCustomerServiceComposer'
import { CUSTOMER_SERVICE_TEXT_LIMIT, customerServiceQuestions } from '@/constants/customerService'
import CustomerServiceContext from './CustomerServiceContext.vue'
import '@/assets/customerService.css'

const support = useCustomerServiceStore()
const { visible, draft, error, messages, unreadCount, pendingContext, isReplying } =
  storeToRefs(support)
const { handleKeydown } = useCustomerServiceComposer()
const messageList = ref<HTMLElement>()
const composer = ref<HTMLTextAreaElement>()
const trigger = ref<HTMLButtonElement>()
let previousFocus: HTMLElement | null = null
const triggerLabel = computed(() =>
  unreadCount.value ? `智能导购，${unreadCount.value} 条未读消息` : '智能导购',
)
const canSend = computed(
  () => !!draft.value.trim() && draft.value.trim().length <= CUSTOMER_SERVICE_TEXT_LIMIT,
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
  () => [messages.value.length, isReplying.value, visible.value],
  () => {
    if (visible.value) void scrollToLatest()
  },
  { flush: 'post' },
)
onBeforeUnmount(() => support.clearConversation())
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
    title="智能导购"
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
          <h2 :id="titleId">智能导购</h2>
          <span>商品选购咨询 · 模拟接待</span>
        </div>
        <div class="support-header-actions">
          <ElButton
            text
            :icon="Delete"
            aria-label="清空演示会话"
            title="清空演示会话"
            :disabled="messages.length <= 1 && !draft && !pendingContext"
            @click="support.clearConversation()"
          />
          <ElButton
            text
            :icon="Close"
            aria-label="关闭智能导购"
            title="关闭智能导购"
            @click="support.close()"
          />
        </div>
      </div>
    </template>
    <p class="support-demo-notice"><span>前端演示</span>模拟回复，消息不会发送给真实客服。</p>
    <ol
      ref="messageList"
      class="support-messages"
      role="log"
      aria-live="polite"
      aria-relevant="additions"
      aria-label="智能导购聊天记录"
    >
      <li
        v-for="message in messages"
        :key="message.id"
        class="support-message"
        :class="`support-message--${message.sender}`"
      >
        <div class="support-message-meta">
          <span>{{ message.sender === 'service' ? '智能导购 · 模拟' : '你' }}</span
          ><time :datetime="new Date(message.createdAt).toISOString()">{{
            timeFormatter.format(message.createdAt)
          }}</time>
        </div>
        <p v-if="message.kind === 'text'" class="support-bubble">{{ message.text }}</p>
        <CustomerServiceContext v-else :context="message.context" />
        <span v-if="message.sender === 'visitor'" class="support-local-state">仅本地发送</span>
      </li>
    </ol>
    <p v-if="isReplying" class="support-typing" role="status">
      <span aria-hidden="true">•••</span> 智能导购正在模拟回复
    </p>
    <section class="support-shortcuts" aria-label="常见问题">
      <p>
        <ElIcon aria-hidden="true"><ChatDotRound /></ElIcon> 常见问题
      </p>
      <div>
        <button
          v-for="question in customerServiceQuestions"
          :key="question.id"
          type="button"
          @click="support.sendQuestion(question.id)"
        >
          {{ question.label }}
        </button>
      </div>
    </section>
    <template #footer>
      <div v-if="pendingContext" class="support-context-preview">
        <div class="support-preview-heading">
          <span>待发送的咨询信息</span
          ><button type="button" aria-label="移除关联信息" @click="support.removeContext()">
            <ElIcon aria-hidden="true"><Close /></ElIcon>
          </button>
        </div>
        <CustomerServiceContext :context="pendingContext" />
        <ElButton size="small" plain @click="support.sendContext()">{{
          pendingContext.kind === 'product' ? '发送商品' : '发送订单'
        }}</ElButton>
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
          <ElButton type="primary" native-type="submit" :disabled="!canSend">发送</ElButton>
        </div>
      </form>
    </template>
  </ElDrawer>
</template>
