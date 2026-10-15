import axios from 'axios'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { CartQueryError, queryCart } from '@/api/cart'
import { useAuthStore } from '@/stores/auth'
import type { CartItem, CartLoadState } from '@/types/cart'
import { cartItemIssue, safeCartAmount } from '@/utils/cart'

export function useCart() {
  const auth = useAuthStore()
  const items = ref<CartItem[]>([])
  const state = ref<CartLoadState>('loading')
  const selectedIds = ref(new Set<string>())
  let controller: AbortController | undefined
  let sequence = 0

  function clear() {
    ++sequence
    controller?.abort()
    controller = undefined
    items.value = []
    selectedIds.value = new Set()
  }

  async function load() {
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

  onBeforeUnmount(clear)
  return {
    items,
    state,
    selectedIds,
    selectedCount,
    selectedQuantity,
    totalFen,
    allSelected,
    partiallySelected,
    selectableItems,
    setSelected,
    selectAll,
    retry: load,
  }
}
