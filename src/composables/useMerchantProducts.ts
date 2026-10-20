import { computed, ref } from 'vue'
import { productCategories } from '@/constants/productCategories'
import type { MerchantProduct, MerchantProductDraft, MerchantProductStatus } from '@/types/merchant'

const demoProducts: MerchantProduct[] = [
  {
    id: 'DEMO-001',
    name: '工程测量全站仪',
    model: 'TS-02 · 2 秒精度',
    category: 'total-station',
    priceFen: 1980000,
    stock: 12,
    description: '适用于工程放样、地形测量等作业。',
    status: 'on-sale',
  },
  {
    id: 'DEMO-002',
    name: '高精度 GNSS RTK 接收机',
    model: 'RTK Pro · 标准套装',
    category: 'gnss-rtk',
    priceFen: 1288000,
    stock: 8,
    description: '高精度定位，满足日常测绘作业需求。',
    status: 'on-sale',
  },
  {
    id: 'DEMO-003',
    name: '自动安平水准仪',
    model: 'AL-32 · 32 倍',
    category: 'level',
    priceFen: 158000,
    stock: 24,
    description: '操作便捷，适用于施工现场高程测量。',
    status: 'on-sale',
  },
  {
    id: 'DEMO-004',
    name: '手持激光测距仪',
    model: 'LDM-100 · 100 米',
    category: 'distance-meter',
    priceFen: 89900,
    stock: 0,
    description: '便携测距，支持距离与面积测量。',
    status: 'off-shelf',
  },
  {
    id: 'DEMO-005',
    name: '测量仪器铝合金三脚架',
    model: 'TRI-A · 通用款',
    category: 'accessory',
    priceFen: 39900,
    stock: 36,
    description: '轻便稳固，适配常见测量仪器。',
    status: 'off-shelf',
  },
]

/** Deliberately isolated, in-memory examples. No merchant API calls or persistence. */
export function useMerchantProducts() {
  const products = ref(demoProducts.map((product) => ({ ...product })))
  const keyword = ref('')
  const status = ref<'all' | MerchantProductStatus>('all')
  const filteredProducts = computed(() => {
    const query = keyword.value.trim().toLowerCase()
    return products.value.filter(
      (product) =>
        (status.value === 'all' || product.status === status.value) &&
        (!query || `${product.name} ${product.model} ${product.id}`.toLowerCase().includes(query)),
    )
  })
  const onSaleCount = computed(() => products.value.filter((p) => p.status === 'on-sale').length)
  let sequence = demoProducts.length

  function saveProduct(draft: MerchantProductDraft, id?: string): string | null {
    const existing = id ? products.value.find((p) => p.id === id) : undefined
    if (id && !existing) return '未找到要编辑的商品'
    if (!draft.name.trim() || draft.name.trim().length > 80) return '商品名称须为 1 至 80 个字符'
    if (draft.model.trim().length > 80) return '商品型号不能超过 80 个字符'
    if (!productCategories.some((c) => c.key !== 'all' && c.key === draft.category))
      return '请选择商品分类'
    const price = draft.priceYuan.trim()
    if (!/^\d+(\.\d{1,2})?$/.test(price)) return '请输入有效价格，最多保留两位小数'
    const [yuan = '0', cents = ''] = price.split('.')
    const priceFen = Number(yuan) * 100 + Number(cents.padEnd(2, '0'))
    if (!Number.isSafeInteger(priceFen) || priceFen <= 0 || priceFen > 9999999900)
      return '价格须大于 0 且不超过 99,999,999 元'
    if (!/^\d+$/.test(draft.stock.trim())) return '库存须为非负整数'
    const stock = Number(draft.stock.trim())
    if (!Number.isSafeInteger(stock) || stock > 999999) return '库存不能超过 999,999'
    if (existing?.status === 'on-sale' && stock === 0) return '在售商品库存不能为 0，请先下架商品'
    if (draft.description.trim().length > 500) return '商品说明不能超过 500 个字符'
    const product: MerchantProduct = {
      id: existing?.id ?? `DEMO-${String(++sequence).padStart(3, '0')}`,
      name: draft.name.trim(),
      model: draft.model.trim(),
      category: draft.category,
      priceFen,
      stock,
      description: draft.description.trim(),
      status: existing?.status ?? 'off-shelf',
    }
    if (existing) Object.assign(existing, product)
    else products.value.unshift(product)
    return null
  }

  function toggleStatus(id: string): string | null {
    const product = products.value.find((p) => p.id === id)
    if (!product) return '未找到商品'
    if (product.status === 'off-shelf' && product.stock === 0) return '请先补充库存，再上架商品'
    product.status = product.status === 'on-sale' ? 'off-shelf' : 'on-sale'
    return null
  }

  return { products, keyword, status, filteredProducts, onSaleCount, saveProduct, toggleStatus }
}
