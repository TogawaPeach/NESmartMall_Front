export const CUSTOMER_SERVICE_TEXT_LIMIT = 500
export const customerServiceWelcome = {
  guide:
    '你好，我是经纬智选智能导购。请告诉我你的测量场景、预算或关心的参数，我来帮你梳理选购需求。',
  support:
    '你好，这里是经纬智选客服。请描述你遇到的问题；如涉及具体商品，请在消息中说明商品名称和型号。',
}
export const customerServiceQuestions = [
  { id: 'product', label: '商品咨询', question: '我想咨询商品信息' },
  { id: 'shipping', label: '发货时间', question: '购买后什么时候发货？' },
  { id: 'logistics', label: '物流查询', question: '如何查询订单物流？' },
  { id: 'aftersales', label: '售后问题', question: '商品售后应该怎么处理？' },
] as const
