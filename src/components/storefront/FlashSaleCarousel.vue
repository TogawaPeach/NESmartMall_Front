<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ElButton,
  ElCarousel,
  ElCarouselItem,
  ElConfigProvider,
  ElIcon,
  ElImage,
  type CarouselInstance,
} from 'element-plus'
import { Picture, VideoPause, VideoPlay } from '@element-plus/icons-vue'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import FlashSaleTiming from './FlashSaleTiming.vue'
import { flashSaleCarousel } from '@/api/flashSaleContract'
import { formatPriceFen } from '@/utils/price'
import type { FlashSaleCard } from '@/types/flashSale'

const props = defineProps<{ products: FlashSaleCard[]; clockOffsetMs: number }>()
const carousel = ref<CarouselInstance>()
const index = ref(0)
const focused = ref(false)
const manuallyPaused = ref(false)
const hidden = ref(document.hidden)
const autoplay = computed(
  () => props.products.length > 1 && !focused.value && !manuallyPaused.value && !hidden.value,
)
let motion: MediaQueryList | undefined

function visibilityChanged() {
  hidden.value = document.hidden
}
function motionChanged() {
  if (motion?.matches) manuallyPaused.value = true
}
function focusOut(event: FocusEvent) {
  const root = event.currentTarget as HTMLElement
  focused.value = event.relatedTarget instanceof Node && root.contains(event.relatedTarget)
}

watch(
  () => props.products,
  () => {
    index.value = 0
    carousel.value?.setActiveItem(0)
  },
)
onMounted(() => {
  motion = window.matchMedia('(prefers-reduced-motion: reduce)')
  manuallyPaused.value = motion.matches
  motion.addEventListener('change', motionChanged)
  document.addEventListener('visibilitychange', visibilityChanged)
})
onBeforeUnmount(() => {
  motion?.removeEventListener('change', motionChanged)
  document.removeEventListener('visibilitychange', visibilityChanged)
})
</script>

<template>
  <section
    class="sale-carousel"
    :class="{ 'sale-carousel--single': products.length === 1 }"
    role="region"
    aria-roledescription="轮播"
    aria-label="秒杀商品"
    @focusin="focused = true"
    @focusout="focusOut"
    @keydown.left.prevent="carousel?.prev()"
    @keydown.right.prevent="carousel?.next()"
  >
    <ElConfigProvider :locale="zhCn">
      <ElCarousel
        ref="carousel"
        type="card"
        height="var(--sale-carousel-height)"
        :interval="flashSaleCarousel.intervalMs"
        :autoplay="autoplay"
        :pause-on-hover="true"
        :arrow="products.length > 1 ? 'always' : 'never'"
        :indicator-position="products.length > 1 ? 'outside' : 'none'"
        trigger="click"
        @change="index = $event"
      >
        <ElCarouselItem v-for="(item, position) in products" :key="item.id" :name="item.id">
          <RouterLink
            class="sale-card"
            :class="{ 'sale-card--inactive': position !== index }"
            :to="{ name: 'flash-sale-detail', params: { id: item.id } }"
            :inert="position !== index"
            :aria-hidden="position !== index"
            :tabindex="position === index ? 0 : -1"
            :aria-label="`${item.name}${item.model ? `，型号 ${item.model}` : ''}，${item.priceFen === null ? '价格待确认' : `秒杀价人民币 ${formatPriceFen(item.priceFen)} 元`}，查看秒杀详情`"
            @click.stop
          >
            <div class="sale-image-area">
              <ElImage
                v-if="item.imageUrl"
                :src="item.imageUrl"
                :alt="item.name"
                fit="contain"
                class="sale-image"
              >
                <template #placeholder
                  ><div class="image-placeholder">
                    <ElIcon><Picture /></ElIcon><span>图片加载中</span>
                  </div></template
                >
                <template #error
                  ><div class="image-placeholder">
                    <ElIcon><Picture /></ElIcon><span>暂无商品图片</span>
                  </div></template
                >
              </ElImage>
              <div v-else class="image-placeholder">
                <ElIcon><Picture /></ElIcon><span>暂无商品图片</span>
              </div>
            </div>
            <div class="sale-summary">
              <h2 :title="item.name">{{ item.name }}</h2>
              <p v-if="item.model" class="sale-model">{{ item.model }}</p>
              <div class="sale-price-area">
                <p v-if="item.priceFen !== null" class="sale-price">
                  <span>¥</span>{{ formatPriceFen(item.priceFen) }}
                </p>
                <p v-else class="price-pending">价格待确认</p>
              </div>
              <FlashSaleTiming
                v-if="position === index"
                :window="item"
                :clock-offset-ms="clockOffsetMs"
                compact
              />
            </div>
          </RouterLink>
        </ElCarouselItem>
      </ElCarousel>
    </ElConfigProvider>
    <div v-if="products.length > 1" class="carousel-controls">
      <span class="sr-only" role="status" aria-live="polite"
        >第 {{ index + 1 }} 件，共 {{ products.length }} 件</span
      >
      <ElButton
        circle
        text
        :icon="manuallyPaused ? VideoPlay : VideoPause"
        :aria-label="manuallyPaused ? '开启自动轮播' : '暂停自动轮播'"
        :title="manuallyPaused ? '开启自动轮播' : '暂停自动轮播'"
        :aria-pressed="manuallyPaused"
        @click="manuallyPaused = !manuallyPaused"
      />
    </div>
  </section>
