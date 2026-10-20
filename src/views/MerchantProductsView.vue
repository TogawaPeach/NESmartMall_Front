<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { RouterLink } from 'vue-router'
import { ElButton, ElIcon, ElMessage } from 'element-plus'
import { Box, Plus, Search, Right, SwitchButton, EditPen, Goods } from '@element-plus/icons-vue'
import jingweiLogo from '@/assets/jingwei-logo.svg'
import { useAuthStore } from '@/stores/auth'
import { productCategoryLabel } from '@/constants/productCategories'
import { useMerchantProducts } from '@/composables/useMerchantProducts'
import MerchantProductEditor from '@/components/merchant/MerchantProductEditor.vue'
import type { MerchantProduct, MerchantProductDraft, MerchantProductStatus } from '@/types/merchant'

const auth = useAuthStore()
const { products, keyword, status, filteredProducts, onSaleCount, saveProduct, toggleStatus } =
  useMerchantProducts()
const editorVisible = ref(false)
const editingProduct = ref<MerchantProduct | null>(null)
const editorError = ref('')
const page = ref(1)
const pageSize = 8
const pageCount = computed(() => Math.max(1, Math.ceil(filteredProducts.value.length / pageSize)))
const pageProducts = computed(() =>
  filteredProducts.value.slice((page.value - 1) * pageSize, page.value * pageSize),
)
const tabs: { label: string; value: 'all' | MerchantProductStatus }[] = [
  { label: '全部商品', value: 'all' },
  { label: '在售中', value: 'on-sale' },
  { label: '已下架', value: 'off-shelf' },
]
const price = (fen: number) =>
  (fen / 100).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
watch([keyword, status], () => {
  page.value = 1
})
watch(pageCount, (count) => {
  page.value = Math.min(page.value, count)
})

function openEditor(product: MerchantProduct | null = null) {
  editingProduct.value = product
  editorError.value = ''
  editorVisible.value = true
}
function save(draft: MerchantProductDraft, id?: string) {
  const error = saveProduct(draft, id)
  if (error) {
    editorError.value = error
    return
  }
  editorVisible.value = false
  if (!id) {
    keyword.value = ''
    status.value = 'all'
    page.value = 1
  }
  ElMessage.success(id ? '商品资料已更新（本地演示）' : '商品已保存，可点击上架（本地演示）')
}
function changeStatus(product: MerchantProduct) {
  const error = toggleStatus(product.id)
  if (error) {
    ElMessage.warning(error)
    return
  }
  ElMessage.success(`商品已${product.status === 'on-sale' ? '上架' : '下架'}（本地演示）`)
}

function resetFilters() {
  keyword.value = ''
  status.value = 'all'
}
</script>

