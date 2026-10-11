<script setup lang="ts">
import { ElButton, ElIcon, ElInput, ElTooltip } from 'element-plus'
import { Search, ShoppingCart, Tickets, User } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import jingweiLogo from '@/assets/jingwei-logo.svg'

defineProps<{
  keyword: string
}>()

const emit = defineEmits<{
  'update:keyword': [value: string]
  search: []
  'clear-search': []
}>()

const router = useRouter()

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
  min-height: 72px;
  padding: 9px 18px;
  border: 1px solid #e3e6e8;
  border-radius: 999px;
  background: #fff;
  box-shadow: 0 4px 12px rgb(35 40 45 / 4%);
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
.utility-button:focus-visible,
.search-submit:focus-visible {
  outline: 2px solid #899ca9;
  outline-offset: 3px;
}

@media (max-width: 599px) {
  .storefront-navigation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px 12px;
    padding: 10px;
    border-radius: 26px;
  }

  .storefront-brand {
    grid-column: 1 / -1;
    justify-self: start;
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
