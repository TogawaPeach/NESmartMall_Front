<script setup lang="ts">
import { computed, ref } from 'vue'
import { ElButton, ElIcon, ElImage, ElMessage, ElSkeleton, ElSkeletonItem } from 'element-plus'
import { Box, Picture, RefreshRight, User, Warning } from '@element-plus/icons-vue'
import StorefrontHeader from '@/components/storefront/StorefrontHeader.vue'
import { useProductDetail } from '@/composables/useProductDetail'
import { useLoginPromptStore } from '@/stores/loginPrompt'
import { formatPriceFen } from '@/utils/price'

const keyword = ref('')
const loginPrompt = useLoginPromptStore()
const { product, state, retry } = useProductDetail()
const price = computed(() => {
  if (product.value?.priceFen === null || !product.value) return null
  return formatPriceFen(product.value.priceFen)
})
const canPurchase = computed(() =>
  Boolean(product.value && product.value.stock > 0 && price.value !== null),
)
const stateCopy = computed(() => {
  switch (state.value) {
    case 'login-required':
      return { title: '请先登录账号', description: '登录后即可继续查看商品详情' }
    case 'unavailable':
      return {
        title: '商品暂不可访问',
        description: '商品可能已下架或不存在，可以返回首页继续浏览',
      }
    case 'forbidden':
      return { title: '暂时无法查看此商品', description: '当前账号没有访问该商品的权限' }
    default:
      return { title: '商品详情加载失败', description: '请稍后重试' }
  }
})

function showPurchaseNotice(action: 'buy' | 'cart') {
  if (!canPurchase.value) return
  ElMessage.info(action === 'buy' ? '购买功能暂未开放' : '购物车功能暂未开放')
}
</script>

<template>
  <div class="storefront product-detail-page">
    <a class="skip-link" href="#product-detail">跳转到商品详情</a>
    <StorefrontHeader v-model:keyword="keyword" />

    <main id="product-detail" class="detail-main" tabindex="-1" :aria-busy="state === 'loading'">
      <nav class="breadcrumb" aria-label="当前位置">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink>
        <span aria-hidden="true">/</span>
        <span aria-current="page">商品详情</span>
      </nav>

      <div class="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {{
          state === 'loading'
            ? '正在加载商品详情'
            : state === 'success'
              ? '商品详情已加载'
              : stateCopy.title
        }}
      </div>

      <div v-if="state === 'loading'" class="detail-loading" aria-hidden="true">
        <ElSkeleton animated>
          <template #template>
            <div class="product-overview">
              <ElSkeletonItem variant="image" class="cover-skeleton" />
              <div class="summary-skeleton">
                <ElSkeletonItem variant="h1" style="width: 85%; height: 38px" />
                <ElSkeletonItem variant="text" style="width: 35%; margin-top: 16px" />
                <ElSkeletonItem variant="text" style="width: 65%; height: 55px; margin-top: 48px" />
                <ElSkeletonItem
                  variant="button"
                  style="width: 75%; height: 52px; margin-top: 48px"
                />
              </div>
            </div>
            <ElSkeletonItem variant="rect" class="description-skeleton" />
          </template>
        </ElSkeleton>
      </div>

      <template v-else-if="state === 'success' && product">
        <section class="product-overview" aria-labelledby="product-title">
          <div class="product-cover">
            <ElImage
              v-if="product.imageUrl"
              :key="product.imageUrl"
              :src="product.imageUrl"
              :alt="product.name"
              fit="contain"
              class="cover-image"
            >
              <template #placeholder>
                <div class="image-placeholder">
                  <ElIcon><Picture /></ElIcon><span>图片加载中</span>
                </div>
              </template>
              <template #error>
                <div class="image-placeholder">
                  <ElIcon><Picture /></ElIcon><span>暂无商品图片</span>
                </div>
              </template>
            </ElImage>
            <div v-else class="image-placeholder">
              <ElIcon><Picture /></ElIcon><span>暂无商品图片</span>
            </div>
          </div>

          <div class="product-summary">
            <h1 id="product-title">{{ product.name }}</h1>
            <p v-if="product.model" class="product-model">型号：{{ product.model }}</p>

            <div class="price-and-inventory">
              <p v-if="price !== null" class="product-price" :aria-label="`人民币 ${price} 元`">
                <span class="currency" aria-hidden="true">¥</span>
                <span aria-hidden="true">{{ price }}</span>
              </p>
              <p v-else class="price-pending">价格待确认</p>
              <div class="inventory">
                <p>
                  已售 <strong>{{ product.sales.toLocaleString('zh-CN') }}</strong> 件
                </p>
                <p>
                  库存 <strong>{{ product.stock.toLocaleString('zh-CN') }}</strong> 件
                </p>
              </div>
            </div>

            <div class="purchase-area">
              <div class="purchase-actions">
                <ElButton
                  class="buy-button"
                  :disabled="!canPurchase"
                  @click="showPurchaseNotice('buy')"
                  >立即购买</ElButton
                >
                <ElButton
                  class="cart-button"
                  :disabled="!canPurchase"
                  @click="showPurchaseNotice('cart')"
                  >加入购物车</ElButton
                >
              </div>
              <p v-if="product.stock === 0" class="availability-note" role="status">商品暂时缺货</p>
              <p v-else-if="price === null" class="availability-note" role="status">
                价格待确认，暂不可购买
              </p>
            </div>
          </div>
        </section>

        <section class="product-description" aria-labelledby="description-title">
          <h2 id="description-title">商品详情</h2>
          <div v-if="product.detailImages.length" class="description-images">
            <ElImage
              v-for="(url, index) in product.detailImages"
              :key="`${product.id}:${index}:${url}`"
              :src="url"
              :alt="`${product.name}，详情图片 ${index + 1}`"
              loading="lazy"
              class="description-image"
            >
              <template #placeholder>
                <div class="image-placeholder">
                  <ElIcon><Picture /></ElIcon><span>详情图片加载中</span>
                </div>
              </template>
              <template #error>
                <div class="image-placeholder">
                  <ElIcon><Picture /></ElIcon><span>第 {{ index + 1 }} 张详情图片加载失败</span>
                </div>
              </template>
            </ElImage>
          </div>
          <div v-else class="empty-description">
            <ElIcon aria-hidden="true"><Picture /></ElIcon>
            <p>暂无详情图片</p>
          </div>
        </section>
      </template>

      <section v-else class="detail-state" aria-labelledby="detail-state-title">
        <ElIcon class="state-icon" aria-hidden="true">
          <User v-if="state === 'login-required'" />
          <Warning v-else-if="state === 'error' || state === 'forbidden'" />
          <Box v-else />
        </ElIcon>
        <h1 id="detail-state-title">{{ stateCopy.title }}</h1>
        <p>{{ stateCopy.description }}</p>
        <ElButton
          v-if="state === 'login-required'"
          :icon="User"
          @click="loginPrompt.openLogin('登录后即可查看商品详情')"
          >立即登录</ElButton
        >
        <ElButton v-else-if="state === 'error'" :icon="RefreshRight" @click="retry">重试</ElButton>
        <RouterLink v-else class="home-link" :to="{ name: 'home' }">返回首页</RouterLink>
      </section>
    </main>

    <footer class="storefront-footer">经纬智选 · 测绘工具商城</footer>
  </div>