<template>
  <div class="merchant-shell">
    <aside class="merchant-sidebar">
      <RouterLink
        class="merchant-brand"
        :to="{ name: 'merchant-products' }"
        aria-label="经纬智选商家端首页"
      >
        <img :src="jingweiLogo" alt="经纬智选" width="48" height="44" />
        <span>经纬智选<small>商家工作台</small></span>
      </RouterLink>
      <p class="sidebar-label">店铺管理</p>
      <nav aria-label="商家导航">
        <RouterLink class="sidebar-item" :to="{ name: 'merchant-products' }" aria-current="page">
          <ElIcon><Goods /></ElIcon>商品管理
        </RouterLink>
      </nav>
      <div class="sidebar-footer">
        <span class="shop-dot" />{{ auth.displayName }}<small>专注好商品，做好每一次服务</small>
      </div>
    </aside>

    <div class="merchant-workspace">
      <header class="merchant-topbar">
        <span class="breadcrumb">商家工作台<span>/</span><strong>商品管理</strong></span>
        <div class="topbar-actions">
          <RouterLink class="visit-store" :to="{ name: 'home' }"
            >查看商城<ElIcon><Right /></ElIcon
          ></RouterLink>
          <span class="merchant-account">{{ auth.displayName }}</span>
          <ElButton text :icon="SwitchButton" @click="auth.logout()">退出</ElButton>
        </div>
      </header>

      <main class="merchant-main">
        <div class="page-heading">
          <div>
            <p class="page-eyebrow">PRODUCTS</p>
            <h1>商品管理</h1>
            <p class="page-description">管理你的店铺商品，随时调整上架状态。</p>
          </div>
          <ElButton type="primary" :icon="Plus" size="large" @click="openEditor()"
            >新增商品</ElButton
          >
        </div>

        <div class="demo-notice" role="note">
          <span class="demo-badge">演示模式</span
          >当前为示例商品，仅在本页演示操作，离开页面或刷新后重置。
        </div>

        <section class="merchant-stats" aria-label="商品概况">
          <div class="stat-card">
            <span>全部商品</span><strong>{{ products.length }}<small>件</small></strong
            ><ElIcon><Box /></ElIcon>
          </div>
          <div class="stat-card">
            <span>在售商品</span><strong>{{ onSaleCount }}<small>件</small></strong
            ><span class="stat-dot is-selling" />
          </div>
          <div class="stat-card">
            <span>已下架商品</span
            ><strong>{{ products.length - onSaleCount }}<small>件</small></strong
            ><span class="stat-dot" />
          </div>
        </section>

        <section class="inventory-panel" aria-label="商品列表">
          <div class="inventory-toolbar">
            <div class="status-tabs" role="group" aria-label="按上架状态筛选">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                :class="{ selected: status === tab.value }"
                :aria-pressed="status === tab.value"
                @click="status = tab.value"
              >
                {{ tab.label }}
              </button>
            </div>
            <div class="inventory-search">
              <ElIcon aria-hidden="true"><Search /></ElIcon
              ><input
                v-model="keyword"
                placeholder="搜索商品名称、型号或编号"
                aria-label="搜索商品名称、型号或编号"
                type="search"
              />
            </div>
          </div>
          <div
            class="inventory-table-scroll"
            tabindex="0"
            role="region"
            aria-label="商品表格，可横向滚动"
          >
            <table class="inventory-table">
              <thead>
                <tr>
                  <th scope="col">商品信息</th>
                  <th scope="col">分类</th>
                  <th scope="col">售价</th>
                  <th scope="col">库存</th>
                  <th scope="col">状态</th>
                  <th scope="col">操作</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="product in pageProducts" :key="product.id">
                  <td>
                    <div class="product-summary">
                      <span class="product-placeholder" aria-hidden="true"
                        ><ElIcon><Box /></ElIcon
                      ></span>
                      <div>
                        <strong>{{ product.name }}</strong
                        ><span>{{ product.model || '未填写型号' }}</span
                        ><small>{{ product.id }}</small>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span class="category-label">{{ productCategoryLabel(product.category) }}</span>
                  </td>
                  <td class="product-price">¥ {{ price(product.priceFen) }}</td>
                  <td>
                    <span :class="{ 'stock-empty': product.stock === 0 }">{{ product.stock }}</span
                    ><small v-if="product.stock === 0" class="stock-note">待补货</small>
                  </td>
                  <td>
                    <span
                      class="product-status"
                      :class="{ 'is-selling': product.status === 'on-sale' }"
                      ><i />{{ product.status === 'on-sale' ? '在售中' : '已下架' }}</span
                    >
                  </td>
                  <td>
                    <div class="product-actions">
                      <button :aria-label="`编辑${product.name}`" @click="openEditor(product)">
                        <ElIcon><EditPen /></ElIcon>编辑</button
                      ><button
                        :aria-label="`${product.status === 'on-sale' ? '下架' : '上架'}${product.name}`"
                        @click="changeStatus(product)"
                      >
                        {{ product.status === 'on-sale' ? '下架' : '上架' }}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="!pageProducts.length">
                  <td colspan="6" class="inventory-empty">
                    <ElIcon><Search /></ElIcon>
                    <p>没有找到符合条件的商品</p>
                    <button @click="resetFilters">清除筛选</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="inventory-footer">
            <span aria-live="polite">共 {{ filteredProducts.length }} 件商品</span>
            <div>
              <ElButton size="small" :disabled="page === 1" @click="page--">上一页</ElButton
              ><span class="page-indicator">{{ page }} / {{ pageCount }}</span
              ><ElButton size="small" :disabled="page === pageCount" @click="page++"
                >下一页</ElButton
              >
            </div>
          </footer>
        </section>
        <p class="merchant-footnote">经纬智选 · 商家工作台</p>
      </main>
    </div>
    <MerchantProductEditor
      v-model="editorVisible"
      :product="editingProduct"
      :error="editorError"
      @save="save"
    />
  </div>
</template>

<style scoped src="@/assets/merchant.css"></style>
