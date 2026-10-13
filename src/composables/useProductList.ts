import axios from 'axios'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ProductContractError, ProductResponseError } from '@/api/productContract'
import { PRODUCT_PAGE_SIZE, queryProductPage } from '@/api/products'
import {
  parseProductCategory,
  productListLocation,
  productSearchLocation,
} from '@/constants/productCategories'
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
  const searchKeyword = computed(() =>
    typeof route.query.keyword === 'string' ? route.query.keyword.trim() : '',
  )
  const isSearch = computed(() => Boolean(searchKeyword.value))
  const category = computed(() =>
    isSearch.value ? 'all' : parseProductCategory(route.query.category),
  )
  const page = computed(() => parsePage(route.query.page))
  const keyword = ref('')
  const products = ref<Product[]>([])
  const total = ref<number | null>(null)
  const state = ref<ProductLoadState>('loading')
  const errorKind = ref<ProductErrorKind>(null)
  const errorMessage = ref('')
  let controller: AbortController | undefined
  let sequence = 0
  let previousScope: string | undefined

  function resultsLocation(nextPage: number) {
    return isSearch.value
      ? productSearchLocation(searchKeyword.value, nextPage)
      : productListLocation(category.value, nextPage)
  }

  async function load(): Promise<void> {
    const requestSequence = ++sequence
    controller?.abort()
    const requestController = new AbortController()
    controller = requestController
    const requestedCategory = category.value
    const requestedPage = page.value
    const requestedKeyword = searchKeyword.value
    const scope = JSON.stringify([requestedCategory, requestedKeyword])
    if (scope !== previousScope) total.value = null
    previousScope = scope
    state.value = 'loading'
    errorKind.value = null
    errorMessage.value = ''
    products.value = []

    try {
      const result = await queryProductPage(
        { category: requestedCategory, pageNum: requestedPage, keyword: requestedKeyword },
        { signal: requestController.signal },
      )
      if (requestSequence !== sequence || requestController.signal.aborted) return
      const lastPage = Math.max(1, Math.ceil(result.total / PRODUCT_PAGE_SIZE))
      // A saved URL can become out of range after products are removed.
      if (requestedPage > lastPage) {
        await router.replace(resultsLocation(lastPage))
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
      void router.push(resultsLocation(nextPage))
    },
  })

  function clearSearch(): void {
    keyword.value = ''
  }

  watch(
    () => [route.query.category, route.query.page, route.query.keyword],
    () => {
      keyword.value = searchKeyword.value
      if (
        (route.query.category !== undefined &&
          (isSearch.value || route.query.category !== category.value)) ||
        (route.query.keyword !== undefined &&
          (!isSearch.value || route.query.keyword !== searchKeyword.value)) ||
        (route.query.page !== undefined && route.query.page !== String(page.value))
      ) {
        void router.replace(resultsLocation(page.value))
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
    searchKeyword,
    isSearch,
    products,
    total,
    state,
    errorKind,
    errorMessage,
    selectCategory,
    clearSearch,
    retry: load,
  }
}
