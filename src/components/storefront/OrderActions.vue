<script setup lang="ts">
import { computed, shallowRef, watch } from 'vue'
import { useOrderPayment } from '@/composables/useOrderPayment'
import PaymentConfirmation from './PaymentConfirmation.vue'
import OrderPaymentStatus from './OrderPaymentStatus.vue'
import { usePaymentDeadline } from '@/composables/usePaymentDeadline'
import { ElAlert, ElButton, ElDialog, ElMessage } from 'element-plus'
import { useConfirmReceipt } from '@/composables/useConfirmReceipt'
import { useCancelOrder } from '@/composables/useCancelOrder'
import type { CancelOrderResult, Order, OrderStatus, OrderSummary } from '@/types/order'

const props = defineProps<{ status: OrderStatus; orderNo: string; order?: OrderSummary }>()
const emit = defineEmits<{ confirmed: []; changed: [result: CancelOrderResult | Order] }>()
const { visible, submitting, error, submitted, open, close, confirm } = useConfirmReceipt(
  () => props,
)

const paymentOrder = shallowRef<Order | null>(null)
const payment = useOrderPayment(paymentOrder)
const { confirmVisible, paying, querying, canPay, uncertain, paymentNotice, paymentError } = payment
const cancellation = useCancelOrder(
  () => props,
  () => confirmVisible.value || paying.value || querying.value || uncertain.value,
)
const {
  visible: cancelVisible,
  submitting: cancelling,
  querying: checkingCancel,
  uncertain: cancelUncertain,
  blocking: cancelBlocking,
  error: cancelError,
} = cancellation
function finishCancellation(result: CancelOrderResult | Order | null) {
  if (!result) return
  if (result.status === 'CANCELLED') ElMessage.success('订单已取消')
  else ElMessage.warning(cancelError.value || '订单状态已变化，当前无法取消')
  payment.reset()
  emit('changed', result)
}
async function agreeCancellation() {
  finishCancellation(await cancellation.confirm())
}
async function refreshCancellation() {
  finishCancellation(await cancellation.refresh())
}
const deadline = usePaymentDeadline(() => props.order ?? null)
const paymentReady = computed(
  () =>
    props.order?.canPay === true &&
    deadline.remainingMs.value !== null &&
    deadline.remainingMs.value > 0,
)
async function openPayment() {
  if (
    !paymentReady.value ||
    paying.value ||
    querying.value ||
    cancelVisible.value ||
    cancelBlocking.value
  )
    return
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
      <ElButton
        :disabled="
          (cancelBlocking && !cancelUncertain) || confirmVisible || paying || querying || uncertain
        "
        :loading="cancelling || checkingCancel"
        @click="cancellation.open"
        >{{ cancelUncertain ? '查询取消结果' : '取消订单' }}</ElButton
      >
      <ElButton
        type="primary"
        :disabled="!paymentReady || cancelVisible || cancelBlocking"
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
      :model-value="cancelVisible"
      title="取消订单"
      width="min(500px, calc(100vw - 32px))"
      align-center
      append-to-body
      destroy-on-close
      :close-on-click-modal="!cancelling && !checkingCancel"
      :close-on-press-escape="!cancelling && !checkingCancel"
      :show-close="!cancelling && !checkingCancel"
      @update:model-value="!$event && cancellation.close()"
    >
      <p class="receipt-confirm-order">订单号：{{ orderNo }}</p>
      <p>确定取消这笔订单吗？取消后需要重新下单。</p>
      <ElAlert
        v-if="cancelError"
        :title="cancelError"
        type="warning"
        show-icon
        :closable="false"
        role="alert"
      />
      <p v-if="checkingCancel" role="status">正在查询订单状态…</p>
      <template #footer>
        <ElButton :disabled="cancelling || checkingCancel" @click="cancellation.close"
          >暂不取消</ElButton
        >
        <ElButton
          v-if="cancelUncertain"
          type="primary"
          :loading="checkingCancel"
          :disabled="cancelling"
          @click="refreshCancellation"
          >查询订单</ElButton
        >
        <ElButton
          v-else
          type="danger"
          :loading="cancelling"
          :disabled="checkingCancel || cancelling"
          @click="agreeCancellation"
          >确认取消订单</ElButton
        >
      </template>
    </ElDialog>
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
