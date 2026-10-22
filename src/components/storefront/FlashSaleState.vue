<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElIcon } from 'element-plus'
import { Box, RefreshRight, User, Warning } from '@element-plus/icons-vue'
import type { FlashSaleLoadState } from '@/types/flashSale'
import { useLoginPromptStore } from '@/stores/loginPrompt'

const props = defineProps<{ state: FlashSaleLoadState }>()
defineEmits<{ retry: [] }>()
const loginPrompt = useLoginPromptStore()
const copy = computed(() => {
  switch (props.state) {
    case 'unconfigured':
      return { title: '秒杀专区即将开放', description: '秒杀服务接口尚未配置，请稍后再来查看。' }
    case 'empty':
      return { title: '暂无秒杀商品', description: '新的仪器好价正在准备中，稍后再来看看。' }
    case 'login-required':
      return { title: '请先登录账号', description: '登录后即可继续查看秒杀商品。' }
    case 'forbidden':
      return { title: '暂时无法访问秒杀专区', description: '当前账号没有访问权限。' }
    case 'unavailable':
      return { title: '秒杀服务暂不可用', description: '请稍后重试。' }
    default:
      return { title: '秒杀商品加载失败', description: '暂时未能取得商品信息，请稍后重试。' }
  }
})
</script>

<template>
  <section class="sale-state" aria-labelledby="sale-state-title" role="status">
    <ElIcon aria-hidden="true"
      ><User v-if="state === 'login-required'" /><Warning v-else-if="state === 'error'" /><Box
        v-else
    /></ElIcon>
    <h2 id="sale-state-title">{{ copy.title }}</h2>
    <p>{{ copy.description }}</p>
    <ElButton
      v-if="state === 'login-required'"
      :icon="User"
      @click="loginPrompt.openLogin('登录后即可查看秒杀商品')"
      >立即登录</ElButton
    >
    <ElButton v-else :icon="RefreshRight" @click="$emit('retry')">{{
      state === 'empty' ? '刷新商品' : '重新加载'
    }}</ElButton>
  </section>
</template>

<style scoped>
.sale-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 480px;
  padding: 40px 24px;
  border: 1px solid var(--store-border);
  border-radius: 16px;
  background: var(--store-surface);
  text-align: center;
}
.sale-state .el-icon {
  color: var(--store-state-icon);
  font-size: 44px;
}
h2 {
  margin: 24px 0 0;
  font-size: 24px;
  font-weight: 600;
}
p {
  margin: 12px 0 24px;
  color: var(--store-muted);
  font-size: 15px;
  line-height: 1.8;
}
</style>
