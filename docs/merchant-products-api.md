# 商家商品分页 GET（前端接入）

2026-10-23 同日后续：新增、修改及上下架已由独立真实 POST 接入，共用弹窗含秒杀开关和起止时间，详见[保存与上下架接口](./merchant-product-actions-api.md)。下文按钮禁用仅描述分页 GET 单独接入时的历史阶段；真实后端仍待联调。

2026-10-23：仅前端接入完成，真实后端尚未联调。本轮不修改后端或数据库。用户最新决定取消商家搜索，页面不展示搜索框，也不发送 keyword。

进入 `/merchant/products` 后，列表与此前的统计 GET 分别加载：

```http
GET /api/merchant/products/page?pageNum=1&pageSize=8
Authorization: Bearer <当前登录令牌>
```

无请求体、商家 ID 或排序参数。每页固定 8 件；全部状态省略 status，在售发送 `status=on-sale`，下架发送 `status=off-shelf`。切换状态回到第 1 页，翻页、重试保留当前状态；它们不重新请求顶部统计。

成功响应结构：

```json
{
  "code": 200,
  "message": "OK",
  "data": {
    "list": [
      {
        "id": "101",
        "coverUrl": "https://example.com/total-station.webp",
        "name": "工程测量全站仪",
        "model": "TS-02",
        "categoryId": 1,
        "price": 1980000,
        "stock": 12,
        "status": 1,
        "isSeckill": false,
        "seckillStartTime": null,
        "seckillEndTime": null
      }
    ],
    "total": 1,
    "pageNum": 1,
    "pageSize": 8
  }
}
```

- `total` 为当前状态条件下的真实总数，非当前页条数；前端不再过滤、切片或补演示商品。`pageNum` 必须与请求一致，`pageSize` 为 8；列表最多 8 条，商品 ID 不得重复。
- `id` 必须为正整数形式的字符串，保留 BIGINT 精度。`name` 非空；`model` 空值展示“未填写型号”。
- `categoryId` 为数字。0 暂显示“未分类”，1 全站仪、2 GNSS / RTK、3 水准仪、4 测距仪、5 配件；未知非负数字显示“未知分类”，不显示“全部”。0 的正式名称仍可后续调整。
- `coverUrl` 使用 HTTP/HTTPS 地址；缺失、不可用或图片加载失败显示占位。
- `price` 为非负安全整数分，沿用整数分格式化；0 显示 ¥0.00，null/缺失显示“价格待确认”。`stock` 为非负安全整数，0 显示待补货，不擅自改变商品状态。
- `status` 保留数字 0 草稿、1 上架、2 下架；`isSeckill` 必须是布尔值。原始状态用于筛选，前端活动阶段不覆盖它。
- 普通商品的两项秒杀日期时间允许 null、空字符串或缺失。秒杀时间复用北京时间解析工具，支持既有无偏移日期时间（含毫秒）及带偏移 ISO 格式。

本轮采用的展示边界：下架优先显示“已下架”，草稿优先显示“草稿”；上架普通商品显示“在售中”。上架秒杀商品早于开始显示“未开始”，开始时起显示“正在秒杀”，达到结束时显示“已结束”；缺失、非法、起止颠倒的活动时间显示“秒杀时间异常”。本地每秒更新时间，不轮询接口；交易资格仍由后端决定。

列表覆盖加载、成功、空结果、失败重试、401 和 403；失败时清空行及总数，不把未知总数展示为 0。越界请求应返回请求页码、实际 total 与空 list，前端据此纠正到最后一页重查。新筛选、身份变化及离页取消旧等待，迟到响应不能覆盖当前结果。

新增、编辑、上下架按钮暂禁用，页面已取消内存演示操作，避免真实列表出现模拟写入成功。旧演示 composable 和编辑组件仍作为未接入的历史代码保留，不被商品页调用。

实现入口：`src/api/merchantProducts.ts`、`src/composables/useMerchantProductPage.ts`、`src/utils/merchantProduct.ts`、`src/views/MerchantProductsView.vue`。

验证记录：

- 新增分页专项 13 项通过；连同统计和原商家测试共 30 项通过。取消关键词后的用例已观察失败再修正通过。
- 最终完整前端测试 363/363 通过；生产构建含类型检查、修改文件 ESLint、Prettier 和差异检查通过。
- 独立代码审查未发现可复现功能问题，取消搜索后的变化也已复查。
- Chrome 隔离端口、模拟商家会话及模拟 API 核验了初始列表、第二页、状态筛选回第一页、真实 total 绑定、缺图/缺价/零库存、秒杀阶段、空结果及失败重试；最终确认移除搜索框。模拟验证不能代替真实后端联调，未触碰原页面登录会话。
- [最终页面截图（模拟数据）](./verification/merchant-products-2026-10-23/list.png)。临时服务和验证标签页在验证后关闭；本轮未提交或推送。
