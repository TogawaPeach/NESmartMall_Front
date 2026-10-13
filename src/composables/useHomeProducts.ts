import axios from 'axios'
import { onBeforeUnmount, onMounted, ref } from 'vue'
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
  const errorMessage = ref('')
  let controller: AbortController | undefined
  let sequence = 0
  let lastQueryKey: string | undefined

  async function load(force = false): Promise<void> {
    const query = { category: category.value, keyword: '', limit: 8 }
    const queryKey = JSON.stringify(query)
    if (!force && queryKey === lastQueryKey) return
    lastQueryKey = queryKey
    const requestSequence = ++sequence
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    state.value = 'loading'
    errorKind.value = null
    errorMessage.value = ''
    products.value = []

    try {
      const result = await queryProducts(query, { signal: requestController.signal })
      if (requestSequence !== sequence || requestController.signal.aborted) return
      products.value = result
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
      errorMessage.value = error instanceof ProductContractError ? error.message : ''
      state.value = 'error'
    }
  }

  function selectCategory(nextCategory: ProductCategoryKey): void {
    category.value = nextCategory
    void load()
  }

  function clearSearch(): void {
    keyword.value = ''
  }

  function retry(): void {
    void load(true)
  }

  onMounted(() => {
    void load()
  })

  onBeforeUnmount(() => {
    ++sequence
    controller?.abort()
  })

  return {
    category,
    keyword,
    products,
    state,
    errorKind,
    errorMessage,
    selectCategory,
    clearSearch,
    retry,
  }
}
