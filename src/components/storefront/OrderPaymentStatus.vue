<script setup lang="ts">
import { watch } from 'vue'
import type { OrderSummary } from '@/types/order'
import { usePaymentDeadline } from '@/composables/usePaymentDeadline'
const props = defineProps<{ order: OrderSummary }>()
const emit = defineEmits<{ expired: [] }>()
const { remainingMs, notice } = usePaymentDeadline(() => props.order)
// Only a transition to expiry triggers a refresh; an already-expired response cannot loop.
watch(remainingMs, (value, previous) => {
  if (value === 0 && previous !== null && previous !== undefined && previous > 0) emit('expired')
})
</script>
<template>
  <p v-if="notice" class="order-payment-notice" role="status">{{ notice }}</p>
</template>
<style scoped>
.order-payment-notice {
  margin: 0;
  font-size: 12px;
  color: var(--store-muted);
  line-height: 1.6;
}
</style>
