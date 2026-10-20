<script setup lang="ts">
import { computed, useId } from 'vue'
import { ElAlert, ElButton, ElDialog } from 'element-plus'
import type { CartItem } from '@/types/cart'
import { formatPriceFen } from '@/utils/price'
import { cartSubtotal } from '@/utils/cart'
import { useCheckoutPayment } from '@/composables/useCheckoutPayment'

const visible = defineModel<boolean>({ required: true })
const receiptFormId = useId()
const props = defineProps<{
  items: CartItem[]
  totalFen: number
  quantity: number
  refreshCart: () => Promise<unknown>
}>()
const {
  confirmVisible,
  loading,
  error,
  order,
  stage,
  recipient,
  requestConfirmation,
  cancel,
  newPurchase,
} = useCheckoutPayment(
  visible,
  () => props.items,
  () => props.refreshCart(),
)
const displayItems = computed(() =>
  props.items.map((item) => ({ ...item, key: item.cartItemId, subtotal: cartSubtotal(item) })),
)
const displayTotalFen = computed(() => order.value?.payableAmountFen ?? props.totalFen)
const blocked = computed(() => loading.value || stage.value === 'unknown')
</script>

<template>
  <ElDialog
    v-model="visible"
    class="checkout-receipt"
    modal-class="checkout-receipt-overlay"
    :title="order ? '订单已创建' : '结算小票'"
    width="380px"
    align-center
    append-to-body
    destroy-on-close
    :show-close="false"
    transition="receipt-rise"
  >
    <template #header="{ titleId }">
      <div class="receipt-topline">
        <button
          class="receipt-close"
          type="button"
          aria-label="关闭结算小票"
          @click="visible = false"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.4" />
          </svg>
        </button>
      </div>
      <div class="receipt-heading">
        <p class="receipt-brand">经纬智选</p>
        <h2 :id="titleId">{{ order ? '订单已创建' : '结算小票' }}</h2>
      </div>
    </template>
    <form :id="receiptFormId" class="receipt-content" @submit.prevent="requestConfirmation()">
      <div v-if="!order" class="receipt-section-label"><span>商品参考明细</span></div>
      <p v-if="order" class="receipt-order-no">订单号：{{ order.orderNo }}</p>
      <ul v-if="!order" class="receipt-items" aria-label="本次结算商品" tabindex="0">
        <li v-for="item in displayItems" :key="item.key" class="receipt-item">
          <div class="receipt-item-description">
            <span class="receipt-item-name">{{ item.name }}</span>
            <span class="receipt-item-meta"
              ><span v-if="item.model">{{ item.model }} · </span>¥{{
                formatPriceFen(item.priceFen!)
              }}
              × {{ item.quantity }}</span
            >
          </div>
          <span class="receipt-item-amount">¥{{ formatPriceFen(item.subtotal!) }}</span>
        </li>
      </ul>
      <div class="receipt-total">
        <div>
          <span>{{ order ? '订单应付金额' : '参考合计金额' }}</span
          ><small v-if="!order">共 {{ displayItems.length }} 款 / {{ props.quantity }} 件</small>
        </div>
        <strong><span>¥</span>{{ formatPriceFen(displayTotalFen) }}</strong>
      </div>
      <fieldset v-if="!order" class="receipt-recipient" :disabled="blocked">
        <legend>收货信息</legend>
        <label for="recipient-name">收货姓名</label>
        <input
          id="recipient-name"
          v-model="recipient.name"
          name="name"
          autocomplete="shipping name"
          maxlength="100"
          required
        />
        <label for="recipient-phone">手机号</label>
        <input
          id="recipient-phone"
          v-model="recipient.phone"
          name="phone"
          type="tel"
          inputmode="tel"
          autocomplete="shipping tel"
          maxlength="32"
          required
        />
        <label for="recipient-address">完整地址</label>
        <textarea
          id="recipient-address"
          v-model="recipient.address"
          name="address"
          autocomplete="shipping street-address"
          maxlength="500"
          rows="2"
          required
        />
      </fieldset>
    </form>
    <template #footer>
      <div class="receipt-actions">
        <ElAlert
          v-if="error"
          class="receipt-action-error"
          :title="error"
          type="warning"
          :closable="false"
          show-icon
          role="alert"
        />
        <button
          class="receipt-pay-button"
          type="submit"
          :form="receiptFormId"
          :disabled="blocked || confirmVisible"
        >
          {{
            loading
              ? '正在创建订单…'
              : stage === 'unknown'
                ? '下单结果暂未确认'
                : order
                  ? '查看创建结果'
                  : '模拟支付'
          }}
          <span>¥{{ formatPriceFen(displayTotalFen) }}</span
          ><span aria-hidden="true">↗</span>
        </button>
        <p v-if="!order" class="receipt-disclaimer">将创建订单，模拟支付不会实际扣款</p>
        <div v-if="stage === 'unknown' || order" class="receipt-recovery">
          <ElButton size="small" @click="props.refreshCart">刷新购物车</ElButton>
          <RouterLink :to="{ name: 'orders' }" @click="visible = false">我的订单</RouterLink>
          <button v-if="order" class="receipt-new-purchase" type="button" @click="newPurchase">
            开始新的购买
          </button>
          <p>购物车清理可能延迟，请以我的订单为准。</p>
        </div>
        <div class="receipt-footer" aria-hidden="true">
          <span></span><span>愿每一份选择，都恰到好处</span><span></span>
        </div>
      </div>
    </template>
  </ElDialog>
  <ElDialog
    :model-value="confirmVisible && visible"
    title="订单创建成功"
    width="min(420px, calc(100vw - 32px))"
    align-center
    append-to-body
    destroy-on-close
    @update:model-value="!$event && cancel()"
  >
    <div v-if="order" class="payment-confirmation" role="status" aria-live="polite">
      <p class="receipt-order-no">订单号：{{ order.orderNo }}</p>
      <p>
        订单应付金额 <strong>¥{{ formatPriceFen(order.payableAmountFen) }}</strong>
      </p>
    </div>
    <RouterLink
      v-if="order"
      :to="{ name: 'order-detail', params: { orderNo: order.orderNo } }"
      @click="visible = false"
      >查看订单</RouterLink
    >
    <template #footer><ElButton type="primary" @click="cancel">关闭</ElButton></template>
  </ElDialog>
