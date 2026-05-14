# Services

本目录承载后端服务实现。

## 子目录

- `backend/`：认证、订单、库存、财务、安检、平台策略等协调逻辑

## 说明

历史上后端代码位于 `.trellis/backend/`。当前以 `services/backend/` 作为主路径，`.trellis/backend` 保留为兼容链接。

## 安检上报配置

安检上报支持两种模式：

- `SAFETY_REPORT_MODE=mock`：本地模拟成功（默认）
- `SAFETY_REPORT_MODE=external`：调用真实外部监管接口

当 `SAFETY_REPORT_MODE=external` 时可配置：

- `SAFETY_REPORT_ENDPOINT`：监管上报 HTTP 地址（必填）
- `SAFETY_REPORT_TIMEOUT_MS`：上报超时毫秒，默认 `8000`
- `SAFETY_REPORT_AUTH_TOKEN`：可选，若提供会以 `Authorization: Bearer <token>` 发送

## 运行态持久化

后端会将核心业务运行态（订单、库存、财务、安检、离线队列、策略版本等）写入本地文件，重启后自动恢复。

- 默认路径：`services/backend/data/runtime-state.json`
- 可通过 `TRELLIS_RUNTIME_STATE_PATH` 自定义路径

说明：

- `auth` 会话状态仍由 `auth-state.json` 管理
- 客户台账仍由 `customer-ledger.json` 管理
- 可通过 `TRELLIS_AUTH_STATE_PATH` 自定义 `auth-state.json` 路径（便于测试环境隔离）

## 公网部署基线

当前仓库已经补齐最小生产启动入口，可直接作为独立 Node 服务部署：

- 启动目录：`services/backend/`
- 启动命令：`npm start`
- 健康检查：`GET /health`
- 示例部署描述：根目录 `render.yaml`

推荐环境变量：

- `PORT`：服务端口，默认 `3100`
- `HOST`：监听地址，生产建议 `0.0.0.0`
- `CORS_ALLOW_ORIGIN`：前端公网域名，例如 `https://lpg-delivery-app.pages.dev`
- `SAFETY_REPORT_MODE`：默认 `mock`，接真实监管再改为 `external`
- `SAFETY_REPORT_ENDPOINT`：`SAFETY_REPORT_MODE=external` 时必填

## 前端接正式后端

移动端与平台端都支持以下三种方式指定 API 根地址，优先级从高到低：

1. URL 参数：`?apiBase=https://your-backend.example.com`
2. 浏览器本地存储：`localStorage.setItem("lpg_api_base_url", "https://your-backend.example.com")`
3. 同目录 `runtime-config.js` 中设置：

```js
window.__LPG_API_BASE_URL__ = "https://your-backend.example.com";
```

说明：

- 本地开发访问 `127.0.0.1` / `localhost` 时，前端仍会默认走 `:3100`
- 上公网后若不设置上述覆盖项，前端不会再错误地把 Cloudflare Pages 域名拼成 `:3100`
