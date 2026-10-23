<script setup lang="ts">
import { RouterLink } from 'vue-router'
import { ElAlert, ElButton, ElIcon, ElImage, ElPagination } from 'element-plus'
import { Box, Plus, Right, SwitchButton, EditPen, Goods } from '@element-plus/icons-vue'
import jingweiLogo from '@/assets/jingwei-logo.svg'
import { useAuthStore } from '@/stores/auth'
import { useMerchantProductPage } from '@/composables/useMerchantProductPage'
import { useMerchantStats } from '@/composables/useMerchantStats'
import { useMerchantProductActions } from '@/composables/useMerchantProductActions'
import MerchantProductEditor from '@/components/merchant/MerchantProductEditor.vue'
import { merchantProductDisplay } from '@/utils/merchantProduct'
import { formatPriceFen } from '@/utils/price'
import type { MerchantProductFilter } from '@/types/merchant'

const auth = useAuthStore()
const {
  products,
  total,
  state,
  errorMessage,
  pageNum,
  pageSize,
  status,
  now,
  selectStatus,
  changePage,
  resetFilters,
  retry,
} = useMerchantProductPage()
const { stats, state: statsState, errorMessage: statsError, retry: retryStats } = useMerchantStats()
const {
  editorVisible,
  editingProduct,
  editorError,
  saving,
  pendingStatusId,
  busy: actionsBusy,
  errorMessage: actionError,
  successMessage: actionSuccess,
  openEditor,
  save,
  changeStatus,
} = useMerchantProductActions(async (created) => {
  await Promise.all([created ? resetFilters() : retry(), retryStats()])
})
const tabs: { label: string; value: MerchantProductFilter }[] = [
  { label: '全部商品', value: 'all' },
  { label: '在售中', value: 'on-sale' },
  { label: '已下架', value: 'off-shelf' },
]
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
      <div class="sidebar-footer"><span class="shop-dot" />{{ auth.displayName }}</div>
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
          </div>
          <ElButton
            type="primary"
            :icon="Plus"
            size="large"
            :disabled="actionsBusy"
            @click="openEditor()"
            >新增商品</ElButton
          >
        </div>

        <ElAlert
          v-if="actionSuccess"
          class="merchant-action-feedback"
          :title="actionSuccess"
          type="success"
          :closable="false"
          show-icon
        />
        <ElAlert
          v-if="actionError"
          class="merchant-action-feedback"
          :title="actionError"
          type="error"
          :closable="false"
          show-icon
        />

        <section
          class="merchant-stats"
          aria-label="商品概况"
          :aria-busy="statsState === 'loading'"
          aria-live="polite"
        >
          <div class="stat-card">
            <span>全部商品</span><strong>{{ stats?.allCount ?? '—' }}<small>件</small></strong
            ><ElIcon><Box /></ElIcon>
          </div>
          <div class="stat-card">
            <span>在售商品</span><strong>{{ stats?.onSaleCount ?? '—' }}<small>件</small></strong
            ><span class="stat-dot is-selling" />
          </div>
          <div class="stat-card">
            <span>已下架商品</span
            ><strong>{{ stats?.offShelfCount ?? '—' }}<small>件</small></strong
            ><span class="stat-dot" />
          </div>
        </section>

        <p v-if="statsState === 'loading'" class="merchant-stats-loading" role="status">
          商品统计加载中…
        </p>
        <div v-else-if="statsState !== 'success'" class="merchant-stats-error">
          <ElAlert :title="statsError" type="error" :closable="false" show-icon />
          <ElButton v-if="statsState === 'error'" @click="retryStats">重新加载统计</ElButton>
        </div>

        <section class="inventory-panel" aria-label="商品列表" :aria-busy="state === 'loading'">
          <div class="inventory-toolbar">
            <div class="status-tabs" role="group" aria-label="按上架状态筛选">
              <button
                v-for="tab in tabs"
                :key="tab.value"
                :class="{ selected: status === tab.value }"
                :aria-pressed="status === tab.value"
                @click="selectStatus(tab.value)"
              >
                {{ tab.label }}
              </button>
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
                <tr v-for="product in products" :key="product.id">
                  <td>
                    <div class="product-summary">
                      <ElImage
                        v-if="product.imageUrl"
                        :key="`${product.id}:${product.imageUrl}`"
                        :src="product.imageUrl"
                        :alt="product.name"
                        fit="contain"
                        class="product-cover"
                      >
                        <template #placeholder
                          ><span class="product-placeholder" aria-hidden="true"
                            ><ElIcon><Box /></ElIcon></span
                        ></template>
                        <template #error
                          ><span class="product-placeholder" aria-hidden="true"
                            ><ElIcon><Box /></ElIcon></span
                        ></template>
                      </ElImage>
                      <span v-else class="product-placeholder" aria-hidden="true"
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
                    <span class="category-label">{{ product.categoryLabel }}</span>
                  </td>
                  <td class="product-price">
                    {{
                      product.priceFen === null
                        ? '价格待确认'
                        : `¥ ${formatPriceFen(product.priceFen)}`
                    }}
                  </td>
                  <td>
                    <span :class="{ 'stock-empty': product.stock === 0 }">{{ product.stock }}</span
                    ><small v-if="product.stock === 0" class="stock-note">待补货</small>
                  </td>
                  <td>
                    <span
                      class="product-status"
                      :class="{ 'is-selling': merchantProductDisplay(product, now).selling }"
                      ><i />{{ merchantProductDisplay(product, now).label }}</span
                    >
                  </td>
                  <td>
                    <div class="product-actions">
                      <button
                        :aria-label="`编辑${product.name}`"
                        :disabled="actionsBusy"
                        @click="openEditor(product)"
                      >
                        <ElIcon><EditPen /></ElIcon>编辑</button
                      ><button
                        :aria-label="`${product.status === 1 ? '下架' : '上架'}${product.name}`"
                        :disabled="actionsBusy"
                        :aria-busy="pendingStatusId === product.id"
                        @click="changeStatus(product)"
                      >
                        {{
                          pendingStatusId === product.id
                            ? '处理中…'
                            : product.status === 1
                              ? '下架'
                              : '上架'
                        }}
                      </button>
                    </div>
                  </td>
                </tr>
                <tr v-if="state === 'loading'">
                  <td colspan="6" class="inventory-empty"><p role="status">商品列表加载中…</p></td>
                </tr>
                <tr v-else-if="!['success', 'empty'].includes(state)">
                  <td colspan="6" class="inventory-empty">
                    <ElAlert :title="errorMessage" type="error" :closable="false" show-icon />
                    <button v-if="state === 'error'" @click="retry">重新加载商品</button>
                  </td>
                </tr>
                <tr v-else-if="state === 'empty'">
                  <td colspan="6" class="inventory-empty">
                    <ElIcon><Box /></ElIcon>
                    <p>没有找到符合条件的商品</p>
                    <button @click="resetFilters">清除筛选</button>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <footer class="inventory-footer">
            <span aria-live="polite">共 {{ total ?? '—' }} 件商品</span>
            <ElPagination
              v-if="total !== null && total > 0"
              :current-page="pageNum"
              :page-size="pageSize"
              :total="total"
              layout="prev, pager, next"
              @current-change="changePage"
            />
          </footer>
        </section>
        <p class="merchant-footnote">经纬智选 · 商家工作台</p>
      </main>
    </div>
    <MerchantProductEditor
      v-model="editorVisible"
      :product="editingProduct"
      :error="editorError"
      :saving="saving"
      @save="save"
    />
  </div>
</template>

<style scoped src="@/assets/merchant.css"></style>
