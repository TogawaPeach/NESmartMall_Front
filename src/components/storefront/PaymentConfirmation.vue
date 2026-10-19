<script setup lang="ts">
import { ElAlert, ElButton, ElDialog } from 'element-plus'
import type { Order } from '@/types/order'
import { formatPriceFen } from '@/utils/price'

defineProps<{
  visible: boolean
  order: Order | null
  paying: boolean
  querying: boolean
  canPay: boolean
  uncertain: boolean
  notice: string
  error: string
}>()
const emit = defineEmits<{ close: []; confirm: []; refresh: [] }>()
</script>

<template>
  <ElDialog
    :model-value="visible"
    title="确认模拟支付"
    width="min(420px, calc(100vw - 32px))"
    align-center
    append-to-body
    destroy-on-close
    @update:model-value="!$event && emit('close')"
  >
    <div :aria-busy="paying || querying" role="status" aria-live="polite">
      <template v-if="order">
        <p class="payment-order-no">订单号：{{ order.orderNo }}</p>
        <p>
          订单应付金额 <strong>¥{{ formatPriceFen(order.payableAmountFen) }}</strong>
        </p>
        <p>{{ notice }}</p>
      </template>
      <p v-else-if="querying">正在查询订单付款信息…</p>
      <ElAlert v-if="error" :title="error" type="warning" show-icon :closable="false" />
    </div>
    <p class="payment-demo-note">将按此订单向服务器确认模拟支付，不会实际扣款。</p>
    <RouterLink
      v-if="order"
      :to="{ name: 'order-detail', params: { orderNo: order.orderNo } }"
      @click="emit('close')"
      >查看订单</RouterLink
    >
    <template #footer>
      <ElButton @click="emit('close')">暂不支付</ElButton>
      <ElButton
        v-if="uncertain || !canPay"
        :loading="querying"
        :disabled="paying"
        @click="emit('refresh')"
        >查询订单</ElButton
      >
      <ElButton
        type="primary"
        :loading="paying"
        :disabled="!canPay || querying || paying"
        @click="emit('confirm')"
        >确认模拟支付</ElButton
      >
    </template>
  </ElDialog>
</template>

<style scoped>
.payment-order-no {
  overflow-wrap: anywhere;
}
.payment-demo-note {
  color: var(--store-muted);
  font-size: 12px;
  line-height: 1.7;
}
strong {
  font-variant-numeric: tabular-nums;
}
</style>
