import { defineConfig } from "plasmo"

// 使用 --environment 标志时，Plasmo 会自动加载对应的 .env.{environment} 文件
// 例如: --environment development 加载 .env.development
// 不手动加载 .env，由 Plasmo 自动处理

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "Review Log",
    description:
      "Capture, deduplicate and AI-analyze console logs in a Gemini-style side panel.",
    version: "0.1.0"
  }
})
