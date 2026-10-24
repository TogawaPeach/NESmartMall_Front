<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import { merchantCategoryLabel } from '@/utils/merchantProduct'
import { merchantProductDraft } from '@/utils/merchantProductForm'
import type { MerchantProductForm, MerchantProductRow } from '@/types/merchant'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ product: MerchantProductRow | null; error: string; saving: boolean }>()
const emit = defineEmits<{ save: [draft: MerchantProductForm] }>()
const categories = Array.from({ length: 6 }, (_, id) => ({ id, label: merchantCategoryLabel(id) }))
const draft = reactive<MerchantProductForm>(merchantProductDraft(null))

function removeDetailImage(index: number) {
  if (draft.detailImages.length === 1) draft.detailImages[0] = ''
  else draft.detailImages.splice(index, 1)
}

watch(
  [visible, () => props.product],
  ([opened]) => {
    if (!opened) return
    Object.assign(draft, merchantProductDraft(props.product))
  },
  { immediate: true },
)
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="product ? '修改商品' : '新增商品'"
    width="min(560px, calc(100vw - 32px))"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    :close-on-press-escape="!saving"
    :show-close="!saving"
    class="merchant-editor-dialog"
  >
    <p v-if="!product" class="editor-hint">新增商品默认下架，保存后可单独上架。</p>
    <form class="editor-form" novalidate @submit.prevent="emit('save', { ...draft })">
      <fieldset class="editor-fields" :disabled="saving">
        <label class="editor-field" for="merchant-name">
          商品名称 <span aria-hidden="true">*</span>
          <input
            id="merchant-name"
            v-model="draft.name"
            maxlength="80"
            required
            placeholder="请输入商品名称"
          />
        </label>
        <div class="editor-row">
          <label class="editor-field" for="merchant-model">
            商品型号
            <input
              id="merchant-model"
              v-model="draft.model"
              maxlength="80"
              placeholder="例如 TS-02"
            />
          </label>
          <label class="editor-field" for="merchant-category">
            商品分类 <span aria-hidden="true">*</span>
            <select id="merchant-category" v-model="draft.categoryId" required>
              <option v-for="category in categories" :key="category.id" :value="category.id">
                {{ category.label }}
              </option>
            </select>
          </label>
        </div>
        <div class="editor-row">
          <label class="editor-field" for="merchant-price">
            售价（元）<span aria-hidden="true">*</span>
            <input
              id="merchant-price"
              v-model="draft.priceYuan"
              inputmode="decimal"
              required
              placeholder="例如 199.00"
            />
          </label>
          <label class="editor-field" for="merchant-stock">
            库存（件）<span aria-hidden="true">*</span>
            <input
              id="merchant-stock"
              v-model="draft.stock"
              inputmode="numeric"
              required
              placeholder="请输入库存数量"
            />
          </label>
        </div>
        <label class="editor-field" for="merchant-cover">
          商品头图地址
          <input
            id="merchant-cover"
            v-model="draft.coverUrl"
            type="url"
            placeholder="https://example.com/product.jpg（选填）"
          />
        </label>
        <div
          v-if="!product || product.status !== 1"
          class="editor-detail-images"
          role="group"
          aria-label="详情图片链接"
        >
          <div class="editor-detail-heading">
            <strong>详情图片链接（选填）</strong>
            <ElButton
              native-type="button"
              size="small"
              :disabled="saving"
              @click="draft.detailImages.push('')"
              >添加图片链接</ElButton
            >
          </div>
          <div v-for="(_, index) in draft.detailImages" :key="index">
            <label class="editor-field" :for="`merchant-detail-image-${index}`"
              >详情图片链接 {{ index + 1 }}</label
            >
            <div class="editor-detail-row">
              <input
                :id="`merchant-detail-image-${index}`"
                v-model="draft.detailImages[index]"
                type="url"
                placeholder="https://example.com/detail.jpg（选填）"
              />
              <ElButton
                native-type="button"
                :disabled="saving"
                :aria-label="`移除详情图片链接 ${index + 1}`"
                @click="removeDetailImage(index)"
                >移除</ElButton
              >
            </div>
          </div>
        </div>
        <p v-else class="editor-hint">详情图请先下架后查看和修改。</p>
        <label v-if="!product" class="editor-toggle" for="merchant-seckill">
          <input id="merchant-seckill" v-model="draft.isSeckill" type="checkbox" />
          是否为秒杀商品
        </label>
        <p v-else class="editor-product-type">
          商品类型：{{ product.isSeckill ? '秒杀商品' : '普通商品' }}（创建后不可更改）
        </p>
        <div v-if="draft.isSeckill" class="editor-row">
          <label class="editor-field" for="merchant-seckill-start">
            秒杀开始时间（北京时间）<span aria-hidden="true">*</span>
            <input
              id="merchant-seckill-start"
              v-model="draft.seckillStartTime"
              type="datetime-local"
              step="0.001"
              required
            />
          </label>
          <label class="editor-field" for="merchant-seckill-end">
            秒杀结束时间（北京时间）<span aria-hidden="true">*</span>
            <input
              id="merchant-seckill-end"
              v-model="draft.seckillEndTime"
              type="datetime-local"
              step="0.001"
              required
            />
          </label>
        </div>
      </fieldset>
      <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
      <div class="editor-actions">
        <ElButton native-type="button" :disabled="saving" @click="visible = false">取消</ElButton>
        <ElButton type="primary" native-type="submit" :loading="saving" :disabled="saving">{{
          product ? '保存修改' : '保存商品'
        }}</ElButton>
      </div>
    </form>
  </ElDialog>
</template>

<style scoped>
.editor-hint {
  margin: 0 0 24px;
  color: var(--store-muted);
  font-size: 13px;
}
.editor-form {
  display: grid;
  gap: 20px;
}
.editor-product-type {
  margin: 0;
  color: var(--store-muted);
  font-size: 13px;
}
.editor-fields {
  display: grid;
  gap: 20px;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}
.editor-toggle {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--store-text);
  font-size: 13px;
}
.editor-toggle input {
  accent-color: var(--store-accent);
}
.editor-field {
  display: block;
  min-width: 0;
  color: var(--store-text);
  font-size: 13px;
  font-weight: 500;
}
.editor-field span {
  color: #b34735;
}
.editor-field input,
.editor-detail-row input,
.editor-field select,
.editor-field textarea {
  display: block;
  width: 100%;
  margin-top: 9px;
  padding: 11px 12px;
  border: 1px solid var(--store-border);
  border-radius: 7px;
  background: var(--store-surface);
  color: var(--store-text);
  font: inherit;
  font-weight: 400;
}
.editor-field textarea {
  resize: vertical;
}
.editor-field input::placeholder,
.editor-detail-row input::placeholder,
.editor-field textarea::placeholder {
  color: var(--store-placeholder);
}
.editor-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
}
.editor-detail-images {
  display: grid;
  gap: 14px;
}
.editor-detail-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.editor-detail-heading strong {
  color: var(--store-text);
  font-size: 13px;
  font-weight: 500;
}
.editor-detail-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: end;
  gap: 10px;
}
.editor-detail-row input {
  min-width: 0;
}
.editor-actions {
  display: flex;
  justify-content: flex-end;
  padding-top: 16px;
  border-top: 1px solid var(--store-border);
}
.editor-actions .el-button--primary {
  color: var(--store-surface);
}
.editor-error {
  margin: 0;
  color: #b34735;
  font-size: 13px;
}
@media (max-width: 450px) {
  .editor-row {
    grid-template-columns: 1fr;
  }
}
</style>
