<script setup lang="ts">
import { ElButton } from 'element-plus'
import type { OrderStatus } from '@/types/order'

defineProps<{ status: OrderStatus }>()
</script>

<template>
  <div v-if="status === 'PENDING_PAYMENT' || status === 'PENDING_RECEIPT'" class="order-actions">
    <template v-if="status === 'PENDING_PAYMENT'">
      <ElButton disabled title="取消订单暂未开放">取消订单</ElButton>
      <ElButton type="primary" disabled title="支付暂未开放">去付款</ElButton>
    </template>
    <ElButton v-else type="primary" disabled title="确认收货暂未开放">确认收货</ElButton>
  </div>
</template>
