# Cloudflare Worker WebSocket 服务部署指南

本指南帮助你部署 Cloudflare Worker WebSocket 服务，实现 Review Log 的跨设备日志传输功能。

## 前提条件

1. 一个 Cloudflare 账号（免费账号即可）
2. Node.js 18+ 环境
3. Wrangler CLI 工具

## 部署步骤

### 1. 安装 Wrangler CLI

```bash
npm install -g wrangler
```

### 2. 登录 Cloudflare

```bash
wrangler login
```

这会打开浏览器让你登录 Cloudflare 账号并授权 Wrangler。

### 3. 进入 Worker 目录

```bash
cd cloudflare-worker
npm install
```

### 4. 部署 Worker

```bash
npm run deploy
```

部署成功后，你会看到类似这样的输出：

```
✨ Success! Uploaded 1 files
✨ Published review-log-ws-server (1.00 sec)
  https://review-log-ws-server.your-subdomain.workers.dev
```

记下这个 URL，这就是你的 WebSocket 服务地址。

### 5. 测试服务

访问 `https://review-log-ws-server.your-subdomain.workers.dev`，你会看到：

```json
{
  "name": "Review Log WebSocket Server",
  "version": "1.0.0",
  "status": "running",
  "connections": 0,
  "endpoints": {
    "ws": "/ws",
    "health": "/health",
    "rooms": "/rooms"
  }
}
```

## 使用方式

### 移动端 SDK 配置

在移动端页面引入 SDK，配置 WebSocket 地址：

```html
<script src="https://your-server/review-log-mob-sdk.js"></script>
<script>
  ReviewLogSDK.init({
    host: 'wss://review-log-ws-server.your-subdomain.workers.dev',
    debug: true
  })
</script>
```

或者通过 URL 参数配置：

```html
<script src="https://your-server/review-log-mob-sdk.js?host=wss://review-log-ws-server.your-subdomain.workers.dev&debug=true"></script>
```

### 扩展端配置

1. 打开浏览器扩展的侧边栏
2. 点击 📱 按钮（移动端连接）
3. 输入 WebSocket 地址：`wss://review-log-ws-server.your-subdomain.workers.dev`
4. 点击"连接"按钮

## 工作原理

1. **移动端**：SDK 捕获 console 日志和用户事件，通过 WebSocket 发送到 Cloudflare Worker
2. **Cloudflare Worker**：接收消息，广播给所有连接的客户端（包括扩展端）
3. **扩展端**：接收 WebSocket 消息，显示日志和事件

## 免费额度

Cloudflare Workers 免费账号提供：
- 每天 100,000 次请求
- 每次请求最多 50ms CPU 时间
- 无限 WebSocket 连接时长

对于个人使用和小型项目，免费额度完全足够。

## 本地开发

如果想在本地测试 Worker：

```bash
npm run dev
```

这会启动本地开发服务器，地址通常是 `http://localhost:8787`。

移动端 SDK 可以连接到：
```javascript
ReviewLogSDK.init({
  host: 'ws://localhost:8787',
  debug: true
})
```

## 查看实时日志

查看 Worker 的实时日志：

```bash
npm run tail
```

这会显示所有经过 Worker 的请求和消息。

## 常见问题

### Q: WebSocket 连接失败？

检查：
1. URL 格式是否正确（需要 `wss://` 协议）
2. Worker 是否成功部署
3. Cloudflare 账号是否正常

### Q: 移动端日志没有显示？

检查：
1. SDK 是否正确初始化
2. WebSocket 是否连接成功（查看 debug 日志）
3. 扩展端是否已连接到同一个 Worker

### Q: 如何查看当前连接数？

访问 `/health` 端点：
```
https://review-log-ws-server.your-subdomain.workers.dev/health
```

### Q: 如何查看设备房间？

访问 `/rooms` 端点：
```
https://review-log-ws-server.your-subdomain.workers.dev/rooms
```

## 自定义域名

如果想使用自定义域名：

1. 在 Cloudflare Dashboard 中添加你的域名
2. 在 `wrangler.toml` 中添加路由配置：

```toml
routes = [
  { pattern = "ws.yourdomain.com/*", zone_name = "yourdomain.com" }
]
```

3. 重新部署：
```bash
npm run deploy
```

## 安全建议

1. 不要在公共场合暴露你的 Worker URL
2. 可以在 Worker 中添加简单的认证机制
3. 使用 HTTPS/WSS 协议确保传输安全

## 进阶配置

### 添加认证

修改 `src/index.js`，添加简单的 token 认证：

```javascript
// 在 handleWebSocket 函数中添加
const token = url.searchParams.get("token")
if (token !== "your-secret-token") {
  return new Response("Unauthorized", { status: 401 })
}
```

移动端和扩展端连接时需要带上 token：
```
wss://review-log-ws-server.your-subdomain.workers.dev?token=your-secret-token
```

### 添加日志持久化

可以使用 Cloudflare KV 存储历史日志：

```toml
[[kv_namespaces]]
binding = "LOGS"
id = "your-kv-namespace-id"
```

在 Worker 中保存日志：
```javascript
await env.LOGS.put(`log-${Date.now()}`, JSON.stringify(data))
```

## 支持

如有问题，请访问项目 GitHub 仓库提交 Issue。