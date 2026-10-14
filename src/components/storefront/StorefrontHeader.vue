<script setup lang="ts">
import { ref, watch } from 'vue'
import {
  ElAlert,
  ElButton,
  ElDropdown,
  ElDropdownItem,
  ElDropdownMenu,
  ElIcon,
  ElInput,
  ElTooltip,
} from 'element-plus'
import { Search, ShoppingCart, Tickets, User } from '@element-plus/icons-vue'
import { useRouter } from 'vue-router'
import jingweiLogo from '@/assets/jingwei-logo.svg'
import { productSearchLocation } from '@/constants/productCategories'
import LoginDialog from './LoginDialog.vue'
import { useAuthStore } from '@/stores/auth'

const props = defineProps<{
  keyword: string
  searchInPlace?: boolean
}>()

const emit = defineEmits<{
  'update:keyword': [value: string]
  'clear-search': []
  search: [keyword: string]
}>()

const router = useRouter()
const auth = useAuthStore()
const showLogin = ref(false)
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
  if (props.searchInPlace) {
    emit('search', keyword)
    return
  }
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
            :aria-label="searchInPlace ? '搜索商品' : '搜索商品（在新标签页中打开）'"
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
        <ElTooltip
          v-if="!auth.isAuthenticated"
          content="用户入口 · 登录"
          :trigger="['hover', 'focus']"
          placement="bottom"
          :show-after="150"
        >
          <ElButton
            class="utility-button"
            aria-label="用户入口 · 登录"
            aria-haspopup="dialog"
            @click="showLogin = true"
          >
            <ElIcon aria-hidden="true"><User /></ElIcon>
          </ElButton>
        </ElTooltip>
        <ElDropdown v-else trigger="click" placement="bottom-end" @command="auth.logout()">
          <ElButton
            class="utility-button utility-button--account"
            :aria-label="`${auth.displayName} · 账号菜单`"
          >
            <ElIcon aria-hidden="true"><User /></ElIcon>
            <span class="account-name">{{ auth.displayName }}</span>
          </ElButton>
          <template #dropdown>
            <ElDropdownMenu class="account-dropdown">
              <li class="account-summary" role="presentation">
                <strong>{{ auth.displayName }}</strong>
                <span>{{ auth.user?.account }}</span>
              </li>
              <ElDropdownItem command="logout" divided>退出登录</ElDropdownItem>
            </ElDropdownMenu>
          </template>
        </ElDropdown>
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
    <LoginDialog v-model="showLogin" />
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
  border: 1px solid var(--store-border);
  border-radius: 999px;
  background: var(--store-surface);
  box-shadow: var(--store-header-shadow);
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
  --el-input-border-color: var(--store-border);
  --el-input-hover-border-color: var(--store-input-border-hover);
  --el-input-focus-border-color: var(--store-focus);
  --el-input-bg-color: var(--store-background);
  --el-input-text-color: var(--store-text);
  --el-input-placeholder-color: var(--store-muted);
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
  color: var(--store-text);
  font-size: 20px;
  cursor: pointer;
}

.ai-guide-button,
.promotion-button {
  --el-button-text-color: var(--store-text);
  --el-button-bg-color: var(--store-surface);
  --el-button-border-color: var(--store-border);
  --el-button-hover-text-color: var(--store-text);
  --el-button-hover-bg-color: var(--store-background);
  --el-button-hover-border-color: var(--store-border-hover);
  --el-button-active-text-color: var(--store-text);
  --el-button-active-bg-color: var(--store-background);
  --el-button-active-border-color: var(--store-border-hover);
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
  --el-button-text-color: var(--store-sale-text);
  --el-button-bg-color: var(--store-sale-background);
  --el-button-border-color: var(--store-sale-border);
  --el-button-hover-text-color: var(--store-sale-text);
  --el-button-hover-bg-color: var(--store-sale-hover);
  --el-button-hover-border-color: var(--store-sale-border-hover);
  --el-button-active-text-color: var(--store-sale-text);
  --el-button-active-bg-color: var(--store-sale-hover);
  --el-button-active-border-color: var(--store-sale-border-hover);
}

.utility-navigation {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  gap: 8px;
}

.utility-button {
  --el-button-text-color: var(--store-text);
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-text-color: var(--store-text);
  --el-button-hover-bg-color: var(--store-selected);
  --el-button-hover-border-color: transparent;
  --el-button-active-text-color: var(--store-text);
  --el-button-active-bg-color: var(--store-selected);
  --el-button-active-border-color: transparent;
  width: 36px;
  height: 40px;
  margin: 0;
  padding: 0;
  border-radius: 12px;
  font-size: 25px;
}

.utility-button--account {
  width: auto;
  max-width: 112px;
  padding: 0 8px;
  gap: 5px;
}

.account-name {
  overflow: hidden;
  font-size: 13px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.account-dropdown .account-summary) {
  display: flex;
  flex-direction: column;
  gap: 6px;
  max-width: 260px;
  padding: 10px 18px;
  overflow-wrap: anywhere;
}

:global(.account-dropdown .account-summary strong) {
  color: var(--store-text);
  font-size: 14px;
}

:global(.account-dropdown .account-summary span) {
  color: var(--store-muted);
  font-size: 13px;
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
  outline: 2px solid var(--store-focus);
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

  .utility-button--account {
    padding: 0;
  }

  .account-name {
    display: none;
  }
}
</style>
