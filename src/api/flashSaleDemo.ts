import type { FlashSaleDetail } from '@/types/flashSale'
import demoInstrument from '@/assets/flash-sale-demo.svg'

// Development-only fixtures, loaded only after VITE_FLASH_SALE_DEMO=true opt-in.
// Each direct detail request can resolve itself; it does not rely on the list page.
const epoch = Date.now()
export function getFlashSaleDemo(): FlashSaleDetail[] {
  return [
    {
      id: '9223372036854775801',
      name: '高精度全站仪 · 演示商品',
      model: 'TS DEMO',
      priceFen: 1280000,
      startsAtMs: epoch - 3600000,
      endsAtMs: epoch + 86400000,
    },
    {
      id: '9223372036854775802',
      name: '轻量 GNSS RTK 接收机 · 演示商品',
      model: 'GNSS DEMO',
      priceFen: 896000,
      startsAtMs: epoch + 3600000,
      endsAtMs: epoch + 90000000,
    },
    {
      id: '9223372036854775803',
      name: '数字水准仪 · 演示商品',
      model: 'LEVEL DEMO',
      priceFen: 368000,
      startsAtMs: epoch - 86400000,
      endsAtMs: epoch - 1000,
    },
  ].map((item, index) => ({
    ...item,
    imageUrl: index === 0 ? demoInstrument : null,
    sales: 0,
    stock: 8,
    detailImages: [],
  }))
}
