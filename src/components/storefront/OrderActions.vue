<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useOrderPayment } from '@/composables/useOrderPayment'
import PaymentConfirmation from './PaymentConfirmation.vue'
import OrderPaymentStatus from './OrderPaymentStatus.vue'
import { usePaymentDeadline } from '@/composables/usePaymentDeadline'
import { ElAlert, ElButton, ElDialog, ElMessage } from 'element-plus'
import { useConfirmReceipt } from '@/composables/useConfirmReceipt'
import type { Order, OrderStatus, OrderSummary } from '@/types/order'

const props = defineProps<{ status: OrderStatus; orderNo: string; order?: OrderSummary }>()
const emit = defineEmits<{ confirmed: [] }>()
const { visible, submitting, error, submitted, open, close, confirm } = useConfirmReceipt(
  () => props,
)

const paymentOrder = shallowRef<Order | null>(null)
const payment = useOrderPayment(paymentOrder)
const { confirmVisible, paying, querying, canPay, uncertain, paymentNotice, paymentError } = payment
const deadline = usePaymentDeadline(() => props.order ?? null)
const paymentReady = computed(
  () =>
    props.order?.canPay === true &&
    deadline.remainingMs.value !== null &&
    deadline.remainingMs.value > 0,
)
async function openPayment() {
  if (!paymentReady.value || paying.value || querying.value) return
  confirmVisible.value = true
  await payment.refresh(props.orderNo)
}
watch(() => props.orderNo, payment.reset, { flush: 'sync' })
watch(payment.paid, (value) => {
  if (value) {
    ElMessage.success('模拟支付成功，未产生实际扣款')
    emit('confirmed')
  }
})

async function agree() {
  if (await confirm()) {
    ElMessage.success('确认收货成功')
    emit('confirmed')
  }
}
</script>

<template>
  <div v-if="status === 'PENDING_PAYMENT' || status === 'PENDING_RECEIPT'" class="order-actions">
    <template v-if="status === 'PENDING_PAYMENT'">
      <ElButton disabled title="取消订单暂未开放">取消订单</ElButton>
      <ElButton
        type="primary"
        :disabled="!paymentReady"
        :loading="querying || paying"
        @click="openPayment"
        >继续模拟支付</ElButton
      >
      <OrderPaymentStatus v-if="order" :order="order" @expired="emit('confirmed')" />
      <span v-else>付款信息暂未就绪，请刷新订单</span>
    </template>
    <ElButton v-else type="primary" :disabled="submitted" :loading="submitting" @click="open"
      >确认收货</ElButton
    >
    <PaymentConfirmation
      :visible="confirmVisible"
      :order="paymentOrder"
      :paying="paying"
      :querying="querying"
      :can-pay="canPay"
      :uncertain="uncertain"
      :notice="paymentNotice"
      :error="paymentError"
      @close="payment.cancel"
      @confirm="payment.confirm"
      @refresh="payment.refresh(props.orderNo)"
    />
    <ElDialog
      v-model="visible"
      title="确认收货"
      width="min(500px, calc(100vw - 32px))"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="!submitting"
      :close-on-press-escape="!submitting"
      :show-close="!submitting"
    >
      <p class="receipt-confirm-order">订单号：{{ orderNo }}</p>
      <p>请确认您已收到全部商品且检查无误。是否确认收货？</p>
      <ElAlert v-if="error" :title="error" type="error" show-icon :closable="false" role="alert" />
      <template #footer>
        <div class="dialog-footer">
          <ElButton :disabled="submitting" @click="close">取消</ElButton>
          <ElButton type="primary" :loading="submitting" @click="agree">同意并确认收货</ElButton>
        </div>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.receipt-confirm-order {
  overflow-wrap: anywhere;
  color: var(--store-muted);
}
</style>
