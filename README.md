# Review Log

PC 端 Chrome 扩展：在侧边栏提供 **Console + 用户操作 + 网络请求** 的统一事件流，支持搜索、导出、DOM 高亮与 **一键 AI 归因分析**。

> 当前版本聚焦 **PC 页内调试 + AI 分析**。移动端远程日志能力尚未纳入正式版本，相关实验代码保留在仓库中供后续迭代。

## 功能概览

| 能力 | 说明 |
|------|------|
| Console 采集 | hook `log / info / warn / error / debug`，捕获未处理 error 与 unhandledrejection |
| 用户行为 | click、input、submit、keydown（Enter / Escape / Tab）；input 同一元素合并为一条并显示 `×N` |
| 网络请求 | 拦截 fetch / XHR，展示 method、URL、status、耗时，可与日志时间线关联 |
| 去重 | 连续相同日志合并；input 按元素 key 合并；HMR 下按 `eventId` 防双份 |
| 侧边栏 UI | 深色 / 浅色主题、类型过滤、搜索、自动滚动、右键菜单 |
| 导出 | 一键导出 txt + json；右键复制单条 / 复制当前列表 |
| DOM 辅助 | 堆栈行 / 行为目标点击 → 页内紫色高亮对应元素 |
| AI 分析 | 将事件流转为「根因分析 + 修复建议」；支持多模型预设与自定义 Endpoint |
| 持久化 | IndexedDB 按 tabId 存储，切换标签页自动恢复历史 |

## 架构

```
inject.ts (MAIN world)
  hook console / 用户事件 / fetch·XHR
  postMessage
    ↓
content.ts (ISOLATED world)
  chrome.runtime.sendMessage
    ↓
background.ts (Service Worker)
  环形缓冲、eventId 去重、IndexedDB、按 tab 广播
    ↓
sidepanel/messageHub.ts → App.tsx
  logDedupe 展示层 → LogRow / ActionRow / NetworkRow
```

## 侧边栏操作

### 查看与过滤

1. 点击扩展图标打开侧边栏
2. 页面中的 `console.*`、用户操作、网络请求会自动进入事件流
3. 顶部 **搜索框** 按关键词过滤
4. 过滤器：`All` / `log` / `info` / `warn` / `error` / `Action` / `net`

### 复制与导出

- **右键菜单**：复制本条 / 复制全部（当前列表）/ 导出 txt + json
- 头部 **⤓** 按钮：导出完整事件流（txt + json）

### DOM 高亮

- 点击 **Error 堆栈** 中的源码位置 → 尝试在页面高亮对应 DOM
- 点击 **Action 行** 的目标选择器 → 高亮触发元素

### AI 分析

1. 底部点击 **✨ 一键 AI 分析**
2. 首次使用点击 **⚙ 设置**，选择模型预设或自定义 Endpoint / Model / API Key
3. 支持预设：OpenAI、DeepSeek、通义千问、智谱 GLM、Moonshot Kimi 等 OpenAI 兼容接口
4. API Key 仅保存在浏览器本地，不会上传到扩展作者服务器

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | Plasmo v0.90.5 |
| 语言 | TypeScript |
| UI | React 18 |
| 存储 | IndexedDB + localStorage（AI 配置） |
| 目标浏览器 | Chrome Manifest V3 |

## 安装与构建

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 构建
npm run build:dev    # 开发环境 → build/chrome-mv3-dev
npm run build:prod   # 生产环境 → build/chrome-mv3-prod

# 打包 zip（上架用）
npm run package:prod
```

### 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录：
   - 开发：`build/chrome-mv3-dev`
   - 生产：`build/chrome-mv3-prod`

### 本地测试页

```bash
npx serve dev-test
```

浏览器访问 `demo.html`，点击各测试按钮验证采集、搜索、导出与 AI 分析。

## 开发与调试

开发模式下 Plasmo HMR 可能导致 **扩展上下文失效** 或侧边栏白屏。若出现异常，请按顺序操作：

1. `chrome://extensions` — **完全移除**旧扩展后重新加载 `build/chrome-mv3-dev`
2. **关闭**侧边栏再重新打开
3. **刷新**测试页（F5），消除 `Extension context invalidated`

