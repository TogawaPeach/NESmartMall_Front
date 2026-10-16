<script setup lang="ts">
import { ElIcon, ElImage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import type { OrderItem } from '@/types/order'
import { formatPriceFen } from '@/utils/price'

defineProps<{ items: OrderItem[] }>()
</script>

<template>
  <div class="order-items" aria-label="订单商品">
    <div v-for="item in items" :key="item.id" class="order-item">
      <div class="order-item-cover">
        <ElImage
          v-if="item.coverUrl"
          :key="item.coverUrl"
          :src="item.coverUrl"
          :alt="item.name"
          fit="contain"
        >
          <template #placeholder
            ><span class="order-image-placeholder"
              ><ElIcon><Picture /></ElIcon></span
          ></template>
          <template #error
            ><span class="order-image-placeholder"
              ><ElIcon><Picture /></ElIcon><span>暂无图片</span></span
            ></template
          >
        </ElImage>
        <span v-else class="order-image-placeholder"
          ><ElIcon><Picture /></ElIcon><span>暂无图片</span></span
        >
      </div>
      <div class="order-item-info">
        <h3>{{ item.name }}</h3>
        <p v-if="item.model">{{ item.model }}</p>
      </div>
      <div class="order-item-price">
        <span>¥{{ formatPriceFen(item.unitPriceFen) }}</span
        ><span class="order-item-quantity">× {{ item.quantity }}</span>
      </div>
    </div>
  </div>
</template>
