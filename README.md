# NESmartMall

经纬智选商城前端，使用 Vue 3、TypeScript、Element Plus 与 Axios。

首页默认选中“全部”，打开页面自动请求销量前八的商品，加载时显示八张骨架卡片。商品卡片展示封面、名称、人民币价格及购买人数，支持加载、空列表、失败和重试状态。后端价格以分为单位，前端转换为元（例如 `990` 展示为 `¥9.90`）。分类切换会发送 `categoryId`：全站仪 1、GNSS / RTK 2、水准仪 3、测距仪 4、配件 5；“全部”省略分类参数。前端已按此约定实现，后端分类筛选待接入。

搜索栏点击图标或按回车提交；空输入显示 warning 提示“请输入搜索词”。首页或分类浏览页提交有效输入时，在新标签页打开全分类搜索结果；搜索结果页再次搜索则在当前页面更新并回到第 1 页。搜索结果隐藏分类栏，复用 `/api/products/page?keyword=搜索词&pageNum=1` 请求，每页最多 12 件并支持分页。关键词匹配由后端执行，本次仅完成前端，真实搜索仍需后端支持 `keyword` 后联调，接口约定见 `docs/product-api-contract.md`。

开发服务将 `/api` 代理到 `http://localhost:8080`，默认请求 `/api/products?limit=8`，前端省略 `sort`，由后端默认按销量降序排列。部署地址可通过 `.env.example` 中的环境变量配置；参数、响应字段及价格单位集中在 `src/api/productContract.ts`。详情见 [商品接口契约](docs/product-api-contract.md)。

首页组件位于 `src/components/storefront/`，页面位于 `src/views/HomeView.vue`，查询状态位于 `src/composables/useHomeProducts.ts`。订单、购物车在对应路由未实现时禁用。

用户入口打开账号密码登录弹窗，提交 `POST /api/auth/login`，JSON body 为 `{ "account": "账号", "password": "密码" }`。仅当业务 `code` 为 `200` 且返回完整的 `accessToken`、`tokenType: "Bearer"`、`expiresIn` 和用户信息时建立登录状态；登录成功关闭弹窗并留在当前页面。入口保留用户图标，桌面显示昵称，点击可查看昵称、账号和退出登录。登录会话存入当前标签页的 `sessionStorage`，刷新可恢复，关闭标签页后结束；不保存密码。请求自动附带 Bearer token，过期或收到匹配当前 token 的 `401` 时清理会话。退出登录目前清理前端会话，不调用未提供的后端注销接口。注册、找回密码和个人中心尚未接入。

完整需求见 [需求总览](docs/requirements/需求.md) 和 [用户入口与登录状态](docs/requirements/用户入口与登录状态需求.md)。`docs/requirements/` 同步保存本地 `NESmartMall_Require` 的 Markdown 文档，用于 GitHub 版本记录；后续更新需求时同步维护。

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

### Test Login API and Session Behavior

```sh
npm test
```

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
