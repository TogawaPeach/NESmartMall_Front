export const CUSTOMER_SERVICE_TEXT_LIMIT = 500
export const customerServiceWelcome =
  '你好，欢迎咨询经纬智选。这里是前端演示，你可以发送问题，或选择下方的常见问题体验聊天。'
export const customerServiceQuestions = [
  {
    id: 'product',
    label: '商品咨询',
    question: '我想咨询商品信息',
    reply:
      '演示答复：可以从商品详情点击「咨询商品」，发送商品卡片后说明你关心的型号、用途或参数。实际选型与商品信息需由商家确认。',
  },
  {
    id: 'shipping',
    label: '发货时间',
    question: '购买后什么时候发货？',
    reply:
      '演示答复：具体发货时间以商品说明和商家确认为准。当前仅为前端演示，无法确认真实订单的发货安排。',
  },
  {
    id: 'logistics',
    label: '物流查询',
    question: '如何查询订单物流？',
    reply:
      '演示答复：你可以在订单详情查看运单号和发货时间，也可以通过「联系商家客服」发送订单卡片。当前尚未接入真实物流查询。',
  },
  {
    id: 'aftersales',
    label: '售后问题',
    question: '商品售后应该怎么处理？',
    reply:
      '演示答复：请说明遇到的问题，并从订单详情发送相关订单卡片。退换、维修等具体处理需要商家核实；当前演示不会创建售后申请。',
  },
] as const

export function customerServiceReply(text: string): string {
  const exact = customerServiceQuestions.find((item) => item.question === text)
  if (exact) return exact.reply
  const key = /物流|快递|运单/.test(text)
    ? 'logistics'
    : /售后|退货|退款|维修/.test(text)
      ? 'aftersales'
      : /发货|送达/.test(text)
        ? 'shipping'
        : /商品|型号|参数|选型/.test(text)
          ? 'product'
          : undefined
  return (
    customerServiceQuestions.find((item) => item.id === key)?.reply ??
    '演示答复：你的问题已保留在本次本地会话中。当前没有接入真人客服或 AI 服务，关闭面板后聊天仍会保留，刷新页面后会清空。'
  )
}
