/** Call with a validated non-negative safe integer amount in fen. */
export function formatPriceFen(priceFen: number): string {
  const amount = BigInt(priceFen)
  const yuan = new Intl.NumberFormat('zh-CN').format(amount / 100n)
  const fen = String(amount % 100n).padStart(2, '0')
  return `${yuan}.${fen}`
}
