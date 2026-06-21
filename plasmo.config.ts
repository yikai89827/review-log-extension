import { defineConfig } from "plasmo"
import dotenv from "dotenv"

// 加载环境变量
dotenv.config()

export default defineConfig({
  srcDir: "src",
  manifest: {
    name: "Review Log",
    description:
      "Capture, deduplicate and AI-analyze console logs in a Gemini-style side panel.",
    version: "0.1.0"
  },
  env: {
    // 使用 PUBLIC_ 前缀以便在前端访问
    PUBLIC_DEFAULT_CONNECTION_MODE: process.env.DEFAULT_CONNECTION_MODE || "self-hosted",
    PUBLIC_SELF_HOSTED_SERVER_URL: process.env.SELF_HOSTED_SERVER_URL || "",
    PUBLIC_GOEASY_HOST: process.env.GOEASY_HOST || "hangzhou.goeasy.io",
    PUBLIC_GOEASY_APPKEY: process.env.GOEASY_APPKEY || "",
    PUBLIC_GOEASY_CHANNEL: process.env.GOEASY_CHANNEL || "review-log-channel"
  }
})
