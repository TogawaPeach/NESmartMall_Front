<script setup lang="ts">
import { ElButton } from 'element-plus'
import { RefreshRight } from '@element-plus/icons-vue'
import { orderStatuses } from '@/constants/orderStatus'
import { useOrders } from '@/composables/useOrders'
import OrderPageShell from '@/components/storefront/OrderPageShell.vue'
import OrderCard from '@/components/storefront/OrderCard.vue'
import OrderPageState from '@/components/storefront/OrderPageState.vue'

const { data, state, status, changeStatus, retry, listQuery } = useOrders()
</script>

<template>
  <OrderPageShell title="我的订单">
    <template #heading-action
      ><ElButton
        :icon="RefreshRight"
        :loading="state === 'loading'"
        :disabled="state === 'login-required'"
        round
        @click="retry"
        >刷新订单</ElButton
      ></template
    >
    <nav class="order-filters" aria-label="按订单状态筛选">
      <button
        type="button"
        :aria-pressed="!status"
        :class="{ 'is-active': !status }"
        @click="changeStatus(undefined)"
      >
        全部订单
      </button>
      <button
        v-for="tab in orderStatuses"
        :key="tab.value"
        type="button"
        :aria-pressed="status === tab.value"
        :class="{ 'is-active': status === tab.value }"
        @click="changeStatus(tab.value)"
      >
        {{ tab.label }}
      </button>
    </nav>
    <section class="order-list" aria-label="订单列表" :aria-busy="state === 'loading'">
      <p class="sr-only" role="status" aria-live="polite">
        {{ state === 'success' ? `共 ${data?.length} 笔订单` : '' }}
      </p>
      <template v-if="state === 'success' && data">
        <OrderCard
          v-for="order in data"
          :key="order.orderNo"
          :order="order"
          :list-query="listQuery"
          @confirmed="retry"
        />
      </template>
      <OrderPageState v-else :state="state" :filtered="!!status" @retry="retry" />
    </section>
    <p v-if="state === 'success'" class="order-service-note">
      模拟支付不会实际扣款；取消订单暂未开放。
    </p>
  </OrderPageShell>
</template>