</template>

<style scoped>
.receipt-order-no,
.receipt-recipient-snapshot {
  font-size: 12px;
  overflow-wrap: anywhere;
}
.receipt-recipient {
  min-width: 0;
  display: grid;
  gap: 6px;
  margin: 16px 0;
  padding: 0;
  border: 0;
}
.receipt-recipient legend {
  padding: 0 0 8px;
  font-size: 12px;
}
.receipt-recipient label {
  font-size: 11px;
  color: #756a59;
}
.receipt-recipient input,
.receipt-recipient input:focus-visible,
.receipt-recipient textarea:focus-visible {
  outline: 2px solid var(--store-focus-ring);
  outline-offset: -2px;
}
.receipt-action-error {
  margin-bottom: 12px;
}
.receipt-actions {
  margin-top: 12px;
  padding-top: 14px;
  border-top: 1px dashed #cfc5b2;
  color: #443f35;
  text-align: left;
}
.receipt-recipient textarea {
  box-sizing: border-box;
  width: 100%;
  min-height: 36px;
  padding: 7px 9px;
  border: 1px solid #cfc5b2;
  border-radius: 4px;
  background: #fffaf0;
  color: #443f35;
  font: inherit;
  font-size: 13px;
}
.receipt-recipient textarea {
  resize: vertical;
}
.receipt-recovery {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
  margin-top: 14px;
  font-size: 12px;
}
.receipt-recovery button {
  cursor: pointer;
}
.receipt-new-purchase {
  border: 0;
  padding: 0;
  background: transparent;
  color: #454b3d;
  font: inherit;
  text-decoration: underline;
  text-underline-offset: 3px;
}
:deep(.el-alert--warning) {
  --el-color-warning: #79531b;
  --el-color-warning-light-9: #f6eddb;
}
.receipt-recovery p {
  margin: 0;
  color: #756a59;
  font-size: 11px;
}

