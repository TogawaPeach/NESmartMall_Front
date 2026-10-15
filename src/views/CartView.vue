<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElCheckbox, ElIcon, ElSkeleton } from 'element-plus'
import { ShoppingCart, RefreshRight, User, Warning } from '@element-plus/icons-vue'
import StorefrontHeader from '@/components/storefront/StorefrontHeader.vue'
import CartItemRow from '@/components/storefront/CartItemRow.vue'
import { useCart } from '@/composables/useCart'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import { formatPriceFen } from '@/utils/price'

const keyword = ref('')
const loginPrompt = useLoginPromptStore()
const {
  items,
  state,
  selectedIds,
  selectedCount,
  selectedQuantity,
  totalFen,
  allSelected,
  partiallySelected,
  selectableItems,
  setSelected,
  selectAll,
  retry,
} = useCart()
const stateCopy = computed(() => {
  switch (state.value) {
    case 'login-required':
      return { title: '登录后查看你的购物车', description: '登录账号，查看已加入购物车的商品。' }
    case 'empty':
      return { title: '购物车还是空的', description: '去发现适合你的测绘好物吧。' }
    case 'forbidden':
      return { title: '暂时无法查看购物车', description: '当前账号没有访问购物车的权限。' }
    case 'unavailable':
      return { title: '购物车接口暂未开放', description: '购物车服务准备中，请稍后重试。' }
    default:
      return { title: '购物车加载失败', description: '暂时未能获取购物车，请稍后重试。' }
  }
})
</script>

