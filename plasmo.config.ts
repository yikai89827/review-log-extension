import { defineConfig } from "plasmo"
import dotenv from "dotenv"

// 加载环境变量
dotenv.config()

export default defineConfig({
  srcDir: "src",
  // entries are auto-detected from the src directory by Plasmo
  // background.ts, content.ts and sidepanel.tsx are picked up automatically.
  manifest: {
    name: "Review Log",
    description:
      "Capture, deduplicate and AI-analyze console logs in a Gemini-style side panel.",
    version: "0.1.0"
  },
  env: {
    DEFAULT_CONNECTION_MODE: process.env.DEFAULT_CONNECTION_MODE,
    SELF_HOSTED_SERVER_URL: process.env.SELF_HOSTED_SERVER_URL,
    GOEASY_HOST: process.env.GOEASY_HOST,
    GOEASY_APPKEY: process.env.GOEASY_APPKEY,
    GOEASY_CHANNEL: process.env.GOEASY_CHANNEL
  }
})
