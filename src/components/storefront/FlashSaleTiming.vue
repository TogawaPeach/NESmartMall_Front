<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { flashSaleContract } from '@/api/flashSaleContract'
import type { FlashSaleWindow } from '@/types/flashSale'
import { formatFlashSaleCountdown, getFlashSaleStatus } from '@/utils/flashSaleTime'

const props = defineProps<{ window: FlashSaleWindow; clockOffsetMs: number; compact?: boolean }>()
const now = ref(Date.now())
const status = computed(() => getFlashSaleStatus(props.window, now.value + props.clockOffsetMs))
const labels = {
  upcoming: '尚未开始',
  active: '秒杀进行中',
  ended: '秒杀已结束',
  invalid: '活动时间待确认',
}
const countdown = computed(() => {
  const target = status.value === 'upcoming' ? props.window.startsAtMs : props.window.endsAtMs
  return target === null ? '' : formatFlashSaleCountdown(target - now.value - props.clockOffsetMs)
})
const formatter = new Intl.DateTimeFormat('zh-CN', {
  timeZone: flashSaleContract.time.displayTimeZone,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
})
const period = computed(() =>
  status.value === 'invalid'
    ? ''
    : `${formatter.format(props.window.startsAtMs!)} — ${formatter.format(props.window.endsAtMs!)}`,
)
let timer: ReturnType<typeof setInterval> | undefined
function tick() {
  now.value = Date.now()
}
onMounted(() => {
  timer = setInterval(tick, 1000)
  document.addEventListener('visibilitychange', tick)
})
onBeforeUnmount(() => {
  clearInterval(timer)
  document.removeEventListener('visibilitychange', tick)
})
</script>

<template>
  <div class="sale-timing" :class="{ 'sale-timing--compact': compact }" :data-status="status">
    <span class="sale-status" role="status">{{ labels[status] }}</span>
    <p v-if="status === 'upcoming' || status === 'active'" class="sale-countdown">
      <span>{{ status === 'upcoming' ? '距开始' : '距结束' }}</span>
      <strong aria-live="off">{{ countdown }}</strong>
    </p>
    <p v-if="!compact && period" class="sale-period">{{ period }}（北京时间）</p>
    <p v-if="!compact" class="sale-clock-note">
      倒计时仅供参考，活动时间与购买资格以服务端校验为准
    </p>
  </div>
</template>

<style scoped>
.sale-timing {
  margin-block: 24px;
}
.sale-status {
  display: inline-block;
  padding: 6px 12px;
  border-radius: 24px;
  color: var(--store-muted);
  background: var(--store-background);
  font-size: 13px;
}
[data-status='active'] .sale-status {
  color: var(--store-sale-text);
  background: var(--store-sale-background);
}
.sale-countdown {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 12px;
  margin: 14px 0;
  color: var(--store-muted);
  font-size: 14px;
}
.sale-countdown strong {
  color: var(--store-text);
  font-size: clamp(22px, 3vw, 32px);
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.sale-period,
.sale-clock-note {
  margin: 8px 0 0;
  color: var(--store-muted);
  font-size: 12px;
  line-height: 1.8;
  overflow-wrap: anywhere;
}
.sale-timing--compact {
  margin: 16px 0 0;
}
.sale-timing--compact .sale-status {
  padding: 0;
  color: var(--store-muted);
  background: none;
  font-size: 12px;
}
.sale-timing--compact .sale-countdown {
  gap: 6px;
  margin: 6px 0 0;
  font-size: 12px;
}
.sale-timing--compact .sale-countdown strong {
  font-size: 16px;
}
</style>