.payment-confirmation {
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.payment-confirmation strong {
  color: #454b3d;
  font-size: 20px;
  font-variant-numeric: tabular-nums;
}
.payment-demo-note {
  color: #756a59;
  font-size: 12px;
  line-height: 1.7;
}
.receipt-pay-button:disabled {
  opacity: 0.65;
  cursor: wait;
}
.receipt-topline {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  color: #756a59;
  font-size: 11px;
  letter-spacing: 1px;
}
.receipt-close {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  margin: -7px -10px -7px 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: #777063;
  cursor: pointer;
}
.receipt-close:hover {
  background: #eae3d6;
}
.receipt-heading {
  padding: 12px 0 18px;
  text-align: center;
}
.receipt-brand {
  margin: 6px 0;
  color: #3e3b32;
  font-size: 20px;
  font-weight: 600;
  letter-spacing: 5px;
  padding-left: 5px;
}
.receipt-heading h2 {
  margin: 0;
  color: #706858;
  font-size: 12px;
  font-weight: 400;
  letter-spacing: 3px;
}
.receipt-content {
  color: #443f35;
}
.receipt-section-label {
  display: flex;
  justify-content: space-between;
  padding: 12px 0 6px;
  border-top: 1px dashed #cfc5b2;
  color: #756a59;
  font-size: 11px;
  letter-spacing: 1px;
}
.receipt-items {
  max-height: min(160px, 23dvh);
  margin: 0;
  padding: 0 5px 0 0;
  overflow-y: auto;
  list-style: none;
  scrollbar-width: thin;
  scrollbar-color: #d1c6b1 transparent;
}
.receipt-item {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 16px;
  padding: 7px 0;
}
.receipt-item-description {
  min-width: 0;
}
.receipt-item-name {
  display: block;
  font-size: 13px;
  line-height: 1.65;
  overflow-wrap: anywhere;
}
.receipt-item-meta {
  display: block;
  margin-top: 4px;
  color: #756a59;
  font-size: 10px;
  line-height: 1.7;
  overflow-wrap: anywhere;
}
.receipt-item-amount {
  flex-shrink: 0;
  font-family: monospace;
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}
.receipt-total {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  margin-top: 12px;
  padding: 16px 0;
  border-block: 1px dashed #cfc5b2;
}
.receipt-total > div {
  flex-shrink: 0;
  font-size: 12px;
}
.receipt-total small {
  display: block;
  margin-top: 6px;
  color: #756a59;
  font-size: 10px;
}
.receipt-total strong {
  min-width: 0;
  color: #3e3b32;
  font-size: 29px;
  font-weight: 500;
  letter-spacing: -1px;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
  text-align: right;
  line-height: 1.3;
}
.receipt-total strong > span {
  margin-right: 4px;
  font-size: 17px;
}
.receipt-payment {
  padding: 16px 0;
  text-align: center;
}
.receipt-payment-note {
  margin: 8px 0 0;
  color: #756a59;
  font-size: 11px;
  line-height: 1.7;
}
.receipt-pay-button {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  width: 100%;
  min-height: 44px;
  padding: 12px 14px;
  border: 1px solid #454b3d;
  border-radius: 5px;
  background: #454b3d;
  color: #faf6ed;
  font-size: 13px;
  cursor: pointer;
  transition: background 0.2s;
}
.receipt-pay-button:hover {
  background: #59604e;
}
.receipt-pay-button > span:last-child {
  margin-left: auto;
  font-size: 17px;
}
.receipt-pay-button > span {
  overflow-wrap: anywhere;
}
.receipt-disclaimer {
  margin: 10px 0 0;
  color: #756a59;
  font-size: 10px;
  line-height: 1.7;
  text-align: center;
}
.receipt-footer {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 16px;
  color: #756a59;
  font-size: 10px;
  letter-spacing: 1px;
}
.receipt-footer > span:first-child,
.receipt-footer > span:last-child {
  flex: 1;
  height: 1px;
  background: #ddd3bf;
}
.receipt-success-mark {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  margin: 0 auto 10px;
  border: 1px solid #8c987b;
  border-radius: 50%;
  color: #63744e;
  font-size: 18px;
}
.receipt-success-title {
  margin: 0;
  color: #63744e;
  font-size: 13px;
  letter-spacing: 1px;
}
</style>

<style>
.el-dialog.checkout-receipt {
  --el-dialog-bg-color: #f8f2e5;
  --el-dialog-padding-primary: 28px;
  position: relative;
  display: flex;
  flex-direction: column;
  line-height: 1.5;
  width: min(380px, calc(100vw - 40px));
  max-height: calc(100dvh - 64px);
  margin: auto;
  padding: 22px 28px 24px;
  border-radius: 2px 2px 0 0;
  background-color: #f8f2e5;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 160 160' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='paper'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.8' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Cpath fill='%238e7750' opacity='.055' filter='url(%23paper)' d='M0 0h160v160H0z'/%3E%3C/svg%3E");
  box-shadow:
    0 24px 80px rgb(0 0 0 / 22%),
    0 2px 8px rgb(0 0 0 / 7%);
  color-scheme: light;
}
.checkout-receipt::after {
  position: absolute;
  right: 0;
  bottom: -8px;
  left: 0;
  height: 9px;
  background: #f8f2e5;
  clip-path: polygon(
    0 0,
    100% 0,
    100% 20%,
    98% 100%,
    96% 20%,
    94% 100%,
    92% 20%,
    90% 100%,
    88% 20%,
    86% 100%,
    84% 20%,
    82% 100%,
    80% 20%,
    78% 100%,
    76% 20%,
    74% 100%,
    72% 20%,
    70% 100%,
    68% 20%,
    66% 100%,
    64% 20%,
    62% 100%,
    60% 20%,
    58% 100%,
    56% 20%,
    54% 100%,
    52% 20%,
    50% 100%,
    48% 20%,
    46% 100%,
    44% 20%,
    42% 100%,
    40% 20%,
    38% 100%,
    36% 20%,
    34% 100%,
    32% 20%,
    30% 100%,
    28% 20%,
    26% 100%,
    24% 20%,
    22% 100%,
    20% 20%,
    18% 100%,
    16% 20%,
    14% 100%,
    12% 20%,
    10% 100%,
    8% 20%,
    6% 100%,
    4% 20%,
    2% 100%,
    0 20%
  );
  content: '';
}
.checkout-receipt .el-dialog__header {
  flex-shrink: 0;
  margin: 0;
  padding: 0;
}
.checkout-receipt .el-dialog__footer {
  flex-shrink: 0;
  padding: 0;
}
.checkout-receipt .el-dialog__body {
  min-height: 0;
  padding: 0;
  overflow-y: auto;
  line-height: 1.5;
  scrollbar-width: thin;
  scrollbar-color: #d1c6b1 transparent;
}
.checkout-receipt-overlay {
  background: rgb(22 26 24 / 42%);
  backdrop-filter: blur(3px);
}
.checkout-receipt-overlay .el-overlay-dialog {
  padding: 24px 0 32px;
}
.receipt-rise-enter-active {
  transition: opacity 650ms ease;
}
.receipt-rise-leave-active {
  transition: opacity 280ms ease;
}
.receipt-rise-enter-active .checkout-receipt {
  transition:
    transform 800ms cubic-bezier(0.22, 1, 0.36, 1),
    opacity 650ms ease;
}
.receipt-rise-leave-active .checkout-receipt {
  transition:
    transform 280ms ease,
    opacity 250ms ease;
}
.receipt-rise-enter-from,
.receipt-rise-leave-to {
  opacity: 0;
}
.receipt-rise-enter-from .checkout-receipt {
  transform: translateY(70vh);
  opacity: 0;
}
.receipt-rise-leave-to .checkout-receipt {
  transform: translateY(35px);
  opacity: 0;
}
@media (prefers-reduced-motion: reduce) {
  .receipt-rise-enter-active,
  .receipt-rise-leave-active,
  .receipt-rise-enter-active .checkout-receipt,
  .receipt-rise-leave-active .checkout-receipt {
    transition: none;
  }
}
</style>
