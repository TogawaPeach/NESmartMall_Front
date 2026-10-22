<script setup lang="ts">
import { ref } from 'vue'
import { ElAlert, ElSkeleton, ElSkeletonItem } from 'element-plus'
import StorefrontHeader from '@/components/storefront/StorefrontHeader.vue'
import FlashSaleCarousel from '@/components/storefront/FlashSaleCarousel.vue'
import FlashSaleState from '@/components/storefront/FlashSaleState.vue'
import { useFlashSaleList } from '@/composables/useFlashSaleList'
import { flashSaleDemoEnabled } from '@/api/flashSaleContract'

const keyword = ref('')
const { products, state, clockOffsetMs, retry } = useFlashSaleList()
</script>

<template>
  <div class="storefront flash-sale-page">
    <a class="skip-link" href="#flash-sale">跳转到秒杀商品</a>
    <StorefrontHeader v-model:keyword="keyword" />
    <main id="flash-sale" tabindex="-1" :aria-busy="state === 'loading'">
      <nav class="breadcrumb" aria-label="当前位置">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink><span aria-hidden="true">/</span
        ><span aria-current="page">限时秒杀</span>
      </nav>
      <h1 class="sale-heading">限时秒杀</h1>
      <ElAlert
        v-if="flashSaleDemoEnabled"
        class="demo-notice"
        title="演示模式 · 示例商品，购买暂未开放"
        type="warning"
        show-icon
        :closable="false"
      />
      <div
        v-if="state === 'loading'"
        class="sale-loading"
        role="status"
        aria-label="正在加载秒杀商品"
      >
        <ElSkeleton animated
          ><template #template><ElSkeletonItem variant="image" class="sale-skeleton" /></template
        ></ElSkeleton>
      </div>
      <FlashSaleCarousel
        v-else-if="state === 'success'"
        :products="products"
        :clock-offset-ms="clockOffsetMs"
      />
      <FlashSaleState v-else :state="state" @retry="retry" />
    </main>
    <footer class="storefront-footer">经纬智选 · 测绘工具商城</footer>
  </div>
</template>

<style scoped>
.storefront {
  --store-module-inset: 6px;
  width: 100%;
  max-width: 1440px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 26px 80px 24px;
}
.skip-link {
  position: fixed;
  top: -60px;
  left: 24px;
  z-index: 100;
  padding: 12px 20px;
  background: var(--store-surface);
}
.skip-link:focus {
  top: 12px;
}
main {
  margin: 32px var(--store-module-inset) 0;
  outline: none;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  color: var(--store-muted);
  font-size: 14px;
}
.breadcrumb a:hover {
  color: var(--store-text);
}
.sale-heading {
  margin: 32px 0 28px;
}
h1 {
  font-size: 32px;
  font-weight: 600;
}
.demo-notice {
  margin-bottom: 20px;
}
.sale-skeleton {
  width: 100%;
  height: 380px;
  border-radius: 20px;
}
.storefront-footer {
  margin: 56px var(--store-module-inset) 0;
  padding: 30px 0 12px;
  border-top: 1px solid var(--store-border);
  color: var(--store-text);
  font-size: 18px;
  font-weight: 500;
}
@media (max-width: 1199px) {
  .storefront {
    padding: 20px 40px 24px;
  }
}
@media (max-width: 767px) {
  main {
    margin-top: 24px;
  }
  .sale-heading {
    margin-block: 28px 24px;
  }
  h1 {
    font-size: 28px;
  }
  .storefront-footer {
    margin-top: 40px;
    font-size: 15px;
  }
}
@media (max-width: 599px) {
  .storefront {
    --store-module-inset: 2px;
    padding: 10px 20px 20px;
  }
}
</style>
