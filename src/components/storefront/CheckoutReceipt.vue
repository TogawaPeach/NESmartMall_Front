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
  refreshCart?: () => Promise<unknown>
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
  confirm,
  refreshPayment,
  paying,
  querying,
  paid,
  canPay,
  uncertain,
  paymentError,
  paymentNotice,
} = useCheckoutPayment(visible, () => props.items, props.refreshCart)
const displayItems = computed(() =>
  props.items.map((item) => ({ ...item, key: item.cartItemId, subtotal: cartSubtotal(item) })),
)
const displayTotalFen = computed(() => order.value?.payableAmountFen ?? props.totalFen)
const blocked = computed(
  () => loading.value || stage.value === 'unknown' || paying.value || querying.value,
)
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
          <ElButton v-if="props.refreshCart" size="small" @click="props.refreshCart"
            >刷新购物车</ElButton
          >
          <RouterLink :to="{ name: 'orders' }" @click="visible = false">我的订单</RouterLink>
          <button
            v-if="order"
            class="receipt-new-purchase"
            type="button"
            :disabled="!props.items.length || paying || querying || uncertain"
            @click="newPurchase"
          >
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
    :title="paid ? '支付成功' : '订单创建成功'"
    width="min(420px, calc(100vw - 32px))"
    align-center
    append-to-body
    destroy-on-close
    @update:model-value="!$event && cancel()"
  >
    <div
      v-if="order"
      class="payment-confirmation"
      role="status"
      aria-live="polite"
      :aria-busy="paying || querying"
    >
      <p class="receipt-order-no">订单号：{{ order.orderNo }}</p>
      <p>
        订单应付金额 <strong>¥{{ formatPriceFen(order.payableAmountFen) }}</strong>
      </p>
      <p>{{ paymentNotice }}</p>
      <ElAlert
        v-if="paymentError"
        :title="paymentError"
        type="warning"
        show-icon
        :closable="false"
      />
    </div>
    <RouterLink
      v-if="order"
      :to="{ name: 'order-detail', params: { orderNo: order.orderNo } }"
      @click="visible = false"
      >查看订单</RouterLink
    >
    <template #footer>
      <ElButton @click="cancel">{{ paid ? '关闭' : '暂不支付' }}</ElButton>
      <ElButton
        v-if="uncertain || paymentError || !canPay"
        :loading="querying"
        :disabled="paying || querying"
        @click="refreshPayment()"
        >刷新订单</ElButton
      >
      <ElButton
        v-if="!paid"
        type="primary"
        :loading="paying"
        :disabled="!canPay || paying || querying"
        @click="confirm"
        >立即支付</ElButton
      >
    </template>
  </ElDialog>
</template>

<style scoped src="@/assets/checkoutReceipt.css"></style>

<style src="@/assets/checkoutReceiptDialog.css"></style>
