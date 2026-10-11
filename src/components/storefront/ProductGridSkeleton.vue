<script setup lang="ts">
import { ElSkeleton, ElSkeletonItem } from 'element-plus'
</script>

<template>
  <div class="product-grid" aria-hidden="true">
    <ElSkeleton v-for="index in 10" :key="index" class="skeleton-card" animated>
      <template #template>
        <ElSkeletonItem variant="image" class="skeleton-image" />
        <div class="skeleton-details">
          <ElSkeletonItem variant="h3" class="skeleton-name" />
          <ElSkeletonItem variant="text" class="skeleton-name-line" />
          <div class="skeleton-summary">
            <ElSkeletonItem variant="h3" class="skeleton-price" />
            <ElSkeletonItem variant="text" class="skeleton-sales" />
          </div>
        </div>
      </template>
    </ElSkeleton>
  </div>
</template>

<style scoped>
.skeleton-card {
  overflow: hidden;
  padding: 12px;
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}

.skeleton-image {
  width: 100%;
  height: auto;
  aspect-ratio: 1;
}

.skeleton-details {
  padding: 14px 4px 6px;
}

.skeleton-name {
  width: 85%;
  height: 24px;
}

.skeleton-name-line {
  width: 65%;
  height: 18px;
  margin-top: 8px;
}

.skeleton-summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  margin-top: 16px;
}

.skeleton-sales {
  width: 30%;
  height: 18px;
}

.skeleton-price {
  width: 48%;
  height: 32px;
}
</style>