<template>
  <div class="storefront cart-page">
    <a class="skip-link" href="#cart-main">跳转到购物车</a>
    <StorefrontHeader v-model:keyword="keyword" />
    <main
      id="cart-main"
      class="cart-main"
      tabindex="-1"
      aria-labelledby="cart-title"
      :aria-busy="state === 'loading'"
    >
      <nav class="breadcrumb" aria-label="当前位置">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink><span aria-hidden="true">/</span
        ><span aria-current="page">购物车</span>
      </nav>
      <div class="cart-heading">
        <div>
          <h1 id="cart-title">
            购物车<span v-if="state === 'success'" class="item-count"
              >{{ items.length }} 款商品</span
            >
          </h1>
        </div>
        <ElButton
          v-if="state === 'success'"
          class="refresh-button"
          :icon="RefreshRight"
          @click="retry"
          >刷新购物车</ElButton
        >
      </div>
      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{
          state === 'loading'
            ? '正在加载购物车'
            : state === 'success'
              ? `已加载 ${items.length} 款商品`
              : stateCopy.title
        }}
      </div>

      <section class="cart-content" aria-label="购物车商品">
        <div v-if="state === 'loading'" class="cart-loading"><ElSkeleton :rows="8" animated /></div>
        <template v-else-if="state === 'success'">
          <div class="cart-table-heading">
            <ElCheckbox
              :model-value="allSelected"
              :indeterminate="partiallySelected"
              :disabled="!selectableItems.length"
              @change="selectAll($event === true)"
              >全选</ElCheckbox
            >
            <span class="product-heading">商品信息</span><span>单价</span
            ><span class="quantity-heading">数量</span
            ><span class="subtotal-heading">参考小计</span>
          </div>
          <CartItemRow
            v-for="item in items"
            :key="item.cartItemId"
            :item="item"
            :selected="selectedIds.has(item.cartItemId)"
            @select="setSelected(item.cartItemId, $event)"
          />
        </template>
        <div v-else class="cart-state">
          <ElIcon class="state-icon" aria-hidden="true"
            ><User v-if="state === 'login-required'" /><ShoppingCart
              v-else-if="state === 'empty'" /><Warning v-else
          /></ElIcon>
          <h2>{{ stateCopy.title }}</h2>
          <p>{{ stateCopy.description }}</p>
          <ElButton
            v-if="state === 'login-required'"
            class="state-button"
            @click="loginPrompt.openLogin('登录后即可查看购物车')"
            >立即登录</ElButton
          >
          <RouterLink v-else-if="state === 'empty'" class="browse-link" :to="{ name: 'home' }"
            >去逛逛</RouterLink
          >
          <ElButton v-else class="state-button" :icon="RefreshRight" @click="retry"
            >重新加载</ElButton
          >
        </div>
      </section>

      <section v-if="state === 'success'" class="cart-summary" aria-label="已选商品合计">
        <div class="summary-selection">
          <ElCheckbox
            :model-value="allSelected"
            :indeterminate="partiallySelected"
            :disabled="!selectableItems.length"
            @change="selectAll($event === true)"
            >全选</ElCheckbox
          ><span
            >已选 <strong>{{ selectedCount }}</strong> 款<span v-if="selectedQuantity !== null">
              / {{ selectedQuantity }} 件</span
            ></span
          >
        </div>
        <div class="summary-total" role="status" aria-live="polite" aria-atomic="true">
          <div>
            <span class="total-label">合计</span
            ><strong v-if="totalFen !== null" class="total-price"
              ><span>¥</span>{{ formatPriceFen(totalFen) }}</strong
            ><strong v-else class="total-pending">金额待确认</strong>
          </div>
          <p>
            {{
              totalFen === null
                ? '所选金额超出可计算范围，请减少勾选商品'
                : '参考金额，实际金额以提交购买时为准'
            }}
          </p>
        </div>
        <ElButton class="purchase-button" disabled>立即购买 · 暂未开放</ElButton>
      </section>
      <p v-if="state === 'success'" class="cart-note">
        勾选商品可查看合计；暂不支持修改数量、删除商品和提交购买。
      </p>
    </main>
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
  z-index: 10;
  padding: 10px 16px;
  border-radius: 10px;
  background: var(--store-text);
  color: var(--store-surface);
}
.skip-link:focus {
  top: 12px;
}
.cart-main {
  margin: 34px var(--store-module-inset) 0;
  outline: none;
}
.breadcrumb {
  display: flex;
  gap: 12px;
  align-items: center;
  color: var(--store-muted);
  font-size: 14px;
}
.breadcrumb a:hover {
  color: var(--store-text);
}
.cart-heading {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  margin: 26px 0;
}
h1 {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 16px;
  margin: 0;
  font-size: 28px;
  font-weight: 600;
}
.item-count {
  color: var(--store-muted);
  font-size: 14px;
  font-weight: 400;
}
.refresh-button {
  flex-shrink: 0;
  border-radius: 20px;
}
.cart-content {
  overflow: hidden;
  border: 1px solid var(--store-border);
  border-radius: 14px;
  background: var(--store-surface);
}
.cart-table-heading {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) minmax(120px, 0.3fr) 80px minmax(140px, 0.32fr);
  gap: 20px;
  align-items: center;
  min-height: 60px;
  padding: 12px 24px;
  background: var(--store-filter-background);
  color: var(--store-muted);
  font-size: 13px;
}
.cart-table-heading .el-checkbox {
  grid-column: 1 / 3;
  grid-row: 1;
  width: max-content;
}
.product-heading {
  grid-column: 2;
  grid-row: 1;
  padding-left: 60px;
}
.quantity-heading {
  text-align: center;
}
.subtotal-heading {
  text-align: right;
}
.cart-loading {
  padding: 36px;
  min-height: 400px;
}
.cart-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  padding: 40px 24px;
  text-align: center;
}
.state-icon {
  margin-bottom: 22px;
  color: var(--store-state-icon);
  font-size: 48px;
}
.cart-state h2 {
  margin: 0;
  font-size: 21px;
  font-weight: 500;
}
.cart-state p {
  margin: 12px 0 26px;
  color: var(--store-muted);
  font-size: 14px;
  line-height: 1.7;
}
.state-button,
.browse-link {
  min-height: 40px;
  padding: 9px 24px;
  border: 1px solid var(--store-border);
  border-radius: 22px;
  background: var(--store-surface);
  font-size: 14px;
}
.browse-link:hover {
  background: var(--store-selected);
}
.cart-summary {
  position: sticky;
  bottom: 16px;
  z-index: 2;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 18px 26px;
  margin-top: 22px;
  padding: 22px 24px;
  border: 1px solid var(--store-border);
  border-radius: 14px;
  background: var(--store-surface);
  box-shadow: 0 6px 24px rgb(35 40 45 / 6%);
}
.summary-selection {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px 24px;
  color: var(--store-muted);
  font-size: 14px;
}
.summary-selection strong {
  color: var(--store-text);
}
.summary-total {
  min-width: 0;
  margin-left: auto;
  text-align: right;
}
.summary-total > div {
  display: flex;
  align-items: baseline;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 12px;
}
.total-label {
  font-size: 14px;
}
.total-price {
  color: var(--store-price);
  font-size: 28px;
  font-weight: 600;
  line-height: 1.3;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.total-price > span {
  margin-right: 4px;
  font-size: 18px;
}
.total-pending {
  color: var(--store-sale-text);
  font-size: 18px;
}
.summary-total p {
  margin: 7px 0 0;
  color: var(--store-muted);
  font-size: 12px;
}
.purchase-button {
  height: 44px;
  margin: 0;
  border-radius: 24px;
}
.cart-note {
  margin: 18px 4px 0;
  color: var(--store-muted);
  font-size: 13px;
  line-height: 1.7;
}
@media (max-width: 1199px) {
  .storefront {
    padding: 20px 40px 24px;
  }
}
@media (max-width: 900px) {
  .cart-table-heading {
    display: flex;
    min-height: 54px;
    padding: 10px 16px;
  }
  .cart-table-heading > span {
    display: none;
  }
  .cart-summary {
    gap: 16px;
    padding: 18px 16px;
  }
  .summary-selection {
    width: 100%;
    justify-content: space-between;
  }
  .summary-total {
    margin-left: 0;
    flex: 1;
    text-align: left;
  }
  .summary-total > div {
    justify-content: flex-start;
  }
  .total-price {
    font-size: 24px;
  }
}
@media (max-width: 599px) {
  .storefront {
    --store-module-inset: 2px;
    padding: 10px 20px 20px;
  }
  .cart-main {
    margin-top: 24px;
  }
  .cart-heading {
    align-items: flex-start;
    margin: 22px 0;
  }
  h1 {
    font-size: 24px;
    gap: 10px;
  }
  .refresh-button {
    padding-inline: 10px;
    font-size: 12px;
  }
  .cart-summary {
    position: static;
  }
  .summary-total {
    flex-basis: 100%;
  }
  .purchase-button {
    width: 100%;
  }
}
</style>
