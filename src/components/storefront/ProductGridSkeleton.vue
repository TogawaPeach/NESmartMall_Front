<script setup lang="ts">
import { ElSkeleton, ElSkeletonItem } from 'element-plus'
</script>

<template>
  <div class="product-grid" aria-hidden="true">
    <ElSkeleton v-for="index in 4" :key="index" class="skeleton-card" animated>
      <template #template>
        <ElSkeletonItem variant="image" class="skeleton-image" />
        <div class="skeleton-details">
          <ElSkeletonItem variant="h3" class="skeleton-name" />
          <ElSkeletonItem variant="text" class="skeleton-category" />
          <div class="skeleton-parameters">
            <ElSkeletonItem variant="text" />
            <ElSkeletonItem variant="text" />
          </div>
          <ElSkeletonItem variant="h3" class="skeleton-price" />
        </div>
      </template>
    </ElSkeleton>
  </div>
</template>

<style scoped>
.skeleton-card {
  overflow: hidden;
  min-height: 598px;
  padding: 24px;
  border: 1px solid var(--store-border);
  border-radius: 12px;
  background: var(--store-surface);
}

.skeleton-image {
  width: 100%;
  height: 304px;
}

.skeleton-details {
  padding-top: 28px;
}

.skeleton-name {
  width: 85%;
  height: 28px;
}

.skeleton-category {
  width: 38%;
  height: 18px;
  margin-top: 14px;
}

.skeleton-parameters {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin: 20px 0;
  padding: 16px 0;
  border-top: 1px solid var(--store-border);
  border-bottom: 1px solid var(--store-border);
}

.skeleton-parameters .el-skeleton__item {
  width: 68%;
  height: 18px;
}

.skeleton-price {
  width: 48%;
  height: 32px;
}

@media (max-width: 1199px) {
  .skeleton-card {
    min-height: 578px;
  }

  .skeleton-image {
    height: 284px;
  }
}

@media (max-width: 599px) {
  .skeleton-card {
    min-height: 558px;
  }

  .skeleton-image {
    height: 264px;
  }
}
</style>