</template>

<style scoped>
.storefront {
  max-width: 1584px;
  min-height: 100vh;
  margin: 0 auto;
  padding: 32px 64px 24px;
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
.detail-main {
  margin: 32px 12px 0;
  outline: none;
}
.breadcrumb {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 24px;
  color: var(--store-muted);
  font-size: 14px;
}
.breadcrumb a:hover {
  color: var(--store-text);
}
.product-overview {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(0, 1.15fr);
  gap: 64px;
  align-items: start;
  padding: 32px;
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}
.product-cover {
  position: relative;
  aspect-ratio: 1;
  overflow: hidden;
  border-radius: 10px;
  background: var(--store-background);
}
.cover-image,
.product-cover > .image-placeholder {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}
.cover-image {
  padding: 20px;
}
.product-summary {
  min-width: 0;
  padding: 12px 0;
}
h1 {
  margin: 0;
  color: var(--store-text);
  font-size: 30px;
  font-weight: 600;
  line-height: 1.5;
  overflow-wrap: anywhere;
}
.product-model {
  margin: 12px 0 0;
  color: var(--store-muted);
  font-size: 15px;
  overflow-wrap: anywhere;
}
.price-and-inventory {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 24px;
  margin-top: 40px;
  padding: 24px 0;
  border-top: 1px solid var(--store-border);
  border-bottom: 1px solid var(--store-border);
}
.product-price {
  display: flex;
  align-items: baseline;
  flex-wrap: wrap;
  gap: 4px;
  margin: 0;
  color: var(--store-price);
  font-size: 40px;
  font-weight: 650;
  font-variant-numeric: tabular-nums;
  overflow-wrap: anywhere;
}
.currency {
  font-size: 24px;
  font-weight: 500;
}
.price-pending {
  margin: 0;
  color: var(--store-muted);
  font-size: 24px;
}
.inventory {
  display: flex;
  flex-direction: column;
  gap: 10px;
  color: var(--store-muted);
  font-size: 14px;
}
.inventory p {
  margin: 0;
}
.inventory strong {
  color: var(--store-text);
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
.purchase-area {
  margin-top: 32px;
}
.purchase-actions {
  display: flex;
  gap: 16px;
}
.purchase-actions .el-button {
  flex: 1;
  min-width: 0;
  max-width: 200px;
  height: 52px;
  margin: 0;
  border-radius: 10px;
  font-size: 16px;
  font-weight: 500;
}
.buy-button {
  --el-button-bg-color: var(--store-text);
  --el-button-text-color: var(--store-surface);
  --el-button-border-color: var(--store-text);
  --el-button-hover-bg-color: var(--store-muted);
  --el-button-hover-text-color: var(--store-surface);
  --el-button-hover-border-color: var(--store-muted);
  --el-button-active-bg-color: var(--store-text);
  --el-button-active-text-color: var(--store-surface);
  --el-button-active-border-color: var(--store-text);
}
.cart-button {
  --el-button-bg-color: transparent;
  --el-button-text-color: var(--store-text);
  --el-button-border-color: var(--store-text);
  --el-button-hover-bg-color: var(--store-selected);
  --el-button-hover-text-color: var(--store-text);
  --el-button-hover-border-color: var(--store-muted);
  --el-button-active-bg-color: var(--store-selected);
  --el-button-active-text-color: var(--store-text);
  --el-button-active-border-color: var(--store-text);
}
.purchase-actions .el-button.is-disabled {
  color: var(--store-muted);
  background: var(--store-background);
  border-color: var(--store-border);
}
.availability-note {
  margin: 12px 0 0;
  color: var(--store-muted);
  font-size: 14px;
}
.product-description {
  margin-top: 32px;
  overflow: hidden;
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}
.product-description h2 {
  margin: 0;
  padding: 24px 32px;
  border-bottom: 1px solid var(--store-border);
  font-size: 20px;
  font-weight: 600;
}
.description-images {
  max-width: 1000px;
  margin: 0 auto;
}
.description-image {
  display: block;
  width: 100%;
  min-height: 1px;
}
.description-image :deep(.el-image__inner) {
  display: block;
  width: 100%;
  height: auto;
}
.image-placeholder {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  height: 100%;
  min-height: 180px;
  padding: 24px;
  color: var(--store-placeholder);
  background: var(--store-background);
  font-size: 14px;
  text-align: center;
}
.image-placeholder .el-icon,
.empty-description .el-icon {
  font-size: 36px;
}
.empty-description {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 240px;
  padding: 32px;
  color: var(--store-muted);
  font-size: 15px;
}
.empty-description p {
  margin: 16px 0 0;
}
.detail-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 520px;
  padding: 48px 24px;
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
  text-align: center;
}
.state-icon {
  margin-bottom: 20px;
  color: var(--store-state-icon);
  font-size: 44px;
}
.detail-state h1 {
  font-size: 22px;
}
.detail-state p {
  margin: 12px 0 24px;
  color: var(--store-muted);
  font-size: 15px;
  line-height: 1.7;
}
.detail-state .el-button,
.home-link {
  padding: 10px 24px;
  height: auto;
  border: 1px solid var(--store-border);
  border-radius: 20px;
  color: var(--store-text);
  background: var(--store-surface);
  font-size: 14px;
}
.cover-skeleton {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}
.summary-skeleton {
  padding: 12px 0;
}
.description-skeleton {
  width: 100%;
  height: 300px;
  margin-top: 32px;
  border-radius: 12px;
}
.storefront-footer {
  margin: 56px 12px 0;
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
  .product-overview {
    gap: 32px;
    padding: 24px;
  }
  h1 {
    font-size: 26px;
  }
  .product-price {
    font-size: 34px;
  }
  .price-and-inventory {
    margin-top: 24px;
    gap: 16px;
  }
}
@media (max-width: 767px) {
  .storefront {
    padding: 16px 20px 24px;
  }
  .detail-main {
    margin: 24px 0 0;
  }
  .product-overview {
    grid-template-columns: minmax(0, 1fr);
    gap: 24px;
    padding: 20px;
  }
  .product-summary {
    padding: 0;
  }
  h1 {
    font-size: 24px;
  }
  .purchase-actions .el-button {
    max-width: none;
  }
  .product-description {
    margin-top: 24px;
  }
  .product-description h2 {
    padding: 20px;
  }
  .storefront-footer {
    margin: 40px 0 0;
    font-size: 15px;
  }
}
</style>
