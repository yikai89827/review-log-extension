# Review Log

PC 端浏览器扩展：在侧边栏完整替代 DevTools Console 的日志查看体验，并将 **用户操作 + console 输出** 串联成事件流，支持 **一键 AI 归因分析**。

> 当前版本聚焦 **PC 页内调试 + AI 分析**。移动端远程日志能力尚未纳入正式版本，相关代码保留在仓库中供后续迭代。

## 目前已实现

### 日志采集

- 自动 hook 页面 `console.log / info / warn / error / debug`
- 捕获未处理的 `error` 与 `unhandledrejection`
- 序列化对象、DOM 节点、Error 堆栈等复杂类型
- 连续相同日志自动合并（显示 `×N` 计数）

### 用户行为追踪

- 记录 click、input、submit、keydown（Enter / Escape / Tab）等交互
- 展示触发元素的选择器描述，便于还原操作路径

### 侧边栏控制台

- Gemini 风格深色 / 浅色主题
- 按类型过滤：log / info / warn / error / 动作
- 按时间线混排日志与行为事件
- 切换标签页自动加载对应页面的历史记录
- 支持清空当前页日志

### AI 分析

- 一键将事件流转为分析报告
- 输出 **根因分析** 与 **修复建议** 两个章节
- 支持配置 OpenAI 兼容 API（endpoint、model、apiKey），设置保存在本地

### 工程能力

- Chrome Manifest V3 + Plasmo + React 18 + TypeScript
- 日志持久化至 IndexedDB（按 tabId）
- 开发模式 HMR 下防止消息重复监听导致日志双份

## 未来计划

### 近期（PC 体验）

- [ ] Network 请求摘要与日志时间线关联
- [ ] 导出事件流（JSON / Markdown）
- [ ] 自定义 AI Prompt 模板
- [ ] 日志搜索与关键字高亮

### 中期（移动端远程调试 — 核心差异化方向）

移动端 H5 / WebView 难以像 PC 一样打开 DevTools，这是本产品的主要潜在价值点。计划以 **极简方案** 重新实现，避免 GoEasy / 云依赖 / 复杂配置：

- [ ] 局域网 WebSocket 中继：手机页 SDK → `ws://电脑IP:端口` → PC 插件接收
- [ ] 二维码 / 短码配对，免手动填写 IP 和端口
- [ ] 页内 vConsole 兜底：未连上 PC 时，手机端仍可本地看 log
- [ ] AI 分析仍在 PC 侧边栏完成，移动端只负责采集与推送

> 仓库中的 `src/sdk/`、`server/`、`cloudflare-worker/` 为早期探索代码，**不在当前扩展功能范围内**，后续可能重构或移除。

## 技术栈

| 类别 | 选型 |
|------|------|
| 框架 | Plasmo v0.90.5 |
| 语言 | TypeScript |
| UI | React 18 |
| 存储 | IndexedDB |
| 目标浏览器 | Chrome（Manifest V3） |

## 安装与构建

```bash
# 安装依赖
npm install

# 开发模式（热更新）
npm run dev

# 构建
npm run build:dev    # 开发环境
npm run build:prod   # 生产环境
```

### 加载到 Chrome

1. 打开 `chrome://extensions/`
2. 开启「开发者模式」
3. 点击「加载已解压的扩展程序」
4. 选择目录：
   - 开发：`build/chrome-mv3-dev`
   - 生产：`build/chrome-mv3-prod`

## 使用方法

### 1. 查看页面日志

1. 打开任意网页（可用 `dev-test/demo.html` 做功能验证）
2. 点击扩展图标，打开侧边栏
3. 页面中的 `console.*` 输出和用户操作会自动出现在事件流中
4. 使用顶部过滤器查看特定类型

### 2. AI 分析

1. 在侧边栏底部点击 **✨ 一键 AI 分析**
2. 首次使用请点击 ⚙ 配置 API Key 与模型（默认 OpenAI 兼容接口）
3. 查看 AI 给出的根因分析与修复建议

### 3. 本地测试页

```bash
# 用任意静态服务器打开 dev-test 目录，例如：
npx serve dev-test
```

在浏览器中访问 `demo.html`，点击各测试按钮验证日志采集与 AI 分析。

## 项目结构

```
src/
├── sidepanel/              # 侧边栏 UI
│   ├── App.tsx             # 主界面
│   ├── messageHub.ts       # 全局消息监听（防 HMR 重复）
│   └── components/
│       ├── LogRow.tsx      # 日志行
│       ├── ActionRow.tsx   # 行为事件行
│       ├── ObjectPreview.tsx
│       ├── SettingsPanel.tsx   # AI 配置
│       └── AnalysisPanel.tsx   # AI 分析结果
├── contents/
│   └── inject.ts           # MAIN world：hook console / 用户事件
├── content.ts              # ISOLATED world：与 background 通信
├── background.ts           # Service Worker：日志缓冲与转发
├── types.ts
└── utils/
    ├── logDedupe.ts        # 展示层去重
    ├── ai.ts               # AI 分析
    └── indexedDB.ts        # 持久化

dev-test/                   # 本地调试测试页
src/sdk/                    # [实验] 移动端 SDK，未接入当前扩展
server/                     # [实验] 自建 WS 服务
cloudflare-worker/          # [实验] Cloudflare Workers WS
```

## 贡献

欢迎提交 Issue 和 Pull Request。

## 许可证

MIT License
