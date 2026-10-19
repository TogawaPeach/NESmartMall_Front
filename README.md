# NESmartMall

经纬智选商城前端，使用 Vue 3、TypeScript、Element Plus 与 Axios。

首页默认选中“全部”，打开页面自动请求销量前八的商品，加载时显示八张骨架卡片。商品卡片展示封面、名称、人民币价格及购买人数，支持加载、空列表、失败和重试状态。后端价格以分为单位，前端转换为元（例如 `990` 展示为 `¥9.90`）。分类切换会发送 `categoryId`：全站仪 1、GNSS / RTK 2、水准仪 3、测距仪 4、配件 5；“全部”省略分类参数。前端已按此约定实现，后端分类筛选待接入。

搜索栏点击图标或按回车提交；空输入显示 warning 提示“请输入搜索词”。首页或分类浏览页提交有效输入时，在新标签页打开全分类搜索结果；搜索结果页再次搜索则在当前页面更新并回到第 1 页。搜索结果隐藏分类栏，复用 `/api/products/page?keyword=搜索词&pageNum=1` 请求，每页最多 12 件并支持分页。关键词匹配由后端执行，本次仅完成前端，真实搜索仍需后端支持 `keyword` 后联调，接口约定见 `docs/product-api-contract.md`。

开发服务将 `/api` 代理到 `http://localhost:8080`，默认请求 `/api/products?limit=8`，前端省略 `sort`，由后端默认按销量降序排列。部署地址可通过 `.env.example` 中的环境变量配置；参数、响应字段及价格单位集中在 `src/api/productContract.ts`。详情见 [商品接口契约](docs/product-api-contract.md)。

首页组件位于 `src/components/storefront/`，页面位于 `src/views/HomeView.vue`，查询状态位于 `src/composables/useHomeProducts.ts`。订单、购物车已有独立页面，接口及开发模拟边界见文末。

用户入口打开账号密码登录弹窗，提交 `POST /api/auth/login`，JSON body 为 `{ "account": "账号", "password": "密码" }`。仅当业务 `code` 为 `200` 且返回完整的 `accessToken`、`tokenType: "Bearer"`、`expiresIn` 和用户信息时建立登录状态；登录成功关闭弹窗并留在当前页面。注册表单提交 `POST /api/auth/register`，注册表单仅填写手机号账号、昵称和密码，不提供商家选择；API 仅发送 account、nickname、password、role，其中 role 固定为数字 1（普通用户）；注册成功直接使用响应中的 token 和用户信息建立同样的会话，无需再次登录，详见 [注册交接](docs/requirements/注册功能需求与前端实现交接.md)。入口保留用户图标，桌面显示昵称，点击可查看昵称、账号和退出登录。登录会话存入同源标签页共享的 `localStorage`，刷新、新标签页及浏览器重新打开时，未过期的会话均可恢复；到期或退出时清理，不保存密码。退出登录目前清理前端会话，不调用未提供的后端注销接口。找回密码和个人中心尚未接入。

共享 `http` 请求层统一处理 Authorization：只要当前会话 token 未过期，首页等公开接口、分页/搜索及登录接口都自动携带 `Authorization: Bearer <accessToken>`；匿名或过期时不携带。范围按 Axios 最终请求地址判断，仅信任同源 `/api` 路径及配置的 `VITE_API_BASE_URL` 的同源同路径前缀（按路径段匹配），支持相对、绝对及协议相对地址；第三方地址、其他路径以及请求临时覆盖到未配置的后端均不携带会话 token。业务组件不拼接认证头，URL 和业务 body 不追加 token 或用户身份。

普通请求的 HTTP 401 或业务 `code: 401` 只在该请求发送的 token 与当前会话一致时清理会话，防止旧请求清除新登录；登录失败的 401 保留原会话，HTTP 403、网络错误和 5xx 也不清会话。过期仍自动清理，旧会话过期不影响正在进行的新登录，主动退出仍阻止迟到登录恢复会话。此处仅完成前端携带和会话处理；网关尚未实现鉴权，公开接口跳过验签、受保护接口验证 token 及可信用户身份转发仍需后续网关实现。

