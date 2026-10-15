<script setup lang="ts">
import { computed } from 'vue'
import { ElIcon, ElImage } from 'element-plus'
import { Picture } from '@element-plus/icons-vue'
import type { CartItem } from '@/types/cart'
import { cartItemIssue, cartSubtotal } from '@/utils/cart'
import { formatPriceFen } from '@/utils/price'

const props = defineProps<{ item: CartItem; selected: boolean }>()
const emit = defineEmits<{ select: [selected: boolean] }>()
const issue = computed(() => cartItemIssue(props.item))
const subtotal = computed(() => cartSubtotal(props.item))
const hasDetail = computed(() => ['AVAILABLE', 'OUT_OF_STOCK'].includes(props.item.availability))
function changeSelection(event: Event) {
  emit('select', (event.target as HTMLInputElement).checked)
}
</script>

<template>
  <article
    class="cart-row"
    :class="{ 'cart-row--selected': selected }"
    :aria-label="item.name || '已失效商品'"
  >
    <input
      class="cart-checkbox"
      type="checkbox"
      :checked="selected"
      :disabled="issue !== null"
      :aria-label="`选择${item.name || '已失效商品'}`"
      :aria-describedby="`cart-status-${item.cartItemId}`"
      @change="changeSelection"
    />
    <div class="item-product">
      <component
        :is="hasDetail ? 'RouterLink' : 'div'"
        :to="hasDetail ? { name: 'product-detail', params: { id: item.productId } } : undefined"
        :target="hasDetail ? '_blank' : undefined"
        :rel="hasDetail ? 'noopener noreferrer' : undefined"
        class="item-cover"
        :aria-label="hasDetail ? `${item.name}（在新标签页中打开）` : undefined"
      >
        <ElImage
          v-if="item.imageUrl"
          :key="item.imageUrl"
          :src="item.imageUrl"
          :alt="item.name || '商品图片'"
          fit="contain"
        >
          <template #placeholder
            ><span class="image-placeholder"
              ><ElIcon><Picture /></ElIcon></span
          ></template>
          <template #error
            ><span class="image-placeholder"
              ><ElIcon><Picture /></ElIcon><span>暂无图片</span></span
            ></template
          >
        </ElImage>
        <span v-else class="image-placeholder"
          ><ElIcon><Picture /></ElIcon><span>暂无图片</span></span
        >
      </component>
      <div class="item-information">
        <h2>
          <RouterLink
            v-if="hasDetail"
            :to="{ name: 'product-detail', params: { id: item.productId } }"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ item.name }}<span class="sr-only">（在新标签页中打开）</span>
          </RouterLink>
          <template v-else>{{ item.name || '已失效商品' }}</template>
        </h2>
        <p v-if="item.model" class="item-model">型号：{{ item.model }}</p>
        <p
          :id="`cart-status-${item.cartItemId}`"
          class="item-status"
          :class="{ 'item-status--issue': issue }"
        >
          {{ issue || '有货'
          }}<span v-if="item.stock !== null && item.availability === 'AVAILABLE'">
            · 库存 {{ item.stock }} 件</span
          >
        </p>
      </div>
    </div>
    <div class="item-price">
      <span class="mobile-label">单价</span
      ><span v-if="item.priceFen !== null">¥{{ formatPriceFen(item.priceFen) }}</span
      ><span v-else>价格待确认</span>
    </div>
    <div class="item-quantity">
      <span class="mobile-label">数量</span><span>× {{ item.quantity }}</span>
    </div>
    <div class="item-subtotal">
      <span class="mobile-label">参考小计</span
      ><strong v-if="subtotal !== null">¥{{ formatPriceFen(subtotal) }}</strong
      ><span v-else>{{ item.availability === 'AVAILABLE' ? '待确认' : '—' }}</span>
    </div>
  </article>
</template>

<style scoped>
.cart-row {
  display: grid;
  grid-template-columns: 24px minmax(0, 1fr) minmax(120px, 0.3fr) 80px minmax(140px, 0.32fr);
  gap: 20px;
  align-items: center;
  padding: 26px 24px;
  border-top: 1px solid var(--store-border);
  transition: background 0.15s;
}
.cart-row--selected {
  background: var(--store-selected);
}
.cart-checkbox {
  width: 18px;
  height: 18px;
  margin: 0;
  accent-color: var(--store-accent);
  cursor: pointer;
}
.cart-checkbox:disabled {
  cursor: not-allowed;
}
.item-product {
  display: flex;
  gap: 20px;
  align-items: center;
  min-width: 0;
}
.item-cover {
  display: block;
  flex: 0 0 96px;
  width: 96px;
  height: 96px;
  overflow: hidden;
  border: 1px solid var(--store-border);
  border-radius: 10px;
  background: var(--store-background);
}
.item-cover :deep(.el-image) {
  display: block;
  width: 100%;
  height: 100%;
}
.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  width: 100%;
  height: 100%;
  color: var(--store-placeholder);
  font-size: 12px;
}
.image-placeholder .el-icon {
  font-size: 26px;
}
.item-information {
  min-width: 0;
}
h2 {
  margin: 0;
  color: var(--store-text);
  font-size: 16px;
  font-weight: 550;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
h2 a:hover {
  color: var(--store-accent);
  text-decoration: underline;
}
.item-model,
.item-status {
  margin: 7px 0 0;
  color: var(--store-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.item-status--issue {
  color: var(--store-sale-text);
}
.item-price,
.item-quantity,
.item-subtotal {
  font-size: 14px;
  overflow-wrap: anywhere;
  font-variant-numeric: tabular-nums;
}
.item-quantity {
  text-align: center;
}
.item-subtotal {
  text-align: right;
}
.item-subtotal strong {
  font-weight: 600;
}
.mobile-label {
  display: none;
}
@media (max-width: 900px) {
  .cart-row {
    grid-template-columns: 20px minmax(0, 1fr);
    gap: 12px 14px;
    padding: 20px 16px;
    align-items: start;
  }
  .cart-checkbox {
    margin-top: 3px;
  }
  .item-product {
    gap: 14px;
  }
  .item-cover {
    flex-basis: 76px;
    width: 76px;
    height: 76px;
  }
  .item-price,
  .item-quantity,
  .item-subtotal {
    grid-column: 2;
    display: flex;
    justify-content: space-between;
    gap: 16px;
    text-align: right;
  }
  .mobile-label {
    display: inline;
    flex-shrink: 0;
    color: var(--store-muted);
  }
  h2 {
    font-size: 15px;
  }
}
</style>
