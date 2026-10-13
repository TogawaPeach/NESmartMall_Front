<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElConfigProvider, ElIcon, ElPagination } from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import { Box, RefreshRight, Warning } from '@element-plus/icons-vue'
import StorefrontHeader from '@/components/storefront/StorefrontHeader.vue'
import ProductCategoryFilter from '@/components/storefront/ProductCategoryFilter.vue'
import ProductCard from '@/components/storefront/ProductCard.vue'
import ProductGridSkeleton from '@/components/storefront/ProductGridSkeleton.vue'
import { PRODUCT_PAGE_SIZE } from '@/api/products'
import { productCategoryLabel } from '@/constants/productCategories'
import { useProductList } from '@/composables/useProductList'

const {
  category,
  currentPage,
  keyword,
  products,
  total,
  state,
  errorKind,
  errorMessage,
  selectCategory,
  search,
  clearSearch,
  retry,
} = useProductList()

const title = computed(() =>
  category.value === 'all' ? '全部商品' : productCategoryLabel(category.value),
)
</script>

<template>
  <div class="storefront product-list">
    <a class="skip-link" href="#product-list">跳转到商品列表</a>
    <StorefrontHeader v-model:keyword="keyword" @search="search" @clear-search="clearSearch" />

    <main id="product-list" class="catalog" aria-labelledby="catalog-title" tabindex="-1">
      <nav class="breadcrumb" aria-label="当前位置">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">{{ title }}</span>
      </nav>
      <div class="catalog-title-row">
        <h1 id="catalog-title">{{ title }}</h1>
        <p v-if="total !== null && state !== 'error'" class="product-count">
          共 {{ total }} 件商品
        </p>
      </div>
      <div class="catalog-heading">
        <ProductCategoryFilter :category="category" @select-category="selectCategory" />
      </div>

      <section class="catalog-content" :aria-busy="state === 'loading'" aria-label="商品列表">
        <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
          <template v-if="state === 'loading'">正在加载商品</template>
          <template v-else-if="state === 'success'">
            第 {{ currentPage }} 页，已加载 {{ products.length }} 件商品，共 {{ total }} 件
          </template>
          <template v-else-if="state === 'empty'">暂无商品</template>
          <template v-else>商品加载失败，请重试</template>
        </div>

        <ProductGridSkeleton v-if="state === 'loading'" :count="PRODUCT_PAGE_SIZE" />
        <div v-else-if="state === 'success'" class="product-grid">
          <ProductCard v-for="product in products" :key="product.id" :product="product" />
        </div>
        <div v-else-if="state === 'empty'" class="catalog-state">
          <ElIcon class="state-icon" aria-hidden="true"><Box /></ElIcon>
          <p class="state-title">暂无商品</p>
          <p class="state-description">可以切换分类继续浏览</p>
        </div>
        <div v-else class="catalog-state">
          <ElIcon class="state-icon" aria-hidden="true"><Warning /></ElIcon>
          <p class="state-title">商品加载失败，请重试</p>
          <p v-if="errorKind === 'contract'" class="state-description">{{ errorMessage }}</p>
          <ElButton
            class="retry-button"
            :icon="RefreshRight"
            @click="errorKind === 'contract' && keyword.trim() ? clearSearch() : retry()"
          >
            {{ errorKind === 'contract' && keyword.trim() ? '清空搜索词' : '重试' }}
          </ElButton>
        </div>
      </section>

      <nav
        v-if="state === 'success' && total !== null && total > PRODUCT_PAGE_SIZE"
        class="pagination"
        aria-label="商品分页"
      >
        <ElConfigProvider :locale="zhCn">
          <ElPagination
            v-model:current-page="currentPage"
            :page-size="PRODUCT_PAGE_SIZE"
            :total="total"
            layout="prev, pager, next"
            hide-on-single-page
          />
        </ElConfigProvider>
      </nav>
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
  margin-top: 32px;
  outline: none;
}

.breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 0 var(--store-module-inset);
  color: var(--store-muted);
  font-size: 14px;
}

.breadcrumb a {
  color: var(--store-muted);
  text-decoration: none;
}
.breadcrumb a:hover {
  color: var(--store-text);
}
.breadcrumb a:focus-visible {
  outline: 2px solid #899ca9;
  outline-offset: 4px;
}

.catalog-title-row {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px 20px;
  margin: 20px 0 24px;
  padding: 0 var(--store-module-inset);
}

.catalog-title-row h1 {
  margin: 0;
  color: var(--store-text);
  font-size: 28px;
  font-weight: 600;
}
.product-count {
  margin: 0;
  color: var(--store-muted);
  font-size: 15px;
}
.catalog-heading {
  margin-bottom: 20px;
  padding: 0 var(--store-module-inset);
}

.catalog-content {
  display: flex;
  flex-direction: column;
  min-height: 598px;
  margin-inline: var(--store-module-inset);
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
  flex: 1;
  flex-direction: column;
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

.pagination {
  display: flex;
  justify-content: center;
  margin: 28px var(--store-module-inset) 0;
}

.pagination :deep(.el-pagination) {
  --el-pagination-button-bg-color: transparent;
  gap: 6px;
}
.pagination :deep(.el-pager li),
.pagination :deep(.btn-prev),
.pagination :deep(.btn-next) {
  border-radius: 8px;
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
    margin-top: 26px;
  }
  .catalog :deep(.product-grid) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    gap: 20px;
  }
}

@media (max-width: 599px) {
  .storefront {
    --store-module-inset: 2px;
    padding: 10px 20px 20px;
  }
  .catalog {
    margin-top: 22px;
  }
  .catalog-title-row {
    margin: 16px 0 20px;
  }
  .catalog-title-row h1 {
    font-size: 24px;
  }
  .product-count {
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
  .pagination :deep(.el-pagination) {
    gap: 0;
  }
  .storefront-footer {
    margin-top: 32px;
    padding: 24px 2px 8px;
    font-size: 15px;
  }
}
</style>
