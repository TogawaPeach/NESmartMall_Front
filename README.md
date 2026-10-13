# NESmartMall

经纬智选商城前端，使用 Vue 3、TypeScript、Element Plus 与 Axios。

首页默认选中“全部”，打开页面自动请求销量前八的商品，加载时显示八张骨架卡片。商品卡片展示封面、名称、人民币价格及购买人数，支持加载、空列表、失败和重试状态。后端价格以分为单位，前端转换为元（例如 `990` 展示为 `¥9.90`）。分类切换会发送 `categoryId`：全站仪 1、GNSS / RTK 2、水准仪 3、测距仪 4、配件 5；“全部”省略分类参数。前端已按此约定实现，后端分类筛选待接入。关键词搜索参数尚未提供，触发时显示暂未开放提示。

开发服务将 `/api` 代理到 `http://localhost:8082`，默认请求 `/api/products?limit=8`，前端省略 `sort`，由后端默认按销量降序排列。部署地址可通过 `.env.example` 中的环境变量配置；参数、响应字段及价格单位集中在 `src/api/productContract.ts`。详情见 [商品接口契约](docs/product-api-contract.md)。

首页组件位于 `src/components/storefront/`，页面位于 `src/views/HomeView.vue`，查询状态位于 `src/composables/useHomeProducts.ts`。订单、购物车及用户入口在对应路由未实现时禁用。

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

### Lint with [ESLint](https://eslint.org/)

```sh
npm run lint
```
