# NESmartMall · 经纬智选

![Vue](https://img.shields.io/badge/Vue-3-4FC08D)
![TypeScript](https://img.shields.io/badge/TypeScript-6-3178C6)
![Vite](https://img.shields.io/badge/Vite-8-646CFF)
![Element Plus](https://img.shields.io/badge/Element%20Plus-2-409EFF)
![Pinia](https://img.shields.io/badge/Pinia-4-FFD859)
![Axios](https://img.shields.io/badge/Axios-1-5A29E4)

面向测绘仪器的商城前端，涵盖商品浏览、购物车、订单与商家商品管理。

## 功能

- **商品浏览**：分类筛选、关键词搜索、分页列表与商品详情。
- **账号管理**：注册登录、会话恢复与跨标签页同步。
- **购物与订单**：购物车管理、收货信息填写、订单查询与模拟支付。
- **限时秒杀**：活动商品列表、详情、倒计时与购买请求提交。
- **商家管理**：商品统计、新增编辑与上下架。
- **客服演示**：文本咨询、商品与订单卡片、模拟回复。

> 本仓库为前端项目，业务功能需配合后端服务使用；支付与客服为演示功能。

## 本地开发

Node.js 版本要求：`^22.18.0 || >=24.12.0`。

```sh
npm ci
npm run dev
```

开发环境默认将 `/api` 代理到 `http://localhost:8080`。需要自定义接口地址时，将 [.env.example](.env.example) 复制为 `.env.local` 并修改配置。

## 常用命令

| 命令              | 说明                               |
| ----------------- | ---------------------------------- |
| `npm run dev`     | 启动开发服务                       |
| `npm run build`   | 类型检查并构建，产物输出到 `dist/` |
| `npm run preview` | 本地预览构建产物                   |
| `npm test`        | 运行测试                           |
| `npm run lint`    | 检查并修复代码规范问题             |

## 项目结构

```text
src/
├── api/          # 接口请求与数据适配
├── components/   # 商城与商家组件
├── composables/  # 业务逻辑
├── router/       # 页面路由
├── stores/       # 状态管理
├── types/        # 类型定义
└── views/        # 页面
```

## 开发模拟与部署

购物车和订单模拟需有效登录会话，可通过以下命令开启：

```sh
VITE_CART_MOCK=true VITE_CART_MOCK_SCENARIO=normal VITE_ORDER_MOCK=true npm run dev
```

秒杀展示演示可单独设置 `VITE_FLASH_SALE_DEMO=true`。以上模拟仅用于开发，默认关闭，真实接口失败时不会自动切换模拟数据。

部署时发布 `dist/`，并配置后端接口地址或 `/api` 反向代理。前端路由回退配置见 [deploy/nginx.conf](deploy/nginx.conf)。
