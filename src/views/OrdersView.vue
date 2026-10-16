<script setup lang="ts">
import { ElButton, ElConfigProvider, ElPagination } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { RefreshRight } from '@element-plus/icons-vue'
import { orderStatuses, ORDER_PAGE_SIZE } from '@/constants/orderStatus'
import { useOrders } from '@/composables/useOrders'
import OrderPageShell from '@/components/storefront/OrderPageShell.vue'
import OrderCard from '@/components/storefront/OrderCard.vue'
import OrderPageState from '@/components/storefront/OrderPageState.vue'

const { data, state, status, pageNum, changePage, changeStatus, retry, listQuery } = useOrders()
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
        {{ state === 'success' ? `共 ${data?.total} 笔订单，当前第 ${pageNum} 页` : '' }}
      </p>
      <template v-if="state === 'success' && data">
        <OrderCard
          v-for="order in data.list"
          :key="order.id"
          :order="order"
          :list-query="listQuery"
        />
      </template>
      <OrderPageState v-else :state="state" :filtered="!!status" @retry="retry" />
    </section>
    <div v-if="data && data.total > ORDER_PAGE_SIZE" class="order-pagination">
      <span>共 {{ data.total }} 笔订单</span>
      <ElConfigProvider :locale="zhCn"
        ><ElPagination
          :current-page="pageNum"
          :page-size="ORDER_PAGE_SIZE"
          :total="data.total"
          :pager-count="5"
          layout="prev, pager, next"
          @current-change="changePage"
      /></ElConfigProvider>
    </div>
    <p v-if="state === 'success'" class="order-service-note">支付、取消订单和确认收货暂未开放。</p>
  </OrderPageShell>
</template>
