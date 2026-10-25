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
- **导购与客服**：两个独立咨询入口，经 Gateway 登录校验后流式回复，每轮仅发送本轮文本。

> 本仓库为前端项目，业务功能需配合后端服务使用；支付为模拟功能；导购与客服需要后端提供 SSE 接口。

## 本地开发

Node.js 版本要求：`^22.18.0 || >=24.12.0`。

```sh
npm ci
npm run dev
```

开发环境默认将 `/api` 代理到 `http://localhost:8080`。需要自定义接口地址时，将 [.env.example](.env.example) 复制为 `.env.local` 并修改配置。

## 导购与客服

右下角「智能导购」使用 `POST /api/guide/turns/stream`，商品详情购买区下方「联系客服」使用 `POST /api/support/turns/stream`。两者携带当前 Bearer 令牌，JSON 请求体只有 `{"text":"本轮问题"}`，不发送用户 ID、聊天历史、入口类型或商品/订单信息。未登录发送时打开已有登录弹窗。

按 SSE `data: {"type":"delta","payload":{"text":"回答片段"}}` 追加回答，`data: {"type":"done","payload":{}}` 正常结束。断流显示失败并保留部分回答，不自动重试。前端分别保留两个入口的内存记录和草稿，刷新或退出登录后清空；清空按钮只清除本地显示，不代表清除后端上下文。部署时需确保 Gateway 和反向代理透传 SSE、关闭响应缓冲，并允许足够的流式响应时长。

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