</template>

<style scoped>
.sale-carousel {
  --sale-carousel-height: 380px;
  overflow: hidden;
}
.sale-carousel :deep(.el-carousel__item) {
  border-radius: 16px;
}
.sale-carousel :deep(.el-carousel__mask) {
  z-index: 2;
  border-radius: 16px;
}
.sale-carousel :deep(.el-carousel__arrow) {
  --el-carousel-arrow-size: 40px;
  color: var(--store-text);
  background: var(--store-surface);
  border: 1px solid var(--store-border);
}
.sale-carousel :deep(.el-carousel__button) {
  background: var(--store-accent);
}
.sale-carousel :deep(.el-carousel__button:focus-visible),
.sale-carousel :deep(.el-carousel__arrow:focus-visible) {
  outline: 2px solid var(--store-focus-ring);
  outline-offset: 2px;
}
.sale-carousel--single :deep(.el-carousel) {
  width: 180%;
  margin-left: -40%;
}
.sale-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  width: 100%;
  height: 100%;
  overflow: hidden;
  border: 1px solid var(--store-border);
  border-radius: 16px;
  background: var(--store-surface);
}
.sale-card:hover {
  border-color: var(--store-sale-border-hover);
}
.sale-card:focus-visible {
  outline-offset: -3px;
}
.sale-card--inactive {
  pointer-events: none;
}
.sale-image-area {
  min-width: 0;
  height: 100%;
  padding: 24px 16px;
  background: var(--store-filter-background);
}
.sale-image {
  width: 100%;
  height: 100%;
}
.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  color: var(--store-placeholder);
  font-size: 13px;
  text-align: center;
}
.image-placeholder .el-icon {
  font-size: 36px;
}
.sale-summary {
  display: flex;
  flex-direction: column;
  min-width: 0;
  padding: 32px 24px;
}
h2 {
  display: -webkit-box;
  margin: 0;
  overflow: hidden;
  font-size: clamp(20px, 1.7vw, 26px);
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 3;
}
.sale-model {
  margin: 10px 0 0;
  color: var(--store-muted);
  font-size: 13px;
  line-height: 1.6;
  overflow-wrap: anywhere;
}
.sale-price-area {
  margin-top: auto;
  padding-top: 20px;
}
.sale-price {
  margin: 0;
  color: var(--store-price);
  font-size: clamp(24px, 2.3vw, 34px);
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.sale-price > span {
  margin-right: 4px;
  font-size: 0.6em;
  font-weight: 500;
}
.price-pending {
  margin: 0;
  color: var(--store-muted);
  font-size: 18px;
}
.carousel-controls {
  display: flex;
  justify-content: flex-end;
}
.carousel-controls .el-button {
  width: 40px;
  height: 40px;
  color: var(--store-muted);
  font-size: 20px;
}
@media (max-width: 1023px) {
  .sale-carousel :deep(.el-carousel) {
    width: 180%;
    margin-left: -40%;
  }
  .sale-carousel :deep(.el-carousel__arrow--left) {
    left: calc(22.222% + 4px);
  }
  .sale-carousel :deep(.el-carousel__arrow--right) {
    right: calc(22.222% + 4px);
  }
}
@media (max-width: 767px) {
  .sale-carousel {
    --sale-carousel-height: 320px;
  }
  .sale-image-area {
    padding: 20px 8px;
  }
  .sale-summary {
    padding: 24px 12px;
  }
  h2 {
    font-size: 18px;
  }
  .sale-model {
    font-size: 12px;
  }
  .sale-price {
    font-size: 24px;
  }
  .sale-carousel :deep(.el-carousel__arrow) {
    top: auto;
    bottom: 0;
    transform: none;
    --el-carousel-arrow-size: 32px;
  }
}
</style>
