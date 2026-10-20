<script setup lang="ts">
import { RouterView, useRoute } from 'vue-router'
import CustomerServiceWidget from '@/components/storefront/CustomerServiceWidget.vue'
const route = useRoute()
</script>

<template>
  <RouterView />
  <CustomerServiceWidget v-if="!route.meta.merchantOnly" />
</template>
