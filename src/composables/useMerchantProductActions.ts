import axios from 'axios'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import { saveMerchantProduct, setMerchantProductStatus } from '@/api/merchantProductActions'
import { useAuthStore } from '@/stores/auth'
import { buildMerchantProductInput } from '@/utils/merchantProductForm'
import type { MerchantProductForm, MerchantProductRow } from '@/types/merchant'
import type { SessionRequestOptions } from '@/api/http'

export function useMerchantProductActions(refresh: (created: boolean) => Promise<unknown>) {
  const auth = useAuthStore()
  const editorVisible = ref(false)
  const editingProduct = shallowRef<MerchantProductRow | null>(null)
  const saving = ref(false)
  const pendingStatusId = ref<string | null>(null)
  const busy = computed(() => saving.value || pendingStatusId.value !== null)
  const editorError = ref(''),
    errorMessage = ref(''),
    successMessage = ref('')
  let sequence = 0
  let controller: AbortController | undefined
  let disposed = false

  function clear() {
    ++sequence
    controller?.abort()
    editorVisible.value = false
    editingProduct.value = null
    saving.value = false
    pendingStatusId.value = null
    editorError.value = ''
    errorMessage.value = ''
    successMessage.value = ''
  }
  function openEditor(product: MerchantProductRow | null = null) {
    if (disposed || busy.value) return
    editingProduct.value = product ? { ...product } : null
    editorError.value = ''
    errorMessage.value = ''
    successMessage.value = ''
    editorVisible.value = true
  }

  async function run(
    task: (options: SessionRequestOptions) => Promise<void>,
    kind: 'save' | 'status',
    message: string,
    created: boolean,
    id?: string,
  ): Promise<boolean> {
    const identitySequence = sequence
    const authorization = auth.getAuthorization()
    // Synchronizing a cross-tab login invalidates the old form/row before dispatch.
    if (disposed || busy.value || sequence !== identitySequence) return false
    if (!authorization || auth.user?.role !== 0) {
      const target = kind === 'save' ? editorError : errorMessage
      target.value = authorization ? '暂无权限操作商品' : '请先登录商家账号'
      return false
    }
    const request = ++sequence
    const current = new AbortController()
    controller = current
    saving.value = kind === 'save'
    pendingStatusId.value = kind === 'status' ? id! : null
    editorError.value = ''
    errorMessage.value = ''
    successMessage.value = ''
    const isCurrent = () => {
      const latest = auth.getAuthorization()
      return (
        !disposed &&
        request === sequence &&
        !current.signal.aborted &&
        latest === authorization &&
        auth.user?.role === 0
      )
    }
    try {
      await task({ signal: current.signal, expectedAuthorization: authorization })
      if (!isCurrent()) return false
      if (kind === 'save') {
        editorVisible.value = false
        editingProduct.value = null
      }
      successMessage.value = message
      try {
        await refresh(created)
      } catch {
        if (isCurrent()) errorMessage.value = '操作已成功，但数据刷新失败，请重新加载商品'
      }
      return isCurrent()
    } catch (error) {
      if (!isCurrent() || axios.isCancel(error)) return false
      const target = kind === 'save' ? editorError : errorMessage
      target.value = error instanceof Error ? error.message : '商品操作失败，请稍后重试'
      return false
    } finally {
      if (isCurrent()) {
        saving.value = false
        pendingStatusId.value = null
      }
    }
  }

  async function save(draft: MerchantProductForm): Promise<boolean> {
    if (disposed || busy.value || !editorVisible.value) return false
    try {
      const id = editingProduct.value?.id
      const input = buildMerchantProductInput(draft, id)
      return await run(
        (options) => saveMerchantProduct(input, options),
        'save',
        id ? '商品资料已更新' : '商品已保存，可点击上架',
        !id,
      )
    } catch (error) {
      editorError.value = error instanceof Error ? error.message : '请检查商品信息'
      return false
    }
  }
  async function changeStatus(product: MerchantProductRow): Promise<boolean> {
    if (disposed || busy.value) return false
    const next = product.status === 1 ? 2 : 1
    if (next === 1 && (product.stock < 1 || product.priceFen === null || product.priceFen <= 0)) {
      successMessage.value = ''
      errorMessage.value = '请先补充库存并设置有效售价，再上架商品'
      return false
    }
    return run(
      (options) => setMerchantProductStatus(product.id, next, options),
      'status',
      next === 1 ? '商品已上架' : '商品已下架',
      false,
      product.id,
    )
  }
  watch(() => [auth.accessToken, auth.user?.id, auth.user?.role], clear, { flush: 'sync' })
  onScopeDispose(() => {
    disposed = true
    clear()
  })
  return {
    editorVisible,
    editingProduct,
    editorError,
    saving,
    pendingStatusId,
    busy,
    errorMessage,
    successMessage,
    openEditor,
    save,
    changeStatus,
  }
}