登录、退出及匹配当前 token 的 401 清理通过 `storage` 事件同步到其他同源标签页；请求发送与 401 处理前再次读取共享会话，避免事件延迟导致旧 token 覆盖新登录。旧版 `sessionStorage` 中的有效会话会在首次迁移时保留并清除旧存储；迁移后不再从其他旧标签页恢复已退出的会话。浏览器禁用存储时仍允许当前页面内存登录，但无法保证刷新恢复或跨标签页共享。

未登录点击“查看全部”或提交非空搜索时，在当前页打开登录弹窗。直接访问商品列表或搜索地址时显示“请先登录账号”和“立即登录”，不发送受保护商品请求；登录成功自动加载当前查询。退出、到期或当前会话的 401 清理后清空商品并恢复登录引导。已登录用户仍通过新标签页查看全部或搜索；网络错误、403 和 5xx 保留失败与重试提示。

本轮实现、82 项回归测试及后续网关边界汇总见 [前端统一令牌与跨标签登录实现交接](docs/requirements/前端统一令牌与跨标签登录实现交接.md)。

完整需求见 [需求总览](docs/requirements/需求.md) 和 [用户入口与登录状态](docs/requirements/用户入口与登录状态需求.md)。本地 `NESmartMall_Require` 保存完整需求及后端交接，`docs/requirements/` 保存本仓库已纳入版本记录的需求快照；前端相关最新实现见本轮交接记录。

“查看全部”文字随当前分类变化，点击后在新标签页打开 `/products` 并保留分类。列表页沿用首页商品卡片，固定每页 12 件，使用 Element Plus 的上一页、页码及下一页控件，不提供每页数量选择。分类与页码写入 URL，支持刷新、直接访问和浏览器前进/后退；切换分类回到第 1 页。加载、空列表、失败和重试状态均已接入。

列表页使用独立分页接口 `/api/products/page`（可通过 `VITE_PRODUCT_PAGE_ENDPOINT` 覆盖），一次返回本页商品及当前分类的总数。后端分页接口待实现，返回结构与越界页处理见 [商品接口契约](docs/product-api-contract.md)；首页继续使用原来的八条数组接口。

Docker + Nginx 部署与公网 IPv4:8080 访问步骤见 [服务器部署](docs/deployment.md)，Nginx 配置位于 `deploy/nginx.conf`。

## Recommended IDE Setup

