import axios from 'axios'
import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { ProductContractError, ProductResponseError } from '@/api/productContract'
import { queryProducts } from '@/api/products'
import type {
  Product,
  ProductCategoryKey,
  ProductErrorKind,
  ProductLoadState,
} from '@/types/product'

export function useHomeProducts() {
  const category = ref<ProductCategoryKey>('all')
  const keyword = ref('')
  const products = ref<Product[]>([])
  const state = ref<ProductLoadState>('loading')
  const errorKind = ref<ProductErrorKind>(null)
  let controller: AbortController | undefined
  let sequence = 0
  let mounted = false
  let lastQueryKey: string | undefined

  async function load(force = false): Promise<void> {
    const query = { category: category.value, keyword: keyword.value.trim(), limit: 4 }
    const queryKey = JSON.stringify(query)
    // Clearing via the clear icon and the keyword watcher can occur together.
    if (!force && queryKey === lastQueryKey) return
    lastQueryKey = queryKey
    const requestSequence = ++sequence
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    state.value = 'loading'
    errorKind.value = null
    products.value = []

    try {
      const result = await queryProducts(query, { signal: requestController.signal })
      if (requestSequence !== sequence || requestController.signal.aborted) return
      products.value = result.slice(0, 4)
      state.value = products.value.length ? 'success' : 'empty'
    } catch (error: unknown) {
      if (
        requestSequence !== sequence ||
        requestController.signal.aborted ||
        axios.isCancel(error)
      ) {
        return
      }
      errorKind.value =
        error instanceof ProductContractError
          ? 'contract'
          : error instanceof ProductResponseError
            ? 'response'
            : 'request'
      state.value = 'error'
    }
  }

  function selectCategory(nextCategory: ProductCategoryKey): void {
    category.value = nextCategory
    void load()
  }

  function search(): void {
    void load(true)
  }

  function clearSearch(): void {
    keyword.value = ''
    void load()
  }

  function retry(): void {
    void load(true)
  }

  watch(keyword, (value, previousValue) => {
    if (mounted && !value.trim() && previousValue.trim()) void load()
  })

  onMounted(() => {
    mounted = true
    void load()
  })

  onBeforeUnmount(() => {
    mounted = false
    ++sequence
    controller?.abort()
  })

  return {
    category,
    keyword,
    products,
    state,
    errorKind,
    selectCategory,
    search,
    clearSearch,
    retry,
  }
}
