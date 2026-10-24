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
import { storeToRefs } from 'pinia'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import { useOrderEntry } from '@/composables/useOrderEntry'

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
const loginPrompt = useLoginPromptStore()
const { openOrders } = useOrderEntry()
const { visible: showLogin } = storeToRefs(loginPrompt)
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
  if (!loginPrompt.requireLogin('登录后即可搜索商品')) return
  if (props.searchInPlace) {
    emit('search', keyword)
    return
  }
  const { href } = router.resolve(productSearchLocation(keyword))
  // Open synchronously from the click/Enter gesture so browsers allow the new tab.
  window.open(href, '_blank', 'noopener,noreferrer')
}

const utilityItems = [
  { route: 'orders', label: '我的订单', icon: Tickets },
  { route: 'cart', label: '购物车', icon: ShoppingCart },
]

function utilityLabel(route: string, label: string) {
  return router.hasRoute(route) ? label : `${label} · 暂未开放`
}

function openUtility(route: string) {
  if (route === 'orders') {
    openOrders()
    return
  }
  if (router.hasRoute(route)) {
    if (!loginPrompt.requireLogin('请先登录账号')) return
    void router.push({ name: route })
  }
}

function openFlashSale() {
  if (!loginPrompt.requireLogin('登录后即可查看秒杀商品')) return
  void router.push({ name: 'flash-sale' })
}

function accountCommand(command: string) {
  if (command === 'merchant' && auth.user?.role === 0) {
    void router.push({ name: 'merchant-products' })
  } else if (command === 'logout') {
    auth.logout()
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
        <ElButton
          class="promotion-button promotion-button--sale promotion-link"
          :aria-haspopup="!auth.isAuthenticated ? 'dialog' : undefined"
          @click="openFlashSale"
        >
          限时秒杀
        </ElButton>
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

      <div class="utility-navigation" role="group" aria-label="个人入口">
        <ElTooltip
          v-for="item in utilityItems"
          :key="item.route"
          :content="utilityLabel(item.route, item.label)"
          :trigger="['hover', 'focus']"
          placement="bottom"
          :show-after="150"
        >
          <RouterLink
            v-if="item.route === 'cart'"
            class="utility-button cart-link"
            :to="{ name: 'cart' }"
            aria-label="购物车"
          >
            <ElIcon aria-hidden="true"><ShoppingCart /></ElIcon>
          </RouterLink>
          <ElButton
            v-else
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
          content="登录"
          :trigger="['hover', 'focus']"
          placement="bottom"
          :show-after="150"
        >
          <ElButton
            class="utility-button"
            aria-label="登录"
            aria-haspopup="dialog"
            @click="loginPrompt.openLogin()"
          >
            <ElIcon aria-hidden="true"><User /></ElIcon>
          </ElButton>
        </ElTooltip>
        <ElDropdown v-else trigger="click" placement="bottom-end" @command="accountCommand">
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
              <ElDropdownItem v-if="auth.user?.role === 0" command="merchant" divided
                >商家工作台</ElDropdownItem
              >
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
    <LoginDialog v-model="showLogin" :description="loginPrompt.reason" />
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

.promotion-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-button-border-color);
  color: var(--el-button-text-color);
  background: var(--el-button-bg-color);
  cursor: pointer;
}

.promotion-link:hover,
.promotion-link.router-link-active {
  border-color: var(--el-button-hover-border-color);
  background: var(--el-button-hover-bg-color);
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

.cart-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--store-text);
}

.cart-link:hover {
  background: var(--store-selected);
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

  .promotion-navigation {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
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
