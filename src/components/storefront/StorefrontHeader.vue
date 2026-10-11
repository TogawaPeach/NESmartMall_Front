<script setup lang="ts">
import { ElButton, ElIcon, ElInput, ElTooltip } from 'element-plus'
import { Search, ShoppingCart, Tickets, User } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import type { ProductCategoryKey } from '@/types/product'
import jingweiLogo from '@/assets/jingwei-logo.png'

defineProps<{
  category: ProductCategoryKey
  keyword: string
}>()

const emit = defineEmits<{
  'select-category': [category: ProductCategoryKey]
  'update:keyword': [value: string]
  search: []
  'clear-search': []
}>()

const router = useRouter()

const categories: { key: ProductCategoryKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'total-station', label: '全站仪' },
  { key: 'gnss-rtk', label: 'GNSS / RTK' },
  { key: 'level', label: '水准仪' },
  { key: 'distance-meter', label: '测距仪' },
  { key: 'accessory', label: '配件' },
]

const utilityItems = [
  { route: 'orders', label: '我的订单', icon: Tickets },
  { route: 'cart', label: '购物车', icon: ShoppingCart },
  { route: 'account', label: '用户入口', icon: User },
]

function utilityLabel(route: string, label: string) {
  return router.hasRoute(route) ? label : `${label} · 暂未开放`
}

function openUtility(route: string) {
  if (router.hasRoute(route)) {
    void router.push({ name: route })
  }
}

function handleSearchEnter(event: KeyboardEvent | Event) {
  if (!(event instanceof KeyboardEvent) || event.isComposing || event.keyCode === 229) return
  event.preventDefault()
  emit('search')
}
</script>

<template>
  <header class="storefront-header">
    <nav class="storefront-navigation" aria-label="商城导航">
      <RouterLink class="storefront-brand" :to="{ name: 'home' }" aria-label="经纬智选首页">
        <img class="brand-logo" :src="jingweiLogo" alt="经纬智选" width="64" height="56" />
      </RouterLink>

      <div class="category-navigation" role="group" aria-label="商品分类">
        <div class="category-box">
          <ElButton
            v-for="item in categories"
            :key="item.key"
            class="category-button"
            :class="{ 'is-selected': category === item.key }"
            :aria-pressed="category === item.key"
            @click="emit('select-category', item.key)"
          >
            {{ item.label }}
          </ElButton>
        </div>
      </div>

      <ElInput
        id="storefront-product-search"
        class="product-search"
        :model-value="keyword"
        placeholder="搜索商品或型号"
        aria-label="搜索商品或型号"
        clearable
        @update:model-value="emit('update:keyword', $event)"
        @keydown.enter="handleSearchEnter"
        @clear="emit('clear-search')"
      >
        <template #prefix>
          <button
            class="search-submit"
            type="button"
            aria-label="搜索当前分类商品"
            @click="emit('search')"
          >
            <ElIcon aria-hidden="true"><Search /></ElIcon>
          </button>
        </template>
      </ElInput>

      <div class="utility-navigation" role="group" aria-label="个人入口">
        <ElTooltip
          v-for="item in utilityItems"
          :key="item.route"
          :content="utilityLabel(item.route, item.label)"
          :trigger="['hover', 'focus']"
          placement="bottom"
          :show-after="150"
        >
          <ElButton
            class="utility-button"
            :aria-label="utilityLabel(item.route, item.label)"
            :aria-disabled="!router.hasRoute(item.route)"
            @click="openUtility(item.route)"
          >
            <ElIcon aria-hidden="true"><component :is="item.icon" /></ElIcon>
          </ElButton>
        </ElTooltip>
      </div>
    </nav>
  </header>
</template>

<style scoped>
.storefront-header {
  width: 100%;
}

.storefront-navigation {
  display: flex;
  align-items: center;
  gap: 20px;
  min-height: 90px;
  padding: 18px 36px;
  border: 1px solid #e3e6e8;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 8px 24px rgb(35 40 45 / 4%);
}

