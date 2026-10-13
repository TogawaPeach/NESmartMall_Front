<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElAlert, ElButton, ElIcon, ElInput, ElTooltip } from 'element-plus'
import { Search, ShoppingCart, Tickets, User } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import jingweiLogo from '@/assets/jingwei-logo.svg'
import { productSearchLocation } from '@/constants/productCategories'

const props = defineProps<{
  keyword: string
}>()

const emit = defineEmits<{
  'update:keyword': [value: string]
  'clear-search': []
}>()

const router = useRouter()
const searchInput = ref<InstanceType<typeof ElInput>>()
const showSearchWarning = ref(false)

watch(
  () => props.keyword,
  (value) => {
    if (value.trim()) showSearchWarning.value = false
  },
)

function search() {
  const keyword = props.keyword.trim()
  if (!keyword) {
    showSearchWarning.value = true
    searchInput.value?.focus()
    return
  }
  showSearchWarning.value = false
  const { href } = router.resolve(productSearchLocation(keyword))
  // Open synchronously from the click/Enter gesture so browsers allow the new tab.
  window.open(href, '_blank', 'noopener,noreferrer')
}

const promotionItems = [
  { key: 'flash-sale', label: '限时秒杀' },
  { key: 'coupons', label: '领券中心' },
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
  search()
}
</script>

<template>
  <header class="storefront-header">
    <nav class="storefront-navigation" aria-label="商城导航">
      <RouterLink class="storefront-brand" :to="{ name: 'home' }" aria-label="经纬智选首页">
        <img class="brand-logo" :src="jingweiLogo" alt="经纬智选" width="64" height="56" />
      </RouterLink>

      <div class="promotion-navigation" role="group" aria-label="商城活动">
        <ElTooltip
          v-for="item in promotionItems"
          :key="item.key"
          :content="`${item.label} · 暂未开放`"
          :trigger="['hover', 'focus']"
          placement="bottom"
          :show-after="150"
        >
          <ElButton
            class="promotion-button"
            :class="{ 'promotion-button--sale': item.key === 'flash-sale' }"
            :aria-label="`${item.label} · 暂未开放`"
            aria-disabled="true"
          >
            {{ item.label }}
          </ElButton>
        </ElTooltip>
      </div>

      <ElInput
        ref="searchInput"
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
            aria-label="搜索商品（在新标签页中打开）"
            @click="search"
          >
            <ElIcon aria-hidden="true"><Search /></ElIcon>
          </button>
        </template>
      </ElInput>

      <ElTooltip
        content="AI 导购 · 暂未开放"
        :trigger="['hover', 'focus']"
        placement="bottom"
        :show-after="150"
      >
        <ElButton class="ai-guide-button" aria-label="AI 导购 · 暂未开放" aria-disabled="true">
          AI 导购
        </ElButton>
      </ElTooltip>

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
    <ElAlert
      v-if="showSearchWarning"
      class="search-warning"
      title="请输入搜索词"
      type="warning"
      center
      show-icon
      :closable="false"
    />
  </header>
</template>

<style scoped>
.storefront-header {
  margin-inline: var(--store-module-inset, 0px);
}

.search-warning {
  margin-top: 12px;
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

.ai-guide-button,
.promotion-button {
  --el-button-text-color: #23282d;
  --el-button-bg-color: #fff;
  --el-button-border-color: #e3e6e8;
  --el-button-hover-text-color: #23282d;
  --el-button-hover-bg-color: #f7f8f8;
  --el-button-hover-border-color: #cbd5dc;
  --el-button-active-text-color: #23282d;
  --el-button-active-bg-color: #f7f8f8;
  --el-button-active-border-color: #cbd5dc;
  flex-shrink: 0;
  width: 100px;
  height: 40px;
  margin: 0;
  padding: 0 16px;
  border-radius: 24px;
  font-size: 14px;
  font-weight: 500;
  white-space: nowrap;
  cursor: default;
}

.promotion-navigation {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 12px;
}

.promotion-button--sale {
  --el-button-text-color: #9a4a35;
  --el-button-bg-color: #fff5f0;
  --el-button-border-color: #ecd5cc;
  --el-button-hover-text-color: #9a4a35;
  --el-button-hover-bg-color: #fff0e8;
  --el-button-hover-border-color: #dfbba9;
  --el-button-active-text-color: #9a4a35;
  --el-button-active-bg-color: #fff0e8;
  --el-button-active-border-color: #dfbba9;
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
.ai-guide-button:focus-visible,
.promotion-button:focus-visible,
.utility-button:focus-visible,
.search-submit:focus-visible {
  outline: 2px solid #899ca9;
  outline-offset: 3px;
}

@media (max-width: 1023px) {
  .storefront-navigation {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 16px 12px;
    padding: 10px;
    border-radius: 26px;
  }

  .storefront-brand {
    grid-column: 1;
    grid-row: 1;
    justify-self: start;
  }

  .ai-guide-button {
    grid-column: 2;
    grid-row: 1;
    justify-self: end;
  }

  .promotion-navigation {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    grid-column: 1 / -1;
    grid-row: 2;
  }

  .promotion-button {
    width: 100%;
    min-width: 0;
  }

  .product-search {
    grid-column: 1;
    grid-row: 3;
    width: 100%;
    max-width: 200px;
    min-width: 0;
    margin: 0;
  }

  .utility-navigation {
    grid-column: 2;
    grid-row: 3;
    gap: 2px;
  }

  .utility-button {
    width: 34px;
    font-size: 23px;
  }
}
</style>
