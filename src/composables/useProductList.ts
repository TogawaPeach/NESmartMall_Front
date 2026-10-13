import axios from 'axios'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ProductContractError, ProductResponseError } from '@/api/productContract'
import { PRODUCT_PAGE_SIZE, queryProductPage } from '@/api/products'
import { parseProductCategory, productListLocation } from '@/constants/productCategories'
import type {
  Product,
  ProductCategoryKey,
  ProductErrorKind,
  ProductLoadState,
} from '@/types/product'

function parsePage(value: unknown): number {
  if (typeof value !== 'string' || !/^\d+$/.test(value)) return 1
  const page = Number(value)
  return Number.isSafeInteger(page) && page > 0 ? page : 1
}

export function useProductList() {
  const route = useRoute()
  const router = useRouter()
  const category = computed(() => parseProductCategory(route.query.category))
  const page = computed(() => parsePage(route.query.page))
  const keyword = ref('')
  const products = ref<Product[]>([])
  const total = ref<number | null>(null)
  const state = ref<ProductLoadState>('loading')
  const errorKind = ref<ProductErrorKind>(null)
  const errorMessage = ref('')
  let controller: AbortController | undefined
  let sequence = 0
  let previousCategory: ProductCategoryKey | undefined

  async function load(): Promise<void> {
    const requestSequence = ++sequence
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    const requestedCategory = category.value
    const requestedPage = page.value
    if (requestedCategory !== previousCategory) total.value = null
    previousCategory = requestedCategory
    state.value = 'loading'
    errorKind.value = null
    errorMessage.value = ''
    products.value = []

    try {
      const result = await queryProductPage(
        { category: requestedCategory, pageNum: requestedPage },
        { signal: requestController.signal },
      )
      if (requestSequence !== sequence || requestController.signal.aborted) return
      const lastPage = Math.max(1, Math.ceil(result.total / PRODUCT_PAGE_SIZE))
      // A saved URL can become out of range after products are removed.
      if (requestedPage > lastPage) {
        await router.replace(productListLocation(requestedCategory, lastPage))
        return
      }
      total.value = result.total
      products.value = result.list
      state.value = result.list.length ? 'success' : 'empty'
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
      total.value = null
    }
  }

  function selectCategory(nextCategory: ProductCategoryKey): void {
    keyword.value = ''
    if (nextCategory === category.value && page.value === 1) {
      if (state.value === 'error') void load()
      return
    }
    void router.push(productListLocation(nextCategory))
  }

  const currentPage = computed({
    get: () => page.value,
    set: (nextPage: number) => {
      if (nextPage === page.value || !Number.isSafeInteger(nextPage) || nextPage < 1) return
      void router.push(productListLocation(category.value, nextPage))
    },
  })

  function search(): void {
    if (!keyword.value.trim()) {
      void load()
      return
    }
    // Keep the existing search entry honest until a keyword API is agreed.
    ++sequence
    controller?.abort()
    products.value = []
    total.value = null
    state.value = 'error'
    errorKind.value = 'contract'
    errorMessage.value = '关键词搜索暂未开放，请清空搜索词'
  }

  function clearSearch(): void {
    keyword.value = ''
    void load()
  }

  watch(keyword, (value, previousValue) => {
    if (!value.trim() && previousValue.trim() && errorKind.value === 'contract') void load()
  })

  watch(
    () => [route.query.category, route.query.page],
    () => {
      if (
        (route.query.category !== undefined && route.query.category !== category.value) ||
        (route.query.page !== undefined && route.query.page !== String(page.value))
      ) {
        void router.replace(productListLocation(category.value, page.value))
        return
      }
      void load()
    },
    { immediate: true },
  )

  onBeforeUnmount(() => {
    ++sequence
    controller?.abort()
  })

  return {
    category,
    currentPage,
    keyword,
    products,
    total,
    state,
    errorKind,
    errorMessage,
    selectCategory,
    search,
    clearSearch,
    retry: load,
  }
}
