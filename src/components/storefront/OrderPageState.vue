<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElIcon, ElSkeleton } from 'element-plus'
import { Tickets, User, Warning } from '@element-plus/icons-vue'
import type { OrderLoadState } from '@/types/order'
import { useLoginPromptStore } from '@/stores/loginPrompt'

const props = defineProps<{ state: OrderLoadState; filtered?: boolean }>()
defineEmits<{ retry: [] }>()
const loginPrompt = useLoginPromptStore()
const copy = computed(() => {
  switch (props.state) {
    case 'login-required':
      return { title: '登录后查看你的订单', description: '登录账号，查看订单记录与交易进度。' }
    case 'empty':
      return {
        title: props.filtered ? '暂无此状态的订单' : '还没有订单',
        description: props.filtered
          ? '试试其他状态，查看已有订单。'
          : '下单成功后，可以在这里查看订单。',
      }
    case 'forbidden':
      return { title: '暂时无法查看订单', description: '当前账号没有访问此订单信息的权限。' }
    case 'unavailable':
      return { title: '订单服务暂未开放', description: '订单查询服务准备中，请稍后重试。' }
    case 'not-found':
      return { title: '订单不存在或无法访问', description: '请返回订单列表，查看当前账号的订单。' }
    default:
      return { title: '订单加载失败', description: '暂时未能获取订单信息，请稍后重试。' }
  }
})
</script>

<template>
  <div v-if="state === 'loading'" class="order-loading" role="status" aria-label="正在加载订单">
    <ElSkeleton :rows="6" animated />
  </div>
  <section v-else-if="state !== 'success'" class="order-empty-state" aria-live="polite">
    <ElIcon class="order-state-icon" aria-hidden="true"
      ><User v-if="state === 'login-required'" /><Tickets v-else-if="state === 'empty'" /><Warning
        v-else
    /></ElIcon>
    <h2>{{ copy.title }}</h2>
    <p>{{ copy.description }}</p>
    <ElButton
      v-if="state === 'login-required'"
      type="primary"
      @click="loginPrompt.openLogin('登录后即可查看我的订单')"
      >立即登录</ElButton
    >
    <RouterLink
      v-else-if="state === 'empty' && !filtered"
      class="order-outline-link"
      :to="{ name: 'home' }"
      >去逛逛</RouterLink
    >
    <ElButton v-else-if="state !== 'not-found' && state !== 'empty'" @click="$emit('retry')"
      >重新加载</ElButton
    >
  </section>
</template>
