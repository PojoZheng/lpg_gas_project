# task-23 review（先审查后修复）

## 审查范围
- `/.trellis/delivery-app/src/*.js`
- `/.trellis/platform/src/*.js`

## 审查清单（vercel-react-best-practices 等效维度）

### P0
1. **请求副作用缺少兜底**
   - 现状：多个 `requestJson()` 直接 `res.json()`，服务端异常返回或非 JSON 时会抛错并中断交互链路。
   - 风险：页面操作无统一失败对象，调用方难以稳定处理。
2. **会话读取缺少容错**
   - 现状：`auth-client` 直接 `JSON.parse(localStorage)`，脏数据会导致启动期崩溃。
   - 风险：页面白屏或登录态逻辑失效。

### P1
1. **重复请求封装可维护性弱**
   - 现状：delivery/platform 多个 client 文件重复实现请求逻辑，错误语义不一致。
   - 风险：后续维护时容易产生行为分叉。

## 修复策略（聚焦高价值，不扩改）
- 对现有 `requestJson` 增加网络异常、非 JSON 响应、HTTP 异常三层兜底并统一返回 `{ success:false, error }`。
- 对本地会话读取增加 parse 容错与坏数据自清理。
- 保持 API 路径、请求参数、响应契约不变。
