import type { ProductCategoryKey } from '@/types/product'

export const productCategories: { key: ProductCategoryKey; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'total-station', label: '全站仪' },
  { key: 'gnss-rtk', label: 'GNSS / RTK' },
  { key: 'level', label: '水准仪' },
  { key: 'distance-meter', label: '测距仪' },
  { key: 'accessory', label: '配件' },
]

export function productCategoryLabel(category: ProductCategoryKey): string {
  return productCategories.find((item) => item.key === category)!.label
}

export function parseProductCategory(value: unknown): ProductCategoryKey {
  return productCategories.find((item) => item.key === value)?.key ?? 'all'
}

export function productListLocation(category: ProductCategoryKey, page = 1) {
  return {
    name: 'products',
    query: {
      ...(category === 'all' ? {} : { category }),
      page: String(page),
    },
  }
}

export function productSearchLocation(keyword: string, page = 1) {
  return {
    name: 'products',
    query: { keyword: keyword.trim(), page: String(page) },
  }
}
