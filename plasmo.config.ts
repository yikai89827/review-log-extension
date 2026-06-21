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
  }
})
