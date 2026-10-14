<script setup lang="ts">
import { onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'

const visible = defineModel<boolean>({ required: true })
defineProps<{ description?: string }>()
const auth = useAuthStore()
const form = reactive({ account: '', password: '' })
const formRef = ref<FormInstance>()
const accountInput = ref<InstanceType<typeof ElInput>>()
const submitting = ref(false)
const errorMessage = ref('')
let controller: AbortController | undefined
let loginTrigger: HTMLElement | null = null

const rules: FormRules = {
  account: [{ required: true, whitespace: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}

function reset() {
  controller?.abort()
  controller = undefined
  submitting.value = false
  form.account = ''
  form.password = ''
  errorMessage.value = ''
  formRef.value?.clearValidate()
}

watch(
  visible,
  (opened) => {
    reset()
    if (opened)
      loginTrigger = document.activeElement instanceof HTMLElement ? document.activeElement : null
  },
  { flush: 'sync' },
)
onBeforeUnmount(reset)

function restoreFocus() {
  // A successful catalogue login replaces its login button with the results.
  if (loginTrigger && !loginTrigger.isConnected) {
    document.getElementById('product-list')?.focus({ preventScroll: true })
  }
}

function focusAccount() {
  accountInput.value?.focus()
}

async function submit() {
  if (submitting.value) return
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !visible.value || submitting.value) return
  const request = new AbortController()
  controller = request
  submitting.value = true
  errorMessage.value = ''
  try {
    const signedIn = await auth.signIn(
      { account: form.account, password: form.password },
      { signal: request.signal },
    )
    if (signedIn && !request.signal.aborted) visible.value = false
  } catch (error) {
    if (!request.signal.aborted) {
      errorMessage.value = error instanceof Error ? error.message : '登录失败，请稍后重试'
      form.password = ''
    }
  } finally {
    if (controller === request) {
      submitting.value = false
      controller = undefined
    }
  }
}
</script>

<template>
  <ElDialog
    v-model="visible"
    class="store-login-dialog"
    title="登录经纬智选"
    width="420px"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @opened="focusAccount"
    @close="reset"
    @closed="restoreFocus"
  >
    <p class="login-description">{{ description || '登录后，继续你的选购之旅' }}</p>
    <ElForm
      ref="formRef"
      :model="form"
      :rules="rules"
      label-position="top"
      @submit.prevent="submit"
    >
      <ElFormItem label="账号" prop="account" for="login-account">
        <ElInput
          id="login-account"
          ref="accountInput"
          v-model="form.account"
          name="username"
          autocomplete="username"
          placeholder="请输入账号"
          :prefix-icon="User"
          :disabled="submitting"
          @input="errorMessage = ''"
        />
      </ElFormItem>
      <ElFormItem label="密码" prop="password" for="login-password">
        <ElInput
          id="login-password"
          v-model="form.password"
          name="password"
          type="password"
          autocomplete="current-password"
          placeholder="请输入密码"
          show-password
          :prefix-icon="Lock"
          :disabled="submitting"
          @input="errorMessage = ''"
        />
      </ElFormItem>
      <ElAlert
        v-if="errorMessage"
        :title="errorMessage"
        type="error"
        show-icon
        :closable="false"
        class="login-error"
      />
      <ElButton class="login-submit" type="primary" native-type="submit" :loading="submitting">
        {{ submitting ? '正在登录…' : '登录' }}
      </ElButton>
    </ElForm>
    <p class="login-note">登录成功后将继续停留在当前页面</p>
  </ElDialog>
</template>

<style>
.store-login-dialog.el-dialog {
  max-width: calc(100vw - 32px);
  padding: 28px;
  border: 1px solid var(--store-border);
  border-radius: 20px;
  background: var(--store-surface);
}

.store-login-dialog .el-dialog__header {
  padding-bottom: 0;
}

.store-login-dialog .el-dialog__title {
  font-size: 23px;
  font-weight: 600;
}

.store-login-dialog .el-dialog__headerbtn {
  top: 14px;
  right: 14px;
}

.store-login-dialog .login-description {
  margin: 10px 0 26px;
  color: var(--store-muted);
  font-size: 14px;
}

.store-login-dialog .el-form-item {
  margin-bottom: 24px;
}

.store-login-dialog .el-input {
  height: 46px;
}

.store-login-dialog .el-input__wrapper {
  padding: 0 14px;
  background: var(--store-background);
}

.store-login-dialog .login-error {
  margin-bottom: 20px;
}

.store-login-dialog .login-submit {
  width: 100%;
  height: 46px;
  border-radius: 12px;
  font-size: 16px;
}

.store-login-dialog .login-note {
  margin: 18px 0 0;
  color: var(--store-muted);
  font-size: 12px;
  text-align: center;
}

@media (max-width: 599px) {
  .store-login-dialog.el-dialog {
    width: calc(100vw - 32px);
    padding: 24px;
  }
}
</style>
