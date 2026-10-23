# 商家商品统计 GET（前端接入）

2026-10-23 写操作后续：新增、修改、上下架的 POST 前端已接入，成功后刷新统计和列表，详见[保存与上下架接口](./merchant-product-actions-api.md)。下文演示/按钮禁用均为较早阶段状态。

同日后续：商品列表已接入第二个 GET，演示列表和模拟写操作不再被页面调用；新增、编辑、上下架按钮暂禁用。商家搜索按用户最新要求取消。最终列表行为见[商家商品分页接口](./merchant-products-api.md)，下文“列表仍演示”为首次统计接入时的历史状态。

2026-10-23：仅前端已接入；未修改后端、数据库或商品列表接口，真实后端联调尚未执行。

商家进入 `/merchant/products` 后自动发送一次：

```http
GET /api/merchant/products/stats
Authorization: Bearer <当前登录令牌>
```

无请求体、查询参数或商家 ID。复用共享 Axios 客户端，开发环境经 Vite `/api` 代理到 `http://localhost:8080`；后端须验证商家身份并限定统计范围。

响应是统一 Result，`data` 为单个对象，不是数组：

```json
{
  "code": 200,
  "message": "OK",
  "data": {
    "allCount": 100,
    "onSaleCount": 80,
    "offShelfCount": 20
  }
}
```

三个字段分别对应“全部商品”“在售商品”“已下架商品”，都必须是非负安全整数。0 正常显示；缺失、null、字符串数字、负数、小数和不安全整数均视为响应异常，不自动转换或补 0。三项独立读取，不通过减法推导下架数量，也不要求全部等于另两项之和（可能有草稿）。仅数字 `code: 200` 为业务成功。

等待请求显示“—”和加载提示；失败显示“—”及错误提示，普通失败可以点击“重新加载统计”。401 沿用当前登录失效处理，403 显示无权限。切换账号、退出和离开页面取消旧请求等待并忽略迟到响应；请求发送前也沿用共享客户端的 expectedAuthorization 校验。

下方商品列表、搜索筛选、翻页和新增/编辑/上下架仍是本地演示。它们不改变真实统计，也不触发统计重查，避免把演示操作误当作真实后端写入。后续写接口接入成功后再补刷新联动。

实现入口：

- `src/api/merchantStats.ts`：GET 和对象校验。
- `src/composables/useMerchantStats.ts`：加载、失败重试、身份和取消处理。
- `src/views/MerchantProductsView.vue`：顶部三卡片及反馈。
- `tests/merchant-stats.test.mjs`：10 项统计接口及生命周期测试。

验证：统计及既有商家专项共 17/17 通过；完整前端测试 350/350 通过（含本地 mock HTTP 服务，需允许回环端口监听）；生产构建含类型检查通过，修改文件 ESLint、Prettier 检查及 `git diff --check` 通过。未据此宣称真实统计接口已实现或联调成功。

完整后续需求见本地 Require 的[商家商品列表分页统计与秒杀展示需求](/Users/lightfull/NESmartMall_Require/商家商品列表分页统计与秒杀展示需求2026-10-23.md)。
