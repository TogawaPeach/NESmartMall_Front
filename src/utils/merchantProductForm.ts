import { parseFlashSaleTime } from './flashSaleTime'
import type {
  MerchantProductForm,
  MerchantProductRow,
  MerchantProductSaveInput,
} from '@/types/merchant'

function beijingTime(value: number | null): string {
  return value === null
    ? ''
    : new Date(value + 8 * 3600_000)
        .toISOString()
        .slice(0, 23)
        .replace(/\.000$/, '')
}

export function merchantProductDraft(product: MerchantProductRow | null): MerchantProductForm {
  const price = product?.priceFen
  return {
    name: product?.name ?? '',
    model: product?.model ?? '',
    coverUrl: product?.imageUrl ?? '',
    detailImages:
      product?.status !== 1 && product?.detailImages?.length ? [...product.detailImages] : [''],
    categoryId: product?.categoryId ?? 1,
    priceYuan:
      price === null || price === undefined
        ? ''
        : `${BigInt(price) / 100n}.${String(BigInt(price) % 100n).padStart(2, '0')}`,
    stock: product ? String(product.stock) : '',
    isSeckill: product?.isSeckill ?? false,
    seckillStartTime: product?.isSeckill ? beijingTime(product.startsAtMs) : '',
    seckillEndTime: product?.isSeckill ? beijingTime(product.endsAtMs) : '',
  }
}

function time(value: string): number | null {
  const normalized = value.trim()
  return parseFlashSaleTime(
    /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(normalized) ? `${normalized}:00` : normalized,
  )
}

export function readMerchantDetailImages(value: unknown): string[] {
  if (!Array.isArray(value)) throw new Error('商品详情图未正确返回，请重新加载后再修改')
  return value.map((entry, index) => {
    try {
      if (typeof entry !== 'string' || !entry.trim()) throw new Error()
      const url = new URL(entry.trim())
      if (!/^https?:$/.test(url.protocol)) throw new Error()
      return url.href
    } catch {
      throw new Error(`第 ${index + 1} 个详情图链接须为有效 HTTP 或 HTTPS 地址`)
    }
  })
}

export function buildMerchantProductInput(
  draft: MerchantProductForm,
  id?: string,
  options: { preserveDetailImages?: boolean } = {},
): MerchantProductSaveInput {
  if (id !== undefined && !/^[1-9]\d*$/.test(id)) throw new Error('商品编号无效')
  const name = draft.name.trim(),
    model = draft.model.trim()
  if (!name || name.length > 80) throw new Error('商品名称须为 1 至 80 个字符')
  if (model.length > 80) throw new Error('商品型号不能超过 80 个字符')
  if (!Number.isInteger(draft.categoryId) || draft.categoryId < 0 || draft.categoryId > 5)
    throw new Error('请选择有效商品分类')
  const amount = draft.priceYuan.trim()
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(amount)) throw new Error('请输入有效价格，最多保留两位小数')
  const [yuan = '0', cents = ''] = amount.split('.')
  const price = Number(BigInt(yuan) * 100n + BigInt(cents.padEnd(2, '0')))
  if (price <= 0 || price > 9999999900) throw new Error('价格须大于 0 且不超过 99,999,999 元')
  if (!/^\d{1,6}$/.test(draft.stock.trim())) throw new Error('库存须为 0 至 999,999 的整数')
  const stock = Number(draft.stock.trim())
  const detailImages = options.preserveDetailImages
    ? undefined
    : readMerchantDetailImages(draft.detailImages.map((link) => link.trim()).filter(Boolean))
  let coverUrl: string | null = draft.coverUrl.trim() || null
  if (coverUrl) {
    try {
      const url = new URL(coverUrl)
      if (!/^https?:$/.test(url.protocol)) throw new Error()
      coverUrl = url.href
    } catch {
      throw new Error('头图地址须为有效 HTTP 或 HTTPS 链接')
    }
  }
  let seckillStartTime: string | null = null,
    seckillEndTime: string | null = null
  if (draft.isSeckill) {
    const start = time(draft.seckillStartTime),
      end = time(draft.seckillEndTime)
    if (start === null || end === null) throw new Error('请填写有效的秒杀开始和结束时间')
    if (end <= start) throw new Error('秒杀结束时间必须晚于开始时间')
    seckillStartTime = beijingTime(start)
    seckillEndTime = beijingTime(end)
  }
  return {
    ...(id ? { id } : {}),
    name,
    model,
    coverUrl,
    ...(detailImages === undefined ? {} : { detailImages }),
    categoryId: draft.categoryId,
    price,
    stock,
    isSeckill: draft.isSeckill,
    seckillStartTime,
    seckillEndTime,
  }
}
