<script setup lang="ts">
import { ElButton } from 'element-plus'
import { productCategories } from '@/constants/productCategories'
import type { ProductCategoryKey } from '@/types/product'

defineProps<{ category: ProductCategoryKey }>()

const emit = defineEmits<{
  'select-category': [category: ProductCategoryKey]
}>()
</script>

<template>
  <div class="category-filter" role="group" aria-label="商品分类">
    <div class="category-box">
      <ElButton
        v-for="item in productCategories"
        :key="item.key"
        class="category-button"
        :class="{ 'is-selected': category === item.key }"
        :aria-pressed="category === item.key"
        @click="emit('select-category', item.key)"
      >
        {{ item.label }}
      </ElButton>
    </div>
  </div>
</template>

<style scoped>
.category-filter {
  display: flex;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  padding: 3px;
  margin: -3px;
  scrollbar-width: thin;
  scrollbar-color: var(--store-scrollbar) transparent;
}

.category-box {
  display: flex;
  flex-shrink: 0;
  align-items: center;
  justify-content: center;
  width: max-content;
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--store-border);
  border-radius: 28px;
  background: var(--store-filter-background);
}

.category-button {
  --el-button-text-color: var(--store-text);
  --el-button-bg-color: transparent;
  --el-button-border-color: transparent;
  --el-button-hover-text-color: var(--store-text);
  --el-button-hover-bg-color: var(--store-hover);
  --el-button-hover-border-color: transparent;
  --el-button-active-text-color: var(--store-text);
  --el-button-active-bg-color: var(--store-selected);
  --el-button-active-border-color: transparent;
  flex-shrink: 0;
  height: 40px;
  margin: 0;
  padding: 0 14px;
  border-radius: 24px;
  font-size: 17px;
  font-weight: 500;
}

.category-button.is-selected {
  --el-button-bg-color: var(--store-selected);
  --el-button-hover-bg-color: var(--store-selected);
  font-weight: 600;
}

.category-button:focus-visible {
  outline: 2px solid var(--store-focus);
  outline-offset: 3px;
}

@media (max-width: 1023px) {
  .category-box {
    gap: 4px;
  }

  .category-button {
    padding: 0 12px;
    font-size: 14px;
  }
}
</style>
