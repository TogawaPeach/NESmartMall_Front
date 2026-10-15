<script setup lang="ts">
import { computed } from 'vue'
import { ElCard, ElIcon, ElImage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import type { Product } from '@/types/product'

const props = defineProps<{ product: Product }>()

const title = computed(() => props.product.name || props.product.model)
const price = computed(() => {
  const value = props.product.priceYuan
  if (value === null || !Number.isFinite(value) || value < 0) return null

  return new Intl.NumberFormat('zh-CN', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value)
})
const sales = computed(() =>
  props.product.sales === null ? null : new Intl.NumberFormat('zh-CN').format(props.product.sales),
)
</script>

<template>
  <article class="product" :aria-label="title || undefined">
    <RouterLink
      class="product-link"
      :to="{ name: 'product-detail', params: { id: String(product.id) } }"
      target="_blank"
      rel="noopener noreferrer"
      :aria-label="`${title || '商品'}，查看详情（在新标签页中打开）`"
    >
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
          <div class="product-summary">
            <p v-if="price !== null" class="product-price" :aria-label="`人民币 ${price} 元`">
              <span class="currency" aria-hidden="true">¥</span>
              <span aria-hidden="true">{{ price }}</span>
            </p>
            <p v-else class="price-pending">价格待确认</p>
            <p class="product-sales">{{ sales === null ? '购买人数暂无' : `${sales}人购买` }}</p>
          </div>
        </div>
      </ElCard>
    </RouterLink>
  </article>
</template>

<style scoped>
.product,
.product-card {
  min-width: 0;
}

.product-link {
  display: block;
  height: 100%;
  border-radius: 12px;
}

.product-link:hover .product-card {
  border-color: var(--store-border-hover);
}

.product-card {
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}

.product-card :deep(.el-card__body) {
  display: flex;
  flex-direction: column;
}

.product-image-area {
  position: relative;
  width: 100%;
  aspect-ratio: 1;
  padding: 12px 12px 0;
  flex-shrink: 0;
  overflow: hidden;
}

.product-image {
  /* Keep intrinsic image dimensions from enlarging the square display area. */
  position: absolute;
  inset: 12px 12px 0;
  width: auto;
  height: auto;
  border-radius: 10px;
  background: var(--store-background);
}

.product-image-area > .image-placeholder {
  position: absolute;
  inset: 12px 12px 0;
  width: auto;
  height: auto;
}

.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  color: var(--store-placeholder);
  background: var(--store-background);
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
  padding: 14px 16px 18px;
}

.product-name {
  margin: 0;
  color: var(--store-text);
  font-size: 18px;
  font-weight: 600;
  line-height: 1.45;
  overflow-wrap: anywhere;
  display: -webkit-box;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  overflow: hidden;
  min-height: 2.9em;
}

.product-summary {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 8px 12px;
  margin-top: 16px;
}

.product-price,
.price-pending {
  display: flex;
  align-items: baseline;
  gap: 2px;
  margin: 0;
  color: var(--store-price);
  font-size: 28px;
  font-weight: 650;
  line-height: 1.25;
  font-variant-numeric: tabular-nums;
}

.currency {
  font-size: 19px;
  font-weight: 600;
}

.price-pending {
  align-items: center;
  color: var(--store-muted);
  font-size: 16px;
  font-weight: 500;
}

.product-sales {
  margin: 0 0 0 auto;
  color: var(--store-muted);
  font-size: 14px;
  line-height: 1.5;
}

@media (max-width: 599px) {
  .product-image-area {
    padding: 8px 8px 0;
  }

  .product-image,
  .product-image-area > .image-placeholder {
    inset: 8px 8px 0;
  }

  .product-name {
    font-size: 14px;
  }

  .product-details {
    padding: 10px;
  }

  .product-summary {
    flex-direction: column;
    align-items: flex-start;
    gap: 4px;
    margin-top: 8px;
  }

  .product-price {
    font-size: 22px;
  }

  .currency {
    font-size: 14px;
  }

  .price-pending {
    font-size: 14px;
  }

  .product-sales {
    margin: 0;
    font-size: 12px;
  }
}
</style>
