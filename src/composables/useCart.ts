import axios from 'axios'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import {
  CartQueryError,
  CartQuantityError,
  CartRemoveError,
  deleteCartItem,
  queryCart,
  setCartItemQuantity,
} from '@/api/cart'
import { useAuthStore } from '@/stores/auth'
import type { CartItem, CartLoadState } from '@/types/cart'
import { cartItemIssue, cartQuantityLimit, safeCartAmount } from '@/utils/cart'

export function useCart() {
  const auth = useAuthStore()
  const items = ref<CartItem[]>([])
  const state = ref<CartLoadState>('loading')
  const selectedIds = ref(new Set<string>())
  const updatingIds = ref(new Set<string>())
  const queuedIds = ref(new Set<string>())
  const deletingIds = ref(new Set<string>())
  const removeErrors = ref<Record<string, string>>({})
  const quantityErrors = ref<Record<string, string>>({})
  const quantityControllers = new Map<string, AbortController>()
  const quantityTimers = new Map<string, ReturnType<typeof setTimeout>>()
  const removeControllers = new Map<string, AbortController>()
  let controller: AbortController | undefined
  let sequence = 0

  function clear() {
    ++sequence
    controller?.abort()
    controller = undefined
    quantityControllers.forEach((request) => request.abort())
    quantityControllers.clear()
    quantityTimers.forEach((timer) => clearTimeout(timer))
    quantityTimers.clear()
    removeControllers.forEach((request) => request.abort())
    removeControllers.clear()
    deletingIds.value = new Set()
    removeErrors.value = {}
    queuedIds.value = new Set()
    updatingIds.value = new Set()
    quantityErrors.value = {}
    items.value = []
    selectedIds.value = new Set()
  }

  async function load() {
    // A refresh must not replace rows with queued or in-flight writes.
    if (updatingIds.value.size || queuedIds.value.size || deletingIds.value.size) return
    const authorization = auth.getAuthorization()
    if (controller && state.value === 'loading') return
    clear()
    if (!authorization) {
      state.value = 'login-required'
      return
    }
    const requestSequence = sequence
    const requestController = new AbortController()
    controller = requestController
    state.value = 'loading'
    const isCurrent = () => {
      // Refresh shared storage before accepting a response, even if storage events lag.
      const currentAuthorization = auth.getAuthorization()
      return (
        requestSequence === sequence &&
        !requestController.signal.aborted &&
        currentAuthorization === authorization
      )
    }
    try {
      const result = await queryCart({ signal: requestController.signal })
      if (!isCurrent()) return
      items.value = result
      state.value = result.length ? 'success' : 'empty'
    } catch (error: unknown) {
      if (!isCurrent() || axios.isCancel(error)) return
      state.value = error instanceof CartQueryError ? error.kind : 'error'
    }
  }

  function prepareQuantityChange(id: string, quantity: number | null | undefined) {
    const authorization = auth.getAuthorization()
    if (
      !authorization ||
      state.value !== 'success' ||
      updatingIds.value.has(id) ||
      deletingIds.value.has(id)
    )
      return
    const item = items.value.find((entry) => entry.cartItemId === id)
    if (!item || cartQuantityLimit(item) < 1) return
    delete quantityErrors.value[id]
    if (
      typeof quantity !== 'number' ||
      !Number.isSafeInteger(quantity) ||
      quantity < 1 ||
      quantity > cartQuantityLimit(item)
    ) {
      quantityErrors.value[id] = `请输入 1 至 ${cartQuantityLimit(item)} 的整数数量`
      return
    }
    return { item, quantity, authorization }
  }

  function cancelQueuedQuantity(id: string) {
    clearTimeout(quantityTimers.get(id))
    quantityTimers.delete(id)
    queuedIds.value.delete(id)
  }

  function scheduleQuantity(id: string, quantity: number | null | undefined) {
    if (updatingIds.value.has(id) || deletingIds.value.has(id)) return
    const change = prepareQuantityChange(id, quantity)
    cancelQueuedQuantity(id)
    if (!change || change.quantity === change.item.quantity) return
    const requestSequence = sequence
    queuedIds.value.add(id)
    quantityTimers.set(
      id,
      setTimeout(() => {
        cancelQueuedQuantity(id)
        const authorization = auth.getAuthorization()
        if (requestSequence !== sequence || authorization !== change.authorization) return
        void updateQuantity(id, change.quantity)
      }, 800),
    )
  }

  async function updateQuantity(id: string, value: number | null | undefined) {
    const change = prepareQuantityChange(id, value)
    if (!change) return
    const { item, quantity, authorization } = change
    if (quantity === item.quantity) return
    const requestSequence = sequence
    const requestController = new AbortController()
    quantityControllers.set(id, requestController)
    updatingIds.value.add(id)
    const isCurrent = () => {
      const currentAuthorization = auth.getAuthorization()
      return (
        currentAuthorization === authorization &&
        requestSequence === sequence &&
        !requestController.signal.aborted
      )
    }
    try {
      await setCartItemQuantity(item.productId, quantity, { signal: requestController.signal })
      if (isCurrent()) item.quantity = quantity
    } catch (error: unknown) {
      if (!isCurrent() || axios.isCancel(error)) return
      quantityErrors.value[id] =
        error instanceof CartQuantityError ? error.message : '修改数量失败，请稍后重试'
    } finally {
      if (quantityControllers.get(id) === requestController) {
        quantityControllers.delete(id)
        updatingIds.value.delete(id)
      }
    }
  }

  // Clear the old account's contents immediately, before rendering or the next request.
  watch(
    () => auth.accessToken,
    () => {
      clear()
      void load()
    },
    { immediate: true, flush: 'sync' },
  )

  const selectableItems = computed(() => items.value.filter((item) => cartItemIssue(item) === null))
  const selectedItems = computed(() =>
    selectableItems.value.filter((item) => selectedIds.value.has(item.cartItemId)),
  )
  const selectedCount = computed(() => selectedItems.value.length)
  const selectedQuantity = computed(() =>
    safeCartAmount(selectedItems.value.reduce((sum, item) => sum + BigInt(item.quantity), 0n)),
  )
  const totalFen = computed(() =>
    safeCartAmount(
      selectedItems.value.reduce(
        (sum, item) => sum + BigInt(item.priceFen!) * BigInt(item.quantity),
        0n,
      ),
    ),
  )
  const allSelected = computed(
    () => selectableItems.value.length > 0 && selectedCount.value === selectableItems.value.length,
  )
  const partiallySelected = computed(() => selectedCount.value > 0 && !allSelected.value)

  function setSelected(id: string, selected: boolean) {
    if (!selectableItems.value.some((item) => item.cartItemId === id)) return
    if (selected) selectedIds.value.add(id)
    else selectedIds.value.delete(id)
  }

  function selectAll(selected: boolean) {
    selectedIds.value = new Set(
      selected ? selectableItems.value.map((item) => item.cartItemId) : [],
    )
  }

  async function removeItem(id: string) {
    const authorization = auth.getAuthorization()
    if (!authorization || state.value !== 'success' || deletingIds.value.has(id)) return
    const item = items.value.find((entry) => entry.cartItemId === id)
    if (!item) return
    cancelQueuedQuantity(id)
    quantityControllers.get(id)?.abort()
    quantityControllers.delete(id)
    updatingIds.value.delete(id)
    delete quantityErrors.value[id]
    delete removeErrors.value[id]
    const requestSequence = sequence
    const requestController = new AbortController()
    removeControllers.set(id, requestController)
    deletingIds.value.add(id)
    const isCurrent = () => {
      const currentAuthorization = auth.getAuthorization()
      return (
        requestSequence === sequence &&
        currentAuthorization === authorization &&
        !requestController.signal.aborted
      )
    }
    try {
      await deleteCartItem(item.productId, { signal: requestController.signal })
      if (!isCurrent()) return
      selectedIds.value.delete(id)
      items.value = items.value.filter((entry) => entry.cartItemId !== id)
      if (!items.value.length) state.value = 'empty'
    } catch (error: unknown) {
      if (!isCurrent() || axios.isCancel(error)) return
      removeErrors.value[id] =
        error instanceof CartRemoveError ? error.message : '删除失败，请稍后重试'
    } finally {
      if (removeControllers.get(id) === requestController) {
        removeControllers.delete(id)
        deletingIds.value.delete(id)
      }
    }
  }

  onBeforeUnmount(clear)
  return {
    items,
    state,
    selectedIds,
    updatingIds,
    queuedIds,
    deletingIds,
    removeErrors,
    quantityErrors,
    updateQuantity,
    scheduleQuantity,
    selectedCount,
    selectedQuantity,
    totalFen,
    allSelected,
    partiallySelected,
    selectableItems,
    setSelected,
    selectAll,
    removeItem,
    retry: load,
  }
}
