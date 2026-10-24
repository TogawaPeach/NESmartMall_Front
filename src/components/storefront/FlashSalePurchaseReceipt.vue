<script setup lang="ts">
import { useId } from 'vue'
import { ElAlert, ElDialog } from 'element-plus'
import type { OrderRecipient } from '@/types/order'
import type { ProductDetail } from '@/types/product'
import { formatPriceFen } from '@/utils/price'

defineProps<{
  visible: boolean
  product: ProductDetail | null
  submitting: boolean
  canPurchase: boolean
  error: string
}>()
const emit = defineEmits<{ close: []; confirm: [] }>()
const recipient = defineModel<OrderRecipient>('recipient', { required: true })
const formId = useId()
</script>

<template>
  <ElDialog
    :model-value="visible"
    class="checkout-receipt"
    modal-class="checkout-receipt-overlay"
    title="秒杀购买小票"
    width="380px"
    align-center
    append-to-body
    destroy-on-close
    :show-close="false"
    :close-on-click-modal="!submitting"
    :close-on-press-escape="!submitting"
    transition="receipt-rise"
    @update:model-value="!$event && emit('close')"
  >
    <template #header="{ titleId }">
      <div class="receipt-topline">
        <button
          class="receipt-close"
          type="button"
          aria-label="关闭购买小票"
          :disabled="submitting"
          @click="emit('close')"
        >
          <svg viewBox="0 0 20 20" width="18" height="18" fill="none" aria-hidden="true">
            <path d="m5 5 10 10M15 5 5 15" stroke="currentColor" stroke-width="1.4" />
          </svg>
        </button>
      </div>
      <div class="receipt-heading">
        <p class="receipt-brand">经纬智选</p>
        <h2 :id="titleId">秒杀购买小票</h2>
      </div>
    </template>
    <form
      :id="formId"
      class="receipt-content"
      :aria-busy="submitting"
      @submit.prevent="emit('confirm')"
    >
      <div class="receipt-section-label"><span>商品参考明细</span></div>
      <ul v-if="product" class="receipt-items" aria-label="本次购买商品" tabindex="0">
        <li class="receipt-item">
          <div class="receipt-item-description">
            <span class="receipt-item-name">{{ product.name }}</span>
            <span class="receipt-item-meta">
              <span v-if="product.model">{{ product.model }} · </span>
              <template v-if="product.priceFen !== null"
                >¥{{ formatPriceFen(product.priceFen) }} × 1</template
              >
            </span>
          </div>
          <span v-if="product.priceFen !== null" class="receipt-item-amount"
            >¥{{ formatPriceFen(product.priceFen) }}</span
          >
        </li>
      </ul>
      <div class="receipt-total">
        <div><span>参考合计金额</span><small>共 1 款 / 1 件</small></div>
        <strong v-if="product && product.priceFen !== null"
          ><span>¥</span>{{ formatPriceFen(product.priceFen) }}</strong
        >
        <strong v-else>待确认</strong>
      </div>
      <fieldset class="receipt-recipient" :disabled="submitting">
        <legend>收货信息</legend>
        <label :for="`${formId}-name`">收货人</label>
        <input
          :id="`${formId}-name`"
          v-model="recipient.name"
          name="name"
          autocomplete="shipping name"
          maxlength="100"
          required
        />
        <label :for="`${formId}-phone`">手机号</label>
        <input
          :id="`${formId}-phone`"
          v-model="recipient.phone"
          name="phone"
          type="tel"
          inputmode="tel"
          autocomplete="shipping tel"
          maxlength="32"
          required
        />
        <label :for="`${formId}-address`">完整地址</label>
        <textarea
          :id="`${formId}-address`"
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
          :form="formId"
          :disabled="!canPurchase || submitting"
        >
          {{ submitting ? '正在提交购买请求…' : '确认购买' }}
          <span v-if="product && product.priceFen !== null"
            >¥{{ formatPriceFen(product.priceFen) }}</span
          >
          <span aria-hidden="true">↗</span>
        </button>
        <p class="receipt-disclaimer">每次仅可购买 1 件，提交后请稍后前往订单详情页支付</p>
        <div class="receipt-footer" aria-hidden="true">
          <span></span><span>愿每一份选择，都恰到好处</span><span></span>
        </div>
      </div>
    </template>
  </ElDialog>
</template>

<style scoped src="@/assets/checkoutReceipt.css"></style>

<style src="@/assets/checkoutReceiptDialog.css"></style>
