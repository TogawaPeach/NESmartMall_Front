<script setup lang="ts">
import type { LocationQueryRaw } from 'vue-router'
import type { OrderSummary } from '@/types/order'
import { formatOrderTime, orderStatusInfo } from '@/constants/orderStatus'
import { formatPriceFen } from '@/utils/price'
import OrderItems from './OrderItems.vue'
import OrderActions from './OrderActions.vue'

defineProps<{ order: OrderSummary; listQuery: LocationQueryRaw }>()
const emit = defineEmits<{ confirmed: [] }>()
</script>

<template>
  <article class="order-card" :aria-label="`订单 ${order.orderNo}`">
    <header class="order-card-heading">
      <div class="order-card-meta">
        <time :datetime="order.createdAt">{{ formatOrderTime(order.createdAt) }}</time
        ><span
          >订单号 <strong>{{ order.orderNo }}</strong></span
        >
      </div>
      <span class="order-status" :class="`order-status--${order.status.toLowerCase()}`">{{
        orderStatusInfo(order.status).label
      }}</span>
    </header>
    <OrderItems :items="order.items" />
    <footer class="order-card-footer">
      <div class="order-card-total">
        <span>订单金额</span><strong>¥{{ formatPriceFen(order.payableAmountFen) }}</strong>
      </div>
      <div class="order-card-links">
        <RouterLink
          class="order-detail-link"
          :to="{ name: 'order-detail', params: { orderNo: order.orderNo }, query: listQuery }"
          :aria-label="`查看订单 ${order.orderNo} 详情`"
          >查看详情 <span aria-hidden="true">→</span></RouterLink
        >
        <OrderActions
          :order="order"
          :status="order.status"
          :order-no="order.orderNo"
          @confirmed="emit('confirmed')"
        />
      </div>
    </footer>
  </article>
</template>
