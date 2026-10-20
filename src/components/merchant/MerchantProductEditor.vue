<script setup lang="ts">
import { reactive, watch } from 'vue'
import { ElButton, ElDialog } from 'element-plus'
import { productCategories } from '@/constants/productCategories'
import type { MerchantProduct, MerchantProductDraft } from '@/types/merchant'

const visible = defineModel<boolean>({ required: true })
const props = defineProps<{ product: MerchantProduct | null; error: string }>()
const emit = defineEmits<{ save: [draft: MerchantProductDraft, id?: string] }>()
const categories = productCategories.filter((category) => category.key !== 'all')
const draft = reactive<MerchantProductDraft>({
  name: '',
  model: '',
  category: 'total-station',
  priceYuan: '',
  stock: '',
  description: '',
})

watch(visible, (opened) => {
  if (!opened) return
  const product = props.product
  Object.assign(
    draft,
    product
      ? {
          name: product.name,
          model: product.model,
          category: product.category,
          priceYuan: (product.priceFen / 100).toFixed(2),
          stock: String(product.stock),
          description: product.description,
        }
      : {
          name: '',
          model: '',
          category: 'total-station',
          priceYuan: '',
          stock: '',
          description: '',
        },
  )
})
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="product ? '编辑商品' : '新增商品'"
    width="min(560px, calc(100vw - 32px))"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    class="merchant-editor-dialog"
  >
    <p class="editor-hint">
      {{
        product
          ? '修改商品资料，保存后立即更新本页。'
          : '填写商品资料，新增商品默认处于未上架状态。'
      }}
    </p>
    <form class="editor-form" novalidate @submit.prevent="emit('save', { ...draft }, product?.id)">
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
          <select id="merchant-category" v-model="draft.category" required>
            <option v-for="category in categories" :key="category.key" :value="category.key">
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
      <label class="editor-field" for="merchant-description">
        商品说明
        <textarea
          id="merchant-description"
          v-model="draft.description"
          rows="3"
          maxlength="500"
          placeholder="简单介绍商品特点（选填）"
        />
      </label>
      <p v-if="error" class="editor-error" role="alert">{{ error }}</p>
      <div class="editor-actions">
        <ElButton native-type="button" @click="visible = false">取消</ElButton>
        <ElButton type="primary" native-type="submit">{{
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
.editor-field textarea::placeholder {
  color: var(--store-placeholder);
}
.editor-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;
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