每次 `npm run dev` 重新编译后，建议重复上述步骤，而不是仅依赖热更新。

## 项目结构

```
src/
├── sidepanel/
│   ├── App.tsx                 # 主界面（搜索 / 过滤 / 导出 / AI）
│   ├── SidepanelShell.tsx      # 挂载兜底 + Error Boundary
│   ├── messageHub.ts           # 全局消息监听（防 HMR 重复注册）
│   └── components/
│       ├── LogRow.tsx          # 日志行 + ClampedText（长文本截断）
│       ├── ActionRow.tsx       # 用户行为行
│       ├── NetworkRow.tsx      # 网络请求行
│       ├── StackTrace.tsx      # 可点击堆栈
│       ├── ObjectPreview.tsx   # 结构化对象预览
│       ├── ContextMenu.tsx     # 右键菜单
│       ├── SettingsPanel.tsx   # AI 配置（模型预设）
│       └── AnalysisPanel.tsx   # AI 分析结果
├── contents/
│   └── inject.ts               # MAIN world：console / 行为 / 网络 hook
├── content.ts                  # ISOLATED world：消息桥接 + DOM 高亮转发
├── background.ts               # Service Worker：缓冲、去重、持久化
├── types.ts
└── utils/
    ├── logDedupe.ts            # 展示层去重、导出、搜索匹配
    ├── ai.ts / aiModels.ts     # AI 分析与模型预设
    ├── indexedDB.ts            # 按 tab 持久化
    ├── extensionContext.ts     # 扩展上下文失效时的安全 sendMessage
    ├── stackParser.ts          # 堆栈解析
    ├── domInspect.ts           # 侧边栏 → 页内高亮
    └── clipboard.ts            # 复制 / 下载

dev-test/                       # 本地调试页
src/sdk/                        # [实验] 移动端 SDK，未接入当前扩展
server/                         # [实验] 自建 WS 服务
cloudflare-worker/              # [实验] Cloudflare Workers WS
```

## 权限说明

扩展申请以下权限以完成核心功能：

| 权限 | 用途 |
|------|------|
| `sidePanel` | 侧边栏展示事件流 |
| `tabs` | 按标签页隔离日志、切换 tab 加载历史 |
| `storage` | 扩展配置 |
| `scripting` | 向页面注入采集脚本 |
| `<all_urls>` | 在任意网页 hook console 与用户事件（调试工具必需） |

**隐私承诺（上架时需写入商店说明与 Privacy Policy）：**

- 日志与 AI API Key 默认仅保存在用户本地
- AI 分析由用户配置的第三方 API 直接发起，扩展不中转用户页面内容
- 不上传、不出售用户浏览数据

## 路线图

### 已完成（v0.2.x）

- [x] Network 请求摘要与时间线关联
- [x] 导出事件流（txt + json）
- [x] 日志搜索
- [x] 右键复制 / 导出
- [x] 堆栈与 DOM 高亮
- [x] Input 去重（单元素一行 + 最新值）
- [x] AI 模型预设与保存反馈

### 近期计划

- [ ] 自定义 AI Prompt 模板
- [ ] 搜索关键词高亮
- [ ] Markdown 导出 / 一键生成 Bug Report
- [ ] 英文商店页与 i18n

### 中期（差异化方向）

移动端 H5 / WebView 难以打开 DevTools，计划以 **极简局域网方案** 重新实现：

- [ ] 局域网 WebSocket：手机页 SDK → PC 插件
- [ ] 二维码配对
- [ ] 页内 vConsole 兜底
- [ ] AI 分析仍在 PC 侧边栏完成

> `src/sdk/`、`server/`、`cloudflare-worker/` 为早期探索代码，**不在当前扩展功能范围内**。

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
