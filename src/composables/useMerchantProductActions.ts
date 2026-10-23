import axios from 'axios'
import { computed, onScopeDispose, ref, shallowRef, watch } from 'vue'
import {
  queryMerchantProductImages,
  saveMerchantProduct,
  setMerchantProductStatus,
} from '@/api/merchantProductActions'
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
  const loadingEditor = ref(false)
  const offShelfProduct = shallowRef<MerchantProductRow | null>(null)
  const busy = computed(() => loadingEditor.value || saving.value || pendingStatusId.value !== null)
  const offShelfVisible = computed({
    get: () => offShelfProduct.value !== null,
    set: (visible) => {
      if (!visible) cancelOffShelf()
    },
  })
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
    loadingEditor.value = false
    offShelfProduct.value = null
    editorError.value = ''
    errorMessage.value = ''
    successMessage.value = ''
  }
  async function openEditor(product: MerchantProductRow | null = null) {
    if (disposed || busy.value || offShelfProduct.value) return
    const identitySequence = sequence
    const authorization = auth.getAuthorization()
    if (identitySequence !== sequence) return
    if (!authorization || auth.user?.role !== 0) {
      errorMessage.value = '请先登录商家账号'
      return
    }
    editorError.value = ''
    errorMessage.value = ''
    successMessage.value = ''
    if (product && product.status !== 1 && product.detailImages === undefined) {
      const request = ++sequence
      const current = new AbortController()
      controller = current
      loadingEditor.value = true
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
        const detailImages = await queryMerchantProductImages(product.id, {
          signal: current.signal,
          expectedAuthorization: authorization,
        })
        if (!isCurrent()) return
        editingProduct.value = { ...product, detailImages }
        editorVisible.value = true
      } catch (error) {
        if (isCurrent() && !axios.isCancel(error))
          errorMessage.value =
            error instanceof Error ? error.message : '商品详情图读取失败，请稍后重试'
      } finally {
        if (isCurrent()) loadingEditor.value = false
      }
      return
    }
    editingProduct.value = product
      ? { ...product, detailImages: product.status === 1 ? undefined : [...product.detailImages!] }
      : null
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
    if (disposed || busy.value || !editorVisible.value || offShelfProduct.value) return false
    try {
      const id = editingProduct.value?.id
      const input = buildMerchantProductInput(draft, id, {
        preserveDetailImages: editingProduct.value?.status === 1,
      })
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
    if (disposed || busy.value || offShelfProduct.value) return false
    if (product.status === 1) {
      const identitySequence = sequence
      const authorization = auth.getAuthorization()
      if (identitySequence !== sequence) return false
      if (!authorization || auth.user?.role !== 0) {
        errorMessage.value = '请先登录商家账号'
        return false
      }
      errorMessage.value = ''
      successMessage.value = ''
      offShelfProduct.value = { ...product }
      return false
    }
    if (product.stock < 1 || product.priceFen === null || product.priceFen <= 0) {
      successMessage.value = ''
      errorMessage.value = '请先补充库存并设置有效售价，再上架商品'
      return false
    }
    return run(
      (options) => setMerchantProductStatus(product.id, 1, options),
      'status',
      '商品已上架',
      false,
      product.id,
    )
  }
  function cancelOffShelf() {
    if (busy.value) return
    offShelfProduct.value = null
    errorMessage.value = ''
  }
  async function confirmOffShelf(): Promise<boolean> {
    const product = offShelfProduct.value
    if (!product || busy.value || disposed) return false
    const success = await run(
      (options) => setMerchantProductStatus(product.id, 2, options),
      'status',
      '商品已下架',
      false,
      product.id,
    )
    if (success && offShelfProduct.value?.id === product.id) offShelfProduct.value = null
    return success
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
    loadingEditor,
    offShelfProduct,
    offShelfVisible,
    cancelOffShelf,
    confirmOffShelf,
    busy,
    errorMessage,
    successMessage,
    openEditor,
    save,
    changeStatus,
  }
}
