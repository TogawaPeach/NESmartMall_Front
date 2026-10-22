/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_PRODUCTS_ENDPOINT?: string
  readonly VITE_PRODUCT_PAGE_ENDPOINT?: string
  readonly VITE_ORDER_MOCK?: string
  readonly VITE_FLASH_SALE_DEMO?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
