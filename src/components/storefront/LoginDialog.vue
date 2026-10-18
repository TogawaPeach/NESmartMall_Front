<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch } from 'vue'
import { ElAlert, ElButton, ElDialog, ElForm, ElFormItem, ElInput } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import { Lock, User } from '@element-plus/icons-vue'
import { useAuthStore } from '@/stores/auth'
import type { RegisterCredentials } from '@/types/auth'

const visible = defineModel<boolean>({ required: true })
defineProps<{ description?: string }>()
const auth = useAuthStore()
const mode = ref<'login' | 'register'>('login')
const isRegister = computed(() => mode.value === 'register')
const form = reactive<RegisterCredentials>({ account: '', nickname: '', password: '' })
const formRef = ref<FormInstance>()
const accountInput = ref<InstanceType<typeof ElInput>>()
const submitting = ref(false)
const errorMessage = ref('')
let controller: AbortController | undefined
let loginTrigger: HTMLElement | null = null
let revision = 0

const rules: FormRules = {
  account: [{ required: true, whitespace: true, message: '请输入账号', trigger: 'blur' }],
  password: [{ required: true, message: '请输入密码', trigger: 'blur' }],
}
const registrationRules: FormRules = {
  account: [
    {
      validator: (_rule, value, callback) => {
        callback(
          /^1[3-9]\d{9}$/.test(String(value).trim())
            ? undefined
            : new Error('请输入有效的11位手机号'),
        )
      },
      required: true,
      trigger: 'blur',
    },
  ],
  nickname: [
    {
      validator: (_rule, value, callback) => {
        const nickname = String(value).trim()
        callback(nickname && nickname.length <= 64 ? undefined : new Error('昵称须为1至64个字符'))
      },
      required: true,
      trigger: 'blur',
    },
  ],
  password: [{ required: true, whitespace: true, message: '请输入密码', trigger: 'blur' }],
}

function clearMessages() {
  errorMessage.value = ''
}

async function switchMode() {
  if (submitting.value) return
  revision++
  mode.value = isRegister.value ? 'login' : 'register'
  form.password = ''
  form.nickname = ''
  clearMessages()
  await nextTick()
  formRef.value?.clearValidate()
  focusAccount()
}

function reset() {
  revision++
  controller?.abort()
  controller = undefined
  submitting.value = false
  mode.value = 'login'
  form.account = ''
  form.nickname = ''
  form.password = ''
  clearMessages()
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
  const requestRevision = revision
  const registering = isRegister.value
  const valid = await formRef.value?.validate().catch(() => false)
  if (!valid || !visible.value || submitting.value || requestRevision !== revision) return
  const request = new AbortController()
  controller = request
  submitting.value = true
  clearMessages()
  try {
    const signedIn = registering
      ? await auth.signUp({ ...form }, { signal: request.signal })
      : await auth.signIn(
          { account: form.account, password: form.password },
          { signal: request.signal },
        )
    if (signedIn && !request.signal.aborted && controller === request) visible.value = false
  } catch (error) {
    if (!request.signal.aborted) {
      errorMessage.value =
        error instanceof Error ? error.message : `${registering ? '注册' : '登录'}失败，请稍后重试`
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
    :class="{ 'is-register': isRegister }"
    :title="isRegister ? '注册经纬智选' : '登录经纬智选'"
    width="420px"
    align-center
    append-to-body
    destroy-on-close
    :close-on-click-modal="false"
    @opened="focusAccount"
    @close="reset"
    @closed="restoreFocus"
  >
    <p class="login-description">
      {{ isRegister ? '创建账号，开启你的选购之旅' : description || '登录后，继续你的选购之旅' }}
    </p>
    <ElForm
      ref="formRef"
      :model="form"
      :rules="isRegister ? registrationRules : rules"
      :validate-on-rule-change="false"
      label-position="top"
      @submit.prevent="submit"
    >
      <ElFormItem
        :label="isRegister ? '账号（手机号）' : '账号'"
        prop="account"
        for="login-account"
      >
        <ElInput
          id="login-account"
          ref="accountInput"
          v-model="form.account"
          name="username"
          autocomplete="username"
          :placeholder="isRegister ? '请输入11位手机号' : '请输入账号'"
          :inputmode="isRegister ? 'tel' : 'text'"
          :prefix-icon="User"
          :disabled="submitting"
          @input="clearMessages"
        />
      </ElFormItem>
      <ElFormItem v-if="isRegister" label="昵称" prop="nickname" for="register-nickname">
        <ElInput
          id="register-nickname"
          v-model="form.nickname"
          name="nickname"
          autocomplete="nickname"
          placeholder="请输入昵称"
          :prefix-icon="User"
          :disabled="submitting"
          @input="clearMessages"
        />
      </ElFormItem>
      <ElFormItem label="密码" prop="password" for="login-password">
        <ElInput
          id="login-password"
          v-model="form.password"
          name="password"
          type="password"
          :autocomplete="isRegister ? 'new-password' : 'current-password'"
          placeholder="请输入密码"
          show-password
          :prefix-icon="Lock"
          :disabled="submitting"
          @input="clearMessages"
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
        {{ isRegister ? (submitting ? '正在注册…' : '注册') : submitting ? '正在登录…' : '登录' }}
      </ElButton>
      <ElButton
        class="login-switch"
        type="primary"
        plain
        native-type="button"
        :disabled="submitting"
        @click="switchMode"
      >
        {{ isRegister ? '返回登录' : '注册' }}
      </ElButton>
    </ElForm>
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

.store-login-dialog .login-submit,
.store-login-dialog .login-switch {
  width: 100%;
  height: 46px;
  border-radius: 12px;
  font-size: 16px;
}

.store-login-dialog .login-switch {
  margin: 12px 0 0;
  border-color: var(--el-color-primary);
  background: transparent;
  color: var(--el-color-primary);
}

.store-login-dialog .login-switch:hover:not(:disabled) {
  background: var(--el-color-primary-light-9);
}

.store-login-dialog.is-register .el-form-item {
  margin-bottom: 20px;
}

@media (max-width: 599px) {
  .store-login-dialog.el-dialog {
    width: calc(100vw - 32px);
    padding: 24px;
  }
}
</style>
