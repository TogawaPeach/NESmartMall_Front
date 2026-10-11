# 首页商品接口：待确认

用户已确认后端尚未开发，本次先完成前端。当前仓库没有后端源码、接口文档或既有请求配置。**本次尚未完成真实后端对接**。首页没有 Mock 商品、假价格或模拟请求。

接口契约未配置时，查询在调用 Axios 前抛出 `ProductContractError`，当前不会发出真实商品 HTTP 请求。首页显示“仪器加载失败，请重试”，并辅助说明“商品服务尚未就绪”。只有请求成功、业务状态成功且返回真实空数组时，才显示“暂无仪器”。网络失败、超时、字段异常及业务失败均进入失败状态。

## 本次修改文件

| 范围 | 文件 |
| --- | --- |
| 首页与组件 | 更新 `src/views/HomeView.vue`；新增 `src/components/storefront/StorefrontHeader.vue`、`ProductCard.vue`、`ProductGridSkeleton.vue` |
| 接口与类型 | 新增 `src/api/http.ts`、`src/api/productContract.ts`、`src/api/products.ts`、`src/types/product.ts`、`src/composables/useHomeProducts.ts` |
| 环境配置 | 新增 `.env.example`；更新 `env.d.ts` |
| 应用与样式 | 更新 `src/App.vue`、`src/main.ts`、`src/assets/base.css`、`src/assets/main.css`、`index.html`；新增根据参考图几何轮廓绘制的 `src/assets/jingwei-logo.svg` |
| 依赖 | 更新 `package.json`、`package-lock.json`，声明 `@element-plus/icons-vue` 直接依赖 |
| 文档 | 更新 `README.md`；新增本文与 `design-qa.md` |

## 配置位置

- `.env.example`：复制为本地环境配置并填入确认的 `VITE_API_BASE_URL`、`VITE_PRODUCTS_ENDPOINT`。前者留空表示同源部署，后者留空表示尚无接口；不预设主机和路径。Vite 环境变量会进入前端构建，不能包含密钥。修改环境变量后重新启动开发服务或重新构建。
- `src/api/http.ts`：共享 Axios 实例，10 秒超时。认证请求头、Cookie 策略应根据后端契约在此集中配置。
- `src/api/productContract.ts`：唯一的商品查询参数、分类标识、响应路径、字段映射、业务成功状态及价格单位配置。`confirmed` 默认 `false`；完成下面的确认后才能改为 `true`。
- `src/api/products.ts`：Axios GET 查询、业务状态检查、严格映射及价格单位归一化。
- `src/types/product.ts`：供页面消费的前端标准类型；这些类型不代表已经存在的后端字段。
- `src/composables/useHomeProducts.ts`：分类、搜索、状态及请求取消；请求序号防止旧响应覆盖新结果；首页最多显示 4 条。

## 需要后端提供的信息

| 项目       | 待确认内容                                                                                               |
| ---------- | -------------------------------------------------------------------------------------------------------- |
| 请求       | 商品查询 GET endpoint、base URL、接口版本                                                                |
| 分类       | 分类参数名；全站仪、GNSS / RTK、水准仪、测距仪、配件对应的真实 ID 或枚举；“全部”省略参数还是发送约定值   |
| 搜索       | 关键词参数名、匹配规则、空关键词是否省略；必须支持在当前分类内搜索                                       |
| 分页       | 是否支持 limit 参数、参数名及是否还需要页码、游标或固定排序；若需要额外参数，在 `buildParams` 内集中扩展 |
| 响应       | 商品数组位置；成功及失败 envelope；业务状态字段路径和成功值，或明确只使用 HTTP 状态                      |
| 商品       | ID、名称和/或型号、图片、分类名称、参数数组、价格字段路径                                                |
| 参数       | 数组由字符串还是对象组成；对象的标签、值、单位字段；最多展示前两条，不编造缺失参数                       |
| 价格       | RMB 币种；金额字段采用元还是分；缺失或 null 的含义。前端归一化为 `priceYuan`，缺失显示“价格待确认”       |
| 图片       | 图片 URL 是否可直接访问、是否为同源相对路径、是否需要鉴权；前端对失败或缺失图片显示中性占位              |
| 认证与跨域 | 是否需要 Cookie 或授权请求头；CORS、同源代理、浏览器图片访问策略                                         |

`ProductCategoryKey` 中的 `total-station`、`gnss-rtk` 等仅是 UI 标识，不能直接作为后端分类 ID。GNSS / RTK 只对应一个分类。

## 如何填写集中契约

1. 环境变量只填写真实 endpoint 与部署地址，不填推测的 `/api/products` 等路径。
2. 将 `query.categoryParameter`、`query.keywordParameter` 填为后端约定名称；设置 `sendEmptyKeyword`。`query.limit.enabled` 必须明确设为 `true` 或 `false`；支持时填写实际 `parameter`，不支持时留空并由前端截取前 4 条。
3. 设置 `query.allCategory.mode` 为 `omit` 或 `value`；后者还须填写真实 `value`。填写五个 `categoryValues`。不对“全部”或具体类别自行编造数字 ID。
4. 路径使用字符串数组，依次访问嵌套对象。`[]` 表示响应根节点或条目本身；`null` 在 `confirmed: false` 时表示尚未确认。设置为 `true` 后，可选字段路径为 `null` 表示契约确认没有该字段。
5. 将 `response.listPath` 指向真实商品数组。配置 `businessStatus.mode: 'field'`、状态路径和准确的 `successValues`；只有后端明确没有业务状态时才选择 `'http-only'`。
6. 必须配置 ID，以及名称或型号至少一个。图片、分类、参数、价格字段可以按已确认契约缺省。参数有字段时配置 `parameters.format`；对象格式还需配置其 `value` 路径，可选配置 label 和 unit。
7. 将 `priceUnit` 设置为后端确认的 `'yuan'` 或 `'fen'`。后端币种必须为人民币；若支持其他币种，需要在适配器中增加币种验证，不能直接贴人民币符号。
8. 完成真实响应的检查后，设置 `confirmed: true`。仅填写 endpoint 不会启用未确认的接口。

字段路径只适配对象嵌套；如果后端返回其他参数结构、字符串拼接图片路径、包含鉴权图片或需要额外业务转换，应在 API 适配器中按照实际契约扩展，不能在页面模板里猜测。

## 响应校验与状态

- 商品列表必须是数组；返回 HTML、缺少列表路径或业务失败不会转为空数组。
- 每条商品需要有效的字符串或数字 ID，以及非空名称或型号；重复 ID 视为异常。
- 可选字段缺失允许；提供错误字段类型视为响应异常。参数条目缺少有效值也视为异常。
- 缺失价格返回 `null`；不填默认 0。明确的后端 0 价格可正常显示。数字字符串仅接受十进制非负金额；以分为单位时金额必须为安全整数。
- 请求取消不显示错误；快速切换分类或重复搜索只应用最新请求。清空搜索词恢复当前分类，保留分类筛选。
- 当前接口未就绪，应由首页展示完整导航、标题和页脚及失败提示；不能用假商品掩盖缺失接口。

## 项目验证

```sh
npm run type-check
npm run build
```

这些命令验证前端类型和构建；通过构建不代表已验证后端接口。真实成功列表、真实空列表、网络及业务失败需要在提供后端契约后验证。
