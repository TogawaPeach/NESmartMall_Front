export type CartAvailability = 'AVAILABLE' | 'OUT_OF_STOCK' | 'OFF_SHELF' | 'DELETED'

export interface CartItem {
  cartItemId: string
  productId: string
  name: string | null
  model: string | null
  imageUrl: string | null
  priceFen: number | null
  quantity: number
  stock: number | null
  availability: CartAvailability
}

export type CartLoadState =
  'loading' | 'success' | 'empty' | 'login-required' | 'forbidden' | 'unavailable' | 'error'
