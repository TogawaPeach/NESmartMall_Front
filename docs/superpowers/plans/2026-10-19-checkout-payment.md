# 订单创建与模拟支付 Implementation Plan

> **For agentic workers:** 使用 superpowers:executing-plans 在本会话执行，保留用户未提交改动，不提交、不推送。

**Goal:** 按已确认交接契约完成小票下单、原单支付、未知结果恢复与超时展示。

**Architecture:** 统一 orders API 校验请求及订单快照；Pinia 在账号范围保存创建状态与已知订单，独立于弹窗和购物车。共享支付 composable 与支付确认框供小票、订单列表、详情复用，使用服务端时间锚点计算倒计时。

**Tech Stack:** Vue 3、Pinia、TypeScript、Axios、Element Plus、Node test、Vite 开发模拟。

**Spec:** /Users/lightfull/NESmartMall_Require/订单创建与模拟支付前端开发交接.md；/Users/lightfull/NESmartMall_Require/创建订单与模拟支付超时关单需求.md

## Global Constraints

- 不使用 UUID、Idempotency-Key、预申请订单号；请求不含用户 ID、价格或金额。
- 只有 POST /api/orders 创建；POST /api/orders/{orderNo}/pay 无业务 body；保留 POST /api/orders/{orderNo} 确认收货。
- 创建未知结果不得重发；支付未知结果按订单号查询；合法 0 元可支付。
- 支付 15 分钟，到期禁用，旧 GET 缺少支付字段继续展示但不可付款。
- 结算流程购物车只 GET 刷新，不 DELETE、不本地删行；订单快照独立保存。
- 只改前端及交接，不写后端、SQL、部署；原地适配现有未提交改动。

## Review Focus

- 创建在关闭、重开、路由卸载后仍保存未知结果或已知订单。
- 账号切换与迟到响应隔离，不能使用旧订单发起新账号支付。
- 成功后购物车刷新失败或延迟不推翻创建；款数件数和金额来自订单快照。
- 0 元、溢出、空明细、金额不一致、错订单号与畸形成功响应。
- 到期后仍可查询；旧查询不增加支付资格；真实失败不回退开发模拟。

### Task 1: API 与严格写契约
- [x] 先写创建请求白名单、收货边界、写响应严格校验、旧 GET 兼容、支付路径/状态测试，运行观察失败。
- [x] 扩展 types/order.ts 与 api/orders.ts，实现 prepareCreateOrder、createOrder、payOrder 和可选支付资格字段。
- [x] 运行 API 相关测试验证。

### Task 2: 状态及交互
- [x] 先写创建重复点击、未知结果、关闭重开、购物车刷新、换账号、支付恢复与倒计时测试并观察失败。
- [x] 实现账号范围 checkout store、支付 composable、倒计时、共享确认框。
- [x] 小票添加收货表单，CartView 保留订单入口和只 GET 刷新；订单列表/详情接入原单支付。
- [x] 运行相关测试。

### Task 3: 显式开发模拟与验收交接
- [x] 添加模拟创建、支付、按号恢复、0 元及超时场景测试并观察失败，完善仅 serve 启用的隔离模拟。
- [x] 运行 npm test、npm run build、改动文件 ESLint/Oxlint，浏览器核对桌面及移动端、未知结果与订单继续支付。
- [x] 检查最终 diff，同步 README 和最终接口/验证记录到前端与 Require 交接文档。

用户已提供完整规格并要求完成实现，本计划直接执行；不额外创建 worktree，以包含现有未提交的订单、确认收货、导航实现。

执行记录：原地实现并保留既有改动；未提交推送。独立审查发现的 Axios 发起会话竞态已用失败测试复现并修复；额外阻止旧订单查询入口使用新账号授权。没有未处理的重要问题；没有延期次要项。验证实际命令与结果另记 docs/verification/订单创建与模拟支付验证记录.md。

后续授权：用户明确要求将代码推送 GitHub，替代本计划初始“不提交/推送”限制；最终复验 280 项测试、类型/构建及改动文件 lint 均通过。
