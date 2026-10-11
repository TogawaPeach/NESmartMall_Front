# 首页商品接口

首页默认停留在“全部”，组件挂载时自动查询销量前十的商品：

```http
GET http://localhost:8082/api/products?sort=sales_desc&limit=10
```

开发环境由 `vite.config.ts` 将前端的 `/api` 请求代理到 `http://localhost:8082`，避免浏览器跨域。修改代理配置后需要重新启动开发服务。生产构建默认使用前端同源的 `/api/products`；部署时需配置服务器 API 反向代理，或在构建前通过 `VITE_API_BASE_URL` 指定允许跨域访问的后端地址。`VITE_PRODUCTS_ENDPOINT` 可覆盖默认路径。环境变量不可包含密钥。

## 返回结构

```json
{
  "code": 200,
  "message": "OK",
  "data": [
    {
      "coverUrl": "https://example.com/product.webp",
      "id": 1,
      "name": "商品名称",
      "price": 990,
      "sales": 0
    }
  ]
}
```

仅 `code: 200` 视为业务成功，商品列表读取 `data`。每个商品卡片上方显示 `coverUrl`，中间显示 `name`，底部左侧显示价格、右侧显示 `sales` 对应的购买人数。长名称最多显示两行；图片失败或缺失时显示占位。

`price` 为人民币分，接口适配层除以 100 后输出 `priceYuan`，例如 `990` 分显示 `¥9.90`。明确的零价格正常展示，缺失价格显示“价格待确认”。价格必须为非负整数分；`sales` 必须为非负安全整数，`0` 显示“0人购买”，缺失人数显示“购买人数暂无”。

## 配置与状态

- `src/api/productContract.ts`：接口路径、`sort=sales_desc`、`limit`、字段路径、业务成功状态及价格单位。
- `src/api/products.ts`：GET 查询、响应校验、价格转换及购买人数映射，最多保留请求指定的条数。
- `src/composables/useHomeProducts.ts`：默认分类、十条查询、加载/成功/空列表/失败状态、重试及请求取消。只应用最新请求，避免旧响应覆盖新结果。
- `src/components/storefront/ProductCard.vue`：简介卡布局、价格格式和购买人数显示。

只有业务成功且 `data: []` 时显示空列表。网络失败、超时、业务失败、列表非数组、重复商品 ID、字段类型异常均显示失败提示。首页不填充演示商品。

当前仅接通“全部”销量排序查询。分类参数与实际分类 ID、关键词参数尚未确认，对应配置保留 `null`；触发尚未开放的查询时在发送请求前显示具体提示，选择“全部”并清空搜索词即可恢复。未来接入筛选时填写真实参数名和分类值。

## 验证

```sh
npm run build
```

启动后端与 `npm run dev` 后，访问首页检查商品图片、名称、`¥9.90` 和“0人购买”。接口不足十条时只展示实际返回条数。
