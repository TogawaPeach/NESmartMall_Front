<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElIcon, ElTooltip } from 'element-plus'
import { ArrowRight, Box, RefreshRight, Warning } from '@element-plus/icons-vue'
import StorefrontHeader from '@/components/storefront/StorefrontHeader.vue'
import ProductCategoryFilter from '@/components/storefront/ProductCategoryFilter.vue'
import ProductCard from '@/components/storefront/ProductCard.vue'
import ProductGridSkeleton from '@/components/storefront/ProductGridSkeleton.vue'
import { useHomeProducts } from '@/composables/useHomeProducts'
import { productCategoryLabel, productListLocation } from '@/constants/productCategories'
import { useLoginPromptStore } from '@/stores/loginPrompt'

const loginPrompt = useLoginPromptStore()
function checkCatalogueAccess(event: MouseEvent) {
  if (!loginPrompt.requireLogin('登录后即可查看全部商品')) event.preventDefault()
}

const {
  category,
  keyword,
  products,
  state,
  errorKind,
  errorMessage,
  selectCategory,
  clearSearch,
  retry,
} = useHomeProducts()
const viewAllLabel = computed(() =>
  category.value === 'all' ? '查看全部商品' : `查看全部${productCategoryLabel(category.value)}`,
)
// Each homepage entry opens the selected category from the first page.
const viewAllLocation = computed(() => productListLocation(category.value, 1))
</script>

<template>
  <div class="storefront">
    <a class="skip-link" href="#catalog">跳转到商品区域</a>
    <StorefrontHeader v-model:keyword="keyword" @clear-search="clearSearch" />

    <main id="catalog" class="catalog" aria-labelledby="catalog-title" tabindex="-1">
      <div class="catalog-heading">
        <h1 id="catalog-title" class="sr-only">商品分类</h1>
        <ProductCategoryFilter :category="category" @select-category="selectCategory" />
        <ElTooltip content="在新标签页中查看" :trigger="['hover', 'focus']">
          <RouterLink
            class="view-all"
            :to="viewAllLocation"
            @click="checkCatalogueAccess"
            @auxclick="checkCatalogueAccess"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`${viewAllLabel}（在新标签页中打开）`"
          >
            <span>{{ viewAllLabel }}</span>
            <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
          </RouterLink>
        </ElTooltip>
      </div>

      <section class="catalog-content" :aria-busy="state === 'loading'" aria-label="首页商品">
        <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
          <template v-if="state === 'loading'">正在加载仪器</template>
          <template v-else-if="state === 'success'">已加载 {{ products.length }} 件商品</template>
          <template v-else-if="state === 'empty'">暂无仪器</template>
          <template v-else>仪器加载失败，请重试</template>
        </div>

        <ProductGridSkeleton v-if="state === 'loading'" />
        <div v-else-if="state === 'success'" class="product-grid">
          <ProductCard v-for="product in products" :key="product.id" :product="product" />
        </div>
        <div v-else-if="state === 'empty'" class="catalog-state">
          <ElIcon class="state-icon" aria-hidden="true"><Box /></ElIcon>
          <p class="state-title">暂无仪器</p>
        </div>
        <div v-else class="catalog-state">
          <ElIcon class="state-icon" aria-hidden="true"><Warning /></ElIcon>
          <p class="state-title">仪器加载失败，请重试</p>
          <p v-if="errorKind === 'contract'" class="state-description">{{ errorMessage }}</p>
          <ElButton class="retry-button" :icon="RefreshRight" @click="retry">重试</ElButton>
        </div>
      </section>

      <div v-if="state === 'success' && products.length >= 8" class="catalog-actions">
        <ElTooltip content="在新标签页中查看" :trigger="['hover', 'focus']">
          <RouterLink
            class="view-all view-all-bottom"
            :to="viewAllLocation"
            @click="checkCatalogueAccess"
            @auxclick="checkCatalogueAccess"
            target="_blank"
            rel="noopener noreferrer"
            :aria-label="`${viewAllLabel}（在新标签页中打开）`"
          >
            <span>{{ viewAllLabel }}</span>
            <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
          </RouterLink>
        </ElTooltip>
      </div>
    </main>

    <footer class="storefront-footer">经纬智选 · 测绘工具商城</footer>
  </div>
