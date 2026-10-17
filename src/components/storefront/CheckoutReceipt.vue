<script setup lang="ts">
import { ref, watch } from 'vue'
import { ElDialog } from 'element-plus'
import type { CartItem } from '@/types/cart'
import { formatPriceFen } from '@/utils/price'
import { cartSubtotal } from '@/utils/cart'

const visible = defineModel<boolean>({ required: true })
defineProps<{ items: CartItem[]; totalFen: number; quantity: number }>()
const paid = ref(false)

watch(visible, (opened) => {
  if (opened) paid.value = false
})
</script>

<template>
  <ElDialog
    v-model="visible"
    class="checkout-receipt"
    modal-class="checkout-receipt-overlay"
    :title="paid ? '模拟支付成功' : '结算小票'"
    width="380px"
    align-center
    append-to-body
    destroy-on-close
    :show-close="false"
    transition="receipt-rise"
  >
    <template #header="{ titleId }">
      <div class="receipt-topline">
        <span>一份好物，一张小票</span>
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
        <h2 :id="titleId">{{ paid ? '模拟支付成功' : '结算小票' }}</h2>
        <p class="receipt-english">
          {{ paid ? 'THANK YOU FOR YOUR CHOICE' : 'A LITTLE RECEIPT FOR YOUR FINDS' }}
        </p>
      </div>
    </template>

    <div class="receipt-content">
      <div class="receipt-section-label">
        <span>商品明细</span><span>{{ quantity }} 件好物</span>
      </div>
      <ul class="receipt-items" aria-label="本次结算商品" tabindex="0">
        <li v-for="item in items" :key="item.cartItemId" class="receipt-item">
          <div class="receipt-item-description">
            <span class="receipt-item-name">{{ item.name }}</span>
            <span class="receipt-item-meta">
              <span v-if="item.model">{{ item.model }} · </span>
              ¥{{ formatPriceFen(item.priceFen!) }} × {{ item.quantity }}
            </span>
          </div>
          <span class="receipt-item-amount">¥{{ formatPriceFen(cartSubtotal(item)!) }}</span>
        </li>
      </ul>

      <div class="receipt-total">
        <div>
          <span>{{ paid ? '演示支付金额' : '合计金额' }}</span
          ><small>共 {{ items.length }} 款 / {{ quantity }} 件</small>
        </div>
        <strong><span>¥</span>{{ formatPriceFen(totalFen) }}</strong>
      </div>

      <div class="receipt-payment" role="status" aria-live="polite">
        <template v-if="paid">
          <div class="receipt-success-mark" aria-hidden="true">✓</div>
          <p class="receipt-success-title">好物已选，心意已收</p>
          <p class="receipt-payment-note">本次为模拟支付，未产生实际扣款</p>
        </template>
        <template v-else>
          <div class="receipt-payment-label">
            <span class="receipt-payment-dot" aria-hidden="true"></span>模拟支付<span
              class="receipt-demo-tag"
              >体验版</span
            >
          </div>
          <p class="receipt-payment-note">确认你的好物，体验一次轻松结算</p>
        </template>
      </div>

      <button
        class="receipt-pay-button"
        type="button"
        @click="paid ? (visible = false) : (paid = true)"
      >
        {{ paid ? '完成，继续逛逛' : '模拟支付' }}
        <span v-if="!paid">¥{{ formatPriceFen(totalFen) }}</span>
        <span aria-hidden="true">↗</span>
      </button>
      <p class="receipt-disclaimer">
        {{ paid ? '购物车商品已保留，期待与你下次相遇' : '仅作支付演示，不会生成订单或实际扣款' }}
      </p>
      <div class="receipt-footer" aria-hidden="true">
        <span></span><span>愿每一份选择，都恰到好处</span><span></span>
      </div>
    </div>
  </ElDialog>
</template>

<style scoped>
.receipt-topline {
  display: flex;
  justify-content: space-between;
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
.receipt-english {
  margin: 8px 0 0;
  color: #756a59;
  font-family: monospace;
  font-size: 9px;
  letter-spacing: 1.1px;
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
.receipt-payment-label {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-size: 12px;
}
.receipt-payment-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: #79816b;
}
.receipt-demo-tag {
  padding: 1px 5px;
  border: 1px solid #d8cebb;
  border-radius: 3px;
  color: #756a59;
  font-size: 9px;
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