.storefront-brand {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  width: 72px;
  height: 54px;
  text-decoration: none;
}

.brand-logo {
  display: block;
  width: 64px;
  height: 54px;
  object-fit: contain;
}

.category-navigation {
  display: flex;
  flex: 1;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}

.category-box {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: max-content;
  margin-inline: auto;
  gap: 6px;
  padding: 4px;
  border: 1px solid #e3e6e8;
  border-radius: 28px;
  background: #fafbfb;
}

.category-button {
  --el-button-text-color: #23282d;
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-text-color: #23282d;
  --el-button-hover-bg-color: #f4f6f7;
  --el-button-hover-border-color: transparent;
  --el-button-active-text-color: #23282d;
  --el-button-active-bg-color: #edf2f5;
  --el-button-active-border-color: transparent;
  flex-shrink: 0;
  height: 40px;
  margin: 0;
  padding: 0 14px;
  border-radius: 24px;
  font-size: 17px;
  font-weight: 500;
}

.category-button.is-selected {
  --el-button-bg-color: #edf2f5;
  --el-button-hover-bg-color: #edf2f5;
  font-weight: 600;
}

.product-search {
  --el-input-border-color: #e3e6e8;
  --el-input-hover-border-color: #b4c0c8;
  --el-input-focus-border-color: #899ca9;
  --el-input-bg-color: #f7f8f8;
  --el-input-text-color: #23282d;
  --el-input-placeholder-color: #646d75;
  flex: 0 0 200px;
  width: 200px;
  height: 40px;
  margin-left: auto;
}

.product-search :deep(.el-input__wrapper) {
  padding: 0 12px;
  border-radius: 24px;
}

.product-search :deep(.el-input__inner) {
  height: 40px;
  font-size: 13px;
}

.search-submit {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 30px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: #23282d;
  font-size: 20px;
  cursor: pointer;
}

.utility-navigation {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.utility-button {
  --el-button-text-color: #23282d;
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-text-color: #23282d;
  --el-button-hover-bg-color: #edf2f5;
  --el-button-hover-border-color: transparent;
  --el-button-active-text-color: #23282d;
  --el-button-active-bg-color: #edf2f5;
  --el-button-active-border-color: transparent;
  width: 36px;
  height: 40px;
  margin: 0;
  padding: 0;
  border-radius: 12px;
  font-size: 25px;
}

/* Keep unavailable entries focusable so keyboard users can read their tooltip. */
.utility-button[aria-disabled='true'] {
  cursor: default;
}

.storefront-brand:focus-visible,
.category-button:focus-visible,
.utility-button:focus-visible,
.search-submit:focus-visible {
  outline: 2px solid #899ca9;
  outline-offset: 3px;
}

@media (max-width: 1279px) {
  .storefront-navigation {
    flex-wrap: wrap;
    gap: 14px;
    padding: 18px 28px;
    border-radius: 32px;
  }

  .category-navigation {
    flex: 1 1 calc(100% - 140px);
  }

  .product-search {
    margin-left: auto;
  }
}

@media (max-width: 1023px) {
  .storefront-navigation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px 12px;
    padding: 20px;
    border-radius: 26px;
  }

  .storefront-brand {
    grid-column: 1 / -1;
    justify-self: start;
  }

  .category-navigation {
    grid-column: 1 / -1;
    overflow-x: auto;
    padding: 3px;
    margin: -3px;
    scrollbar-width: thin;
    scrollbar-color: #dce2e6 transparent;
  }

  .category-box {
    gap: 4px;
  }

  .category-button {
    height: 40px;
    padding: 0 12px;
    font-size: 14px;
  }

  .product-search {
    width: 100%;
    max-width: 200px;
    min-width: 0;
    margin: 0;
  }

  .utility-navigation {
    gap: 2px;
  }

  .utility-button {
    width: 34px;
    font-size: 23px;
  }
}
</style>
