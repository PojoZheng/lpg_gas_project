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
