<script setup lang="ts">
import { computed } from 'vue'
import { useRouter } from 'vue-router'
import { ElButton, ElIcon, ElTooltip } from 'element-plus'
import { ArrowRight, Box, RefreshRight, Warning } from '@element-plus/icons-vue'
import StorefrontHeader from '@/components/storefront/StorefrontHeader.vue'
import ProductCategoryFilter from '@/components/storefront/ProductCategoryFilter.vue'
import ProductCard from '@/components/storefront/ProductCard.vue'
import ProductGridSkeleton from '@/components/storefront/ProductGridSkeleton.vue'
import { useHomeProducts } from '@/composables/useHomeProducts'

const router = useRouter()
const {
  category,
  keyword,
  products,
  state,
  errorKind,
  errorMessage,
  selectCategory,
  search,
  clearSearch,
  retry,
} = useHomeProducts()
const hasProductList = computed(() => router.hasRoute('products'))

function viewAll() {
  if (hasProductList.value) void router.push({ name: 'products' })
}
</script>

<template>
  <div class="storefront">
    <a class="skip-link" href="#catalog">跳转到商品区域</a>
    <StorefrontHeader v-model:keyword="keyword" @search="search" @clear-search="clearSearch" />

    <main id="catalog" class="catalog" aria-labelledby="catalog-title" tabindex="-1">
      <div class="catalog-heading">
        <h1 id="catalog-title" class="sr-only">商品分类</h1>
        <ProductCategoryFilter :category="category" @select-category="selectCategory" />
        <ElTooltip
          :content="hasProductList ? '查看全部商品' : '查看全部 · 暂未开放'"
          :trigger="['hover', 'focus']"
        >
          <ElButton
            text
            class="view-all"
            :aria-disabled="!hasProductList"
            :aria-label="hasProductList ? '查看全部商品' : '查看全部商品，暂未开放'"
            @click="viewAll"
          >
            <span>查看全部</span>
            <ElIcon aria-hidden="true"><ArrowRight /></ElIcon>
          </ElButton>
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
    </main>

    <footer class="storefront-footer">经纬智选 · 测绘工具商城</footer>
  </div>
</template>

<style scoped>
.storefront {
  --store-module-inset: 12px;
  max-width: 1584px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 32px 64px 24px;
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
  margin-top: 41px;
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

.view-all.el-button {
  display: inline-flex;
  flex-shrink: 0;
  gap: 8px;
  height: 40px;
  padding: 0;
  color: var(--store-text);
  font-size: 18px;
  font-weight: 500;
}

.view-all.el-button:not(.is-disabled):hover {
  background: transparent;
  color: #536b7a;
}

.view-all[aria-disabled='true'] {
  cursor: not-allowed;
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
  color: #87949d;
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
  border-color: #cbd5dc;
}

.storefront-footer {
  margin-top: 56px;
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

  .catalog {
    margin-top: 30px;
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
    margin-top: 21px;
  }

  .catalog-heading {
    flex-wrap: wrap;
    gap: 12px;
    margin-bottom: 18px;
  }

  .catalog-heading :deep(.category-filter) {
    flex-basis: 100%;
  }

  .view-all.el-button {
    margin-left: auto;
    gap: 3px;
    height: 36px;
    font-size: 14px;
  }

  .catalog :deep(.product-grid) {
    grid-template-columns: minmax(0, 1fr);
    gap: 16px;
  }

  .catalog-content {
    min-height: 430px;
    padding: 12px;
  }

  .state-title {
    font-size: 18px;
  }

  .storefront-footer {
    margin-top: 32px;
    padding: 24px 2px 8px;
    font-size: 15px;
  }
}
</style>