</template>

<style scoped>
.storefront {
  --store-module-inset: 6px;
  width: 100%;
  max-width: 1440px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 26px 80px 24px;
}

.skip-link {
  position: fixed;
  top: -60px;
  left: 24px;
  z-index: 100;
  padding: 12px 20px;
  border-radius: 8px;
  background: var(--store-surface);
}

.skip-link:focus {
  top: 12px;
}

.catalog {
  margin-top: 34px;
  outline: none;
}

.catalog-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 20px;
  padding: 0 var(--store-module-inset);
}

.view-all {
  display: inline-flex;
  flex-shrink: 0;
  gap: 8px;
  height: 40px;
  padding: 0;
  color: var(--store-text);
  font-size: 18px;
  font-weight: 500;
  text-decoration: none;
}

.view-all:hover {
  background: transparent;
  color: var(--store-accent);
}

.view-all:focus-visible {
  outline: 2px solid var(--store-focus);
  outline-offset: 4px;
  border-radius: 4px;
}

.catalog-actions {
  display: flex;
  justify-content: center;
  margin-top: 24px;
}

.view-all.view-all-bottom {
  align-items: center;
  justify-content: center;
  height: 44px;
  margin-left: 0;
  padding: 0 28px;
  border: 1px solid var(--store-border);
  border-radius: 22px;
  background: var(--store-surface);
  font-size: 16px;
}

.view-all-bottom:hover {
  border-color: var(--store-border-hover);
  background: var(--store-selected);
}

.catalog-content {
  display: flex;
  flex-direction: column;
  margin-inline: var(--store-module-inset);
  min-height: 598px;
  padding: 16px;
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}

.catalog :deep(.product-grid) {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  align-items: start;
  align-content: start;
  gap: 12px;
}

.catalog-state {
  display: flex;
  flex-direction: column;
  flex: 1;
  align-items: center;
  justify-content: center;
  padding: 40px 20px;
  text-align: center;
}

.state-icon {
  margin-bottom: 22px;
  color: var(--store-state-icon);
  font-size: 44px;
}

.state-title {
  margin: 0;
  color: var(--store-text);
  font-size: 20px;
  font-weight: 500;
  line-height: 1.6;
}

.state-description {
  margin: 10px 0 0;
  color: var(--store-muted);
  font-size: 15px;
}

.retry-button.el-button {
  height: 40px;
  margin-top: 24px;
  padding: 0 24px;
  border-color: var(--store-border);
  border-radius: 20px;
  color: var(--store-text);
  background: var(--store-surface);
}

.retry-button.el-button:hover {
  background: var(--store-selected);
  border-color: var(--store-border-hover);
}

.storefront-footer {
  margin-top: 28px;
  margin-inline: var(--store-module-inset);
  padding: 30px 0 12px;
  border-top: 1px solid var(--store-border);
  color: var(--store-text);
  font-size: 18px;
  font-weight: 500;
  line-height: 1.5;
}

@media (max-width: 1199px) {
  .storefront {
    padding: 20px 40px 24px;
  }

  .catalog :deep(.product-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }

  .catalog-content {
    min-height: 578px;
  }
}

@media (max-width: 599px) {
  .storefront {
    --store-module-inset: 2px;
    padding: 10px 20px 20px;
  }

  .catalog {
    margin-top: 24px;
  }

  .catalog-heading {
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 18px;
  }

  .catalog-heading :deep(.category-filter) {
    flex-basis: 100%;
  }

  .view-all {
    margin-left: auto;
    gap: 3px;
    height: 36px;
    font-size: 14px;
  }

  .catalog :deep(.product-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 10px;
  }

  .catalog-content {
    min-height: 430px;
    padding: 12px;
  }

  .state-title {
    font-size: 18px;
  }

  .storefront-footer {
    margin-top: 24px;
    padding: 24px 2px 8px;
    font-size: 15px;
  }
}
</style>
