<script setup lang="ts">
import { computed } from 'vue'
import { ElCard, ElIcon, ElImage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import type { Product } from '@/types/product'

const props = defineProps<{ product: Product }>()

const title = computed(() => props.product.name || props.product.model)
const parameters = computed(() => props.product.parameters.slice(0, 2))
const price = computed(() => {
  const value = props.product.priceYuan
  if (value === null || !Number.isFinite(value) || value < 0) return null

  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
})
</script>

<template>
  <article class="product" :aria-label="title || undefined">
    <ElCard class="product-card" shadow="never" :body-style="{ padding: '0' }">
      <div class="product-image-area">
        <ElImage
          v-if="product.imageUrl"
          :key="product.imageUrl"
          :src="product.imageUrl"
          :alt="title || '商品图片'"
          fit="contain"
          class="product-image"
        >
          <template #placeholder>
            <div class="image-placeholder">
              <ElIcon aria-hidden="true"><Picture /></ElIcon>
              <span>图片加载中</span>
            </div>
          </template>
          <template #error>
            <div class="image-placeholder">
              <ElIcon aria-hidden="true"><Picture /></ElIcon>
              <span>暂无图片</span>
            </div>
          </template>
        </ElImage>
        <div v-else class="image-placeholder">
          <ElIcon aria-hidden="true"><Picture /></ElIcon>
          <span>暂无图片</span>
        </div>
      </div>

      <div class="product-details">
        <h2 class="product-name">{{ title }}</h2>
        <p v-if="product.categoryName" class="product-category">{{ product.categoryName }}</p>
        <div v-else class="product-category-space" aria-hidden="true" />

        <ul class="product-parameters" aria-label="核心参数">
          <li v-for="(parameter, index) in parameters" :key="index">
            <span v-if="parameter.label">{{ parameter.label }} </span>
            <span>{{ parameter.value }}</span>
            <span v-if="parameter.unit"> {{ parameter.unit }}</span>
          </li>
        </ul>

        <p v-if="price !== null" class="product-price" :aria-label="`人民币 ${price} 元`">
          <span class="currency" aria-hidden="true">¥</span>
          <span aria-hidden="true">{{ price }}</span>
        </p>
        <p v-else class="price-pending">价格待确认</p>
      </div>
    </ElCard>
  </article>
</template>

<style scoped>
.product,
.product-card {
  height: 100%;
  min-width: 0;
}

.product-card {
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}

.product-card :deep(.el-card__body) {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.product-image-area {
  height: 340px;
  padding: 24px 22px 12px;
  flex-shrink: 0;
}

.product-image {
  width: 100%;
  height: 100%;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  color: #879198;
  background: #f7f8f8;
  border-radius: 8px;
  font-size: 14px;
}

.image-placeholder .el-icon {
  font-size: 36px;
}

.product-details {
  display: flex;
  flex-direction: column;
  flex: 1;
  padding: 16px 24px 22px;
}

.product-name {
  margin: 0;
  color: var(--store-text);
  font-size: clamp(19px, 1.62vw, 24px);
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
}

.product-category,
.product-category-space {
  min-height: 26px;
  margin: 8px 0 12px;
  font-size: 17px;
  line-height: 26px;
  color: var(--store-muted);
}

.product-parameters {
  min-height: 90px;
  margin: auto 0 0;
  padding: 14px 0;
  border-top: 1px solid var(--store-border);
  list-style: none;
  color: var(--store-muted);
  font-size: 17px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}

.product-price,
.price-pending {
  display: flex;
  align-items: baseline;
  gap: 7px;
  min-height: 52px;
  margin: 0;
  padding-top: 14px;
  border-top: 1px solid var(--store-border);
  color: var(--store-text);
  font-size: 32px;
  font-weight: 650;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}

.currency {
  font-size: 23px;
  font-weight: 600;
}

.price-pending {
  align-items: center;
  color: var(--store-muted);
  font-size: 19px;
  font-weight: 500;
}

@media (max-width: 1199px) {
  .product-image-area {
    height: 320px;
  }
}

@media (max-width: 599px) {
  .product-image-area {
    height: 300px;
  }

  .product-name {
    font-size: 22px;
  }

  .product-details {
    padding: 16px 22px 22px;
  }
}
</style>
