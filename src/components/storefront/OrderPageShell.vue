<script setup lang="ts">
import { ref } from 'vue'
import StorefrontHeader from './StorefrontHeader.vue'
import '@/assets/orders.css'

defineProps<{ title: string }>()
const keyword = ref('')
const isMock = import.meta.env.DEV && import.meta.env.VITE_ORDER_MOCK === 'true'
</script>

<template>
  <div class="storefront orders-page">
    <a class="order-skip-link" href="#order-main">跳转到订单内容</a>
    <StorefrontHeader v-model:keyword="keyword" />
    <main id="order-main" class="order-main" tabindex="-1" aria-labelledby="order-title">
      <nav class="order-breadcrumb" aria-label="当前位置">
        <RouterLink :to="{ name: 'home' }">首页</RouterLink><span aria-hidden="true">/</span>
        <slot name="breadcrumb"><span aria-current="page">我的订单</span></slot>
      </nav>
      <div class="order-page-heading">
        <h1 id="order-title">{{ title }}</h1>
        <slot name="heading-action" />
      </div>
      <p v-if="isMock" class="order-demo-note" role="note">
        开发模拟订单 · 以下交易、商品及收货信息均为虚构
      </p>
      <slot />
    </main>
  </div>
</template>
