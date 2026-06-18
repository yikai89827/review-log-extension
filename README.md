# Review Log

一个强大的浏览器扩展，帮助开发者收集、查看和分析页面日志与用户行为事件。

## ✨ 功能特性

- **自动日志收集**: 自动捕获 `console.log/info/warn/error/debug` 输出
- **用户行为追踪**: 记录用户点击、输入、提交等交互事件
- **DOM元素展示**: 支持树状展开显示DOM节点
- **错误堆栈查看**: 完整显示错误信息和堆栈追踪
- **主题切换**: 支持深色/浅色主题
- **日志过滤**: 按类型过滤日志（log/info/warn/error/action）
- **AI分析**: 一键分析事件流，提供智能洞察
- **跨页面日志**: 切换标签页自动显示对应页面日志

## 🛠️ 技术栈

- **框架**: Plasmo v0.90.5
- **语言**: TypeScript
- **UI**: React 18
- **浏览器兼容**: Chrome (Manifest V3)

## 📦 安装

### 开发环境

```bash
# 安装依赖
npm install

# 启动开发服务器
npm run dev
```

### 构建生产版本

```bash
npm run build
```

### 加载扩展到 Chrome

1. 打开 Chrome 浏览器
2. 进入 `chrome://extensions/`
3. 开启「开发者模式」
4. 点击「加载已解压的扩展程序」
5. 选择项目的 `build/chrome-mv3-prod` 目录

## 🚀 使用方法

1. 在浏览器中打开任意网页
2. 点击浏览器右上角的 Review Log 扩展图标
3. 侧边栏会自动显示页面的日志和用户行为
4. 可以使用过滤器查看特定类型的日志
5. 点击「✨ 一键 AI 分析」获取智能分析报告

## 📁 项目结构

```
src/
├── sidepanel/           # 侧边栏UI组件
│   ├── components/      # 组件目录
│   │   ├── ActionRow.tsx      # 行为日志行组件
│   │   ├── LogRow.tsx         # 日志行组件
│   │   ├── ObjectPreview.tsx  # 对象/数组预览组件
│   │   ├── SettingsPanel.tsx  # 设置面板
│   │   └── AnalysisPanel.tsx  # AI分析面板
│   ├── App.tsx          # 主应用组件
│   └── style.css        # 全局样式
├── contents/            # 内容脚本
│   └── inject.ts        # 注入到页面的脚本（捕获日志）
├── content.ts           # 内容脚本（通信桥梁）
├── background.ts        # 后台服务Worker
├── types.ts             # 类型定义
└── utils/               # 工具函数
    ├── ai.ts            # AI分析工具
    └── logDedupe.ts     # 日志去重工具
```

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📄 许可证

MIT License

## 👥 作者

Review Log Team
