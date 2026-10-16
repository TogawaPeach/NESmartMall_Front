<script setup lang="ts">
import { ElIcon } from 'element-plus'
import { Box, Tickets } from '@element-plus/icons-vue'
import { orderStatusInfo } from '@/constants/orderStatus'
import { formatPriceFen } from '@/utils/price'
import type { SupportContext } from '@/types/customerService'

defineProps<{ context: SupportContext }>()
</script>

<template>
  <div class="support-context-card">
    <span class="support-context-icon" aria-hidden="true"
      ><ElIcon><Box v-if="context.kind === 'product'" /><Tickets v-else /></ElIcon
    ></span>
    <div class="support-context-content">
      <span class="support-context-label">{{
        context.kind === 'product' ? '咨询商品' : '咨询订单'
      }}</span>
      <template v-if="context.kind === 'product'">
        <h3>{{ context.name }}</h3>
        <p v-if="context.model">{{ context.model }}</p>
        <strong>{{
          context.priceFen === null ? '价格待确认' : `¥${formatPriceFen(context.priceFen)}`
        }}</strong>
      </template>
      <template v-else>
        <h3>{{ context.orderNo }}</h3>
        <p>{{ orderStatusInfo(context.status).label }}</p>
        <strong>{{ context.amountLabel }} ¥{{ formatPriceFen(context.amountFen) }}</strong>
      </template>
    </div>
  </div>
</template>
