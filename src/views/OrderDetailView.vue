<script setup lang="ts">
import { computed } from 'vue'
import { ElButton, ElIcon } from 'element-plus'
import { Check, Service, Tickets } from '@element-plus/icons-vue'
import { useOrderDetail } from '@/composables/useOrders'
import { formatOrderTime, orderStatusInfo } from '@/constants/orderStatus'
import { formatPriceFen } from '@/utils/price'
import OrderPageShell from '@/components/storefront/OrderPageShell.vue'
import OrderItems from '@/components/storefront/OrderItems.vue'
import OrderActions from '@/components/storefront/OrderActions.vue'
import OrderPageState from '@/components/storefront/OrderPageState.vue'
import { useCustomerServiceContext } from '@/composables/useCustomerServiceContext'

const { data: order, state, retry, listLocation } = useOrderDetail()
const { consultOrder } = useCustomerServiceContext()
const steps = computed(() =>
  order.value
    ? [
        { label: '提交订单', time: order.value.createdAt },
        { label: '支付成功', time: order.value.paidAt },
        { label: '商家发货', time: order.value.shippedAt },
        { label: '交易完成', time: order.value.completedAt },
      ]
    : [],
)
</script>

<template>
  <OrderPageShell title="订单详情">
    <template #breadcrumb
      ><RouterLink :to="listLocation">我的订单</RouterLink><span aria-hidden="true">/</span
      ><span aria-current="page">订单详情</span></template
    >
    <template #heading-action
      ><RouterLink class="order-back-link" :to="listLocation">← 返回订单列表</RouterLink></template
    >
    <div :aria-busy="state === 'loading'">
      <template v-if="state === 'success' && order">
        <section class="order-detail-status order-panel" aria-label="订单状态">
          <div class="order-status-heading">
            <div class="order-status-title">
              <ElIcon aria-hidden="true"
                ><Check v-if="order.status === 'COMPLETED'" /><Tickets v-else
              /></ElIcon>
              <div>
                <h2>{{ orderStatusInfo(order.status).label }}</h2>
                <p>{{ orderStatusInfo(order.status).description }}</p>
              </div>
            </div>
            <div class="order-consult-actions">
              <ElButton :icon="Service" @click="consultOrder(order)">联系商家客服</ElButton>
              <OrderActions :status="order.status" />
            </div>
          </div>
          <p class="order-number">
            订单号 <strong>{{ order.orderNo }}</strong>
          </p>
          <div v-if="order.status === 'CANCELLED'" class="order-cancelled-note">
            提交于 {{ formatOrderTime(order.createdAt)
            }}<span>取消于 {{ formatOrderTime(order.cancelledAt) }}</span>
          </div>
          <ol v-else class="order-progress" aria-label="订单进度">
            <li
              v-for="(step, index) in steps"
              :key="step.label"
              :class="{ 'is-done': !!step.time }"
            >
              <span class="order-step-dot" aria-hidden="true"
                ><ElIcon v-if="step.time"><Check /></ElIcon
                ><template v-else>{{ index + 1 }}</template></span
              ><strong>{{ step.label }}</strong
              ><span>{{ formatOrderTime(step.time) }}</span>
            </li>
          </ol>
        </section>
        <div class="order-detail-information">
          <section class="order-panel">
            <h2>收货信息</h2>
            <dl class="order-info-list">
              <div>
                <dt>收货人</dt>
                <dd>{{ order.recipient.name }}</dd>
              </div>
              <div>
                <dt>联系电话</dt>
                <dd>{{ order.recipient.phone }}</dd>
              </div>
              <div>
                <dt>收货地址</dt>
                <dd>{{ order.recipient.address }}</dd>
              </div>
            </dl>
          </section>
          <section class="order-panel">
            <h2>物流信息</h2>
            <dl v-if="order.logistics" class="order-info-list">
              <div>
                <dt>运单号</dt>
                <dd>{{ order.logistics.trackingNo }}</dd>
              </div>
              <div>
                <dt>发货时间</dt>
                <dd>{{ formatOrderTime(order.shippedAt) }}</dd>
              </div>
            </dl>
            <p v-else class="order-no-logistics">暂无物流信息</p>
          </section>
        </div>
        <section class="order-panel order-detail-products">
          <h2>商品明细</h2>
          <OrderItems :items="order.items" />
          <div class="order-amount-section">
            <dl class="order-amounts">
              <div>
                <dt>商品金额</dt>
                <dd>¥{{ formatPriceFen(order.goodsAmountFen) }}</dd>
              </div>
              <div>
                <dt>运费</dt>
                <dd>¥{{ formatPriceFen(order.shippingFeeFen) }}</dd>
              </div>
              <div>
                <dt>优惠</dt>
                <dd>−¥{{ formatPriceFen(order.discountAmountFen) }}</dd>
              </div>
              <div class="order-payable">
                <dt>应付金额</dt>
                <dd>¥{{ formatPriceFen(order.payableAmountFen) }}</dd>
              </div>
              <div class="order-paid">
                <dt>实付金额</dt>
                <dd :class="{ 'is-unpaid': order.paidAmountFen === null }">
                  {{
                    order.paidAmountFen === null
                      ? '尚未付款'
                      : `¥${formatPriceFen(order.paidAmountFen)}`
                  }}
                </dd>
              </div>
            </dl>
          </div>
        </section>
        <p class="order-service-note">支付、取消订单和确认收货暂未开放。</p>
      </template>
      <OrderPageState v-else :state="state" @retry="retry" />
    </div>
  </OrderPageShell>
</template>
