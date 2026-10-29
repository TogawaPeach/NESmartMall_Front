<script setup lang="ts">
import { ElIcon, ElImage } from 'element-plus'
import { Close } from '@element-plus/icons-vue'
import { orderStatusInfo } from '@/constants/orderStatus'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import { formatPriceFen } from '@/utils/price'
import type { OrderLoadState, OrderSummary } from '@/types/order'

defineProps<{
  orders: OrderSummary[]
  state: OrderLoadState
  selectedOrderNo: string
  disabled: boolean
}>()
const emit = defineEmits<{ select: [orderNo: string]; retry: []; dismiss: [] }>()
const loginPrompt = useLoginPromptStore()
</script>

<template>
  <section class="support-orders" aria-labelledby="support-orders-title">
    <div class="support-orders-heading">
      <h3 id="support-orders-title">选择要咨询的订单</h3>
      <span v-if="orders.length">共 {{ orders.length }} 笔 · 向下滚动查看更多</span>
      <button
        type="button"
        class="support-orders-close"
        aria-label="关闭订单选择"
        title="关闭订单选择"
        @click="emit('dismiss')"
      >
        <ElIcon aria-hidden="true"><Close /></ElIcon>
      </button>
    </div>
    <p v-if="state === 'loading'" class="support-orders-state" role="status">正在加载订单…</p>
    <p v-else-if="state === 'empty'" class="support-orders-state">暂无订单，可以直接输入问题咨询</p>
    <p v-else-if="state === 'login-required'" class="support-orders-state">
      登录后可选择订单
      <button type="button" @click="loginPrompt.openLogin('登录后可查看并咨询订单')">去登录</button>
    </p>
    <div
      v-else-if="state === 'success'"
      class="support-orders-list"
      role="group"
      aria-label="可咨询的订单"
    >
      <button
        v-for="order in orders"
        :key="order.orderNo"
        type="button"
        class="support-order-card"
        :class="{ 'is-selected': selectedOrderNo === order.orderNo }"
        :disabled="disabled"
        :aria-label="`咨询订单 ${order.orderNo}，${order.items[0]?.name}`"
        @click="emit('select', order.orderNo)"
      >
        <span class="support-order-heading">
          <span class="support-order-number">订单 {{ order.orderNo }}</span>
          <span class="support-order-status">{{
            order.displayStatus === 'PAYMENT_EXPIRED'
              ? '支付已超时'
              : orderStatusInfo(order.status).label
          }}</span>
        </span>
        <span class="support-order-product">
          <ElImage
            :src="order.items[0]?.coverUrl || ''"
            fit="cover"
            class="support-order-image"
            alt=""
          >
            <template #error><span class="support-order-image-fallback">商品</span></template>
          </ElImage>
          <span class="support-order-description">
            <span class="support-order-name">{{ order.items[0]?.name }}</span>
            <span class="support-order-model">{{ order.items[0]?.model || '标准款' }}</span>
          </span>
        </span>
        <span class="support-order-bottom">
          <span
            >共 {{ order.items.reduce((count, item) => count + item.quantity, 0) }} 件 · ¥{{
              formatPriceFen(order.payableAmountFen)
            }}</span
          >
          <span class="support-order-action"
            >{{ selectedOrderNo === order.orderNo ? '已发送咨询' : '咨询此订单' }}
            <span aria-hidden="true">→</span></span
          >
        </span>
      </button>
    </div>
    <p v-else class="support-orders-state" role="status">
      {{ state === 'forbidden' ? '暂无权限查看订单' : '订单加载失败' }}
      <button type="button" @click="emit('retry')">重试</button>
    </p>
  </section>
</template>