[VS Code](https://code.visualstudio.com/) + [Vue (Official)](https://marketplace.visualstudio.com/items?itemName=Vue.volar) (and disable Vetur).

## Recommended Browser Setup

- Chromium-based browsers (Chrome, Edge, Brave, etc.):
  - [Vue.js devtools](https://chromewebstore.google.com/detail/vuejs-devtools/nhdogjmejiglipccpnnnanhbledajbpd)
  - [Turn on Custom Object Formatter in Chrome DevTools](http://bit.ly/object-formatters)
- Firefox:
  - [Vue.js devtools](https://addons.mozilla.org/en-US/firefox/addon/vue-js-devtools/)
  - [Turn on Custom Object Formatter in Firefox DevTools](https://fxdx.dev/firefox-devtools-custom-object-formatters/)

## Type Support for `.vue` Imports in TS

TypeScript cannot handle type information for `.vue` imports by default, so we replace the `tsc` CLI with `vue-tsc` for type checking. In editors, we need [Volar](https://marketplace.visualstudio.com/items?itemName=Vue.volar) to make the TypeScript language service aware of `.vue` types.

## Customize configuration

See [Vite Configuration Reference](https://vite.dev/config/).

## Project Setup

```sh
npm install
```

### Compile and Hot-Reload for Development

```sh
npm run dev
```

### Type-Check, Compile and Minify for Production

```sh
npm run build
```

### Test API Authorization, Login and Session Behavior

```sh
npm test
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```


## 购物车页面

顶部购物车在当前标签页进入 `/cart`，未登录时显示登录引导，成功登录后自动加载。商品支持单选、全选和实时参考合计；缺货、下架、失效、库存不足或金额待确认的商品无法勾选。可购买条目使用数字输入框增减或直接输入数量，范围为 1 至库存上限；每个商品停止调整 0.8 秒后只提交最终数量，期间继续修改重新计时，改回原值取消提交。等待时仍可编辑，实际请求期间禁用该输入框，不展示等待或保存过程文案；保存成功后更新数量及金额并保留勾选，失败恢复原数量并提示。每行提供独立删除按钮，使用气泡确认，确认后发送 `DELETE /api/cart/{productId}`（无请求体），成功后移除并更新合计，失败保留商品并提示；后端删除已按本地 Require 记录接齐代码，仍待真实联调；详见 [删除按钮交接](docs/requirements/购物车删除按钮前端需求与实现交接.md)。结算保留暖米白纸质小票，收货姓名、手机号和完整地址在小票内填写。只打开小票不创建订单；点击“模拟支付”发送 `POST /api/orders`，仅传选中商品 ID、数量和收货信息，服务端计价并生成订单后，再按返回的成交快照、金额、订单号和截止时间确认模拟支付。创建中禁止重复提交；超时、网络、5xx 或畸形成功响应保留未知结果，提示刷新购物车并查看订单，不直接重试创建。已创建订单独立保存，关闭小票、购物车清理或刷新失败不清除订单。结算流程只 GET 刷新购物车，不调用删除或本地删行。最终契约、验证和后端接手事项见 [订单创建与模拟支付交接](docs/requirements/订单创建与模拟支付前端开发交接.md)。

查询使用 `GET /api/cart`；数量修改新增 `PUT /api/cart/{productId}/quantity`，JSON 为 `{ "quantity": 修改后的最终数量 }`，复用统一 HTTP 客户端及 Bearer 认证。后端 GET 此前已由用户确认联调正常，PUT 后端已按本地 Require 记录接齐代码，仍待真实联调；商品详情页仍使用原有 `POST /api/cart` 加入商品。接口失败显示明确错误，不自动回退模拟数据。完整约定见 [购物车数量修改交接](docs/requirements/购物车数量修改前端需求与后端接口交接.md)。

显式启用开发模拟：

```sh
VITE_CART_MOCK=true VITE_CART_MOCK_SCENARIO=normal npm run dev
```

模拟需要已有有效的本地登录状态，拦截购物车 GET 查询、PUT 数量修改与 DELETE 删除，按模拟会话在内存保存数量和移除结果，不模拟登录、不写数据库。场景可选 `normal`、`mixed`（默认）、`empty`、`forbidden`、`unavailable`、`error`、`malformed`；切换后重启开发服务。生产构建不包含模拟中间件。

字段草案、联调边界与验收说明见 [购物车交接](docs/requirements/购物车页面需求与前端开发交接.md)。

## 订单页面

顶部「我的订单」在当前标签页进入 `/orders`，未登录点击先打开现有登录弹窗，成功后继续进入。直接访问未登录页面显示引导；退出、过期及换账号立即清空订单。列表一次展示全部订单，支持全部、待付款、待发货、待收货、已完成、已取消筛选，筛选状态保存在 URL。列表使用独立摘要类型，以 orderNo 标识订单，不要求或保留订单主表 id；只要求卡片字段和 items，订单金额取 payableAmountFen；支付时间、收货人、物流等仍由详情接口提供。点击查看详情按订单号 orderNo 进入 `/orders/:orderNo`，请求 `/api/orders/{orderNo}`，返回时保留筛选；不再按内部 id 查询。

详情显示交易进度、收货及物流信息、商品成交快照和金额明细；手机号脱敏，未付款与 0 元实付分开。待付款订单支持继续模拟支付，先查询原订单完整快照，再调用独立的 `POST /api/orders/{orderNo}/pay`（无业务 body）；只有明确已支付结果才显示成功，未知结果按订单号查询恢复。确认收货仍使用 `POST /api/orders/{orderNo}`，取消订单暂未开放。支付倒计时使用服务端时间和本地经过时长，15 分钟到期禁用付款且订单仍可查；旧 GET 没有新增支付字段时仍正常展示，但禁用付款并提示信息暂未就绪。

查询草案为 `GET /api/orders`（可选 `status` 筛选，不传分页参数，成功响应 `data` 直接为订单数组，订单数量取 `data.length`；不兼容旧 list/total 包装）和 `GET /api/orders/:orderNo`，复用统一 Bearer 客户端，不传用户 ID；列表已按真实接口的卡片字段适配并完成五笔订单联调；详情后端仍待实现。未启用模拟时显示真实接口的未开放或失败状态，不自动回退演示订单。

开发模拟（仍需有效登录会话）：

```sh
VITE_ORDER_MOCK=true npm run dev
```

可加 `VITE_ORDER_MOCK_SCENARIO=empty` 验证空态；另支持 `normal`（默认，7 笔覆盖全部状态及全量列表）、`forbidden`、`unavailable`、`error`、`malformed`。改环境变量后重启服务。模拟页面有明确标记，中间件与订单样本仅供 Vite serve 使用，不进入生产构建。

完整需求与接口草案保存在本地 Require 的《订单页面需求与前端开发交接.md》。商城促销导航仅保留「限时秒杀」，活动功能暂未开放。

## 客服前端

项目名称保持「经纬智选」，当前 Demo 按单商家运营，保留现有用户/商家角色及商品归属模型。全站右下角「联系客服」打开聊天抽屉，手机为全屏；游客可体验文本咨询、快捷问题及明确标注的固定模拟回复。商品详情「咨询商品」和订单详情「联系商家客服」提供卡片预览，需点击发送后才加入会话，订单卡片不包含收货人、电话或地址。

消息只在当前页面内存保存，切换前端路由继续保留；刷新、登录、退出或切换账户会清空，关闭期间到达的模拟回复显示未读。输入框最多 500 字，Enter 发送、Shift+Enter 换行，并处理中文输入法组合状态。客服不发网络请求、不持久化消息、不接真人或 AI 服务；本期没有客服工作台、图片上传或真实历史记录。完整范围和验收记录保存在本地 Require 的《客服前端需求与实现交接.md》。

## 订单创建与模拟支付开发验收

```sh
VITE_CART_MOCK=true VITE_CART_MOCK_SCENARIO=normal VITE_ORDER_MOCK=true npm run dev
```

交易模拟需同时显式开启购物车与订单模拟，并使用有效的开发登录会话；单开订单模拟仍可查看旧查询样本，创建/支付返回 404。模拟商品目录与订单会话独立保存，不连接库存、消息队列或数据库，购物车故意暂留以验收异步清理延迟。`VITE_ORDER_MOCK_SCENARIO` 新增 `create-unknown`（已提交但返回 500）、`create-malformed`（已提交但响应畸形）、`pay-unknown`（已支付但返回 500，GET 恢复）、`expired`（第 16 分钟仍待付款、关闭中）。`normal` 包含服务端调价、运费及 0 元商品；已有查询故障场景保留。生产构建及 production 模式服务不安装模拟，不会在真实接口失败时回退成功。

本轮结果见 [订单创建与模拟支付验证记录](docs/verification/订单创建与模拟支付验证记录.md)。后端交易接口尚待实现和联调，开发模拟通过不代表真实交易可用。
