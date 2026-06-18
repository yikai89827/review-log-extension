import { defineConfig } from "plasmo"

export default defineConfig({
  srcDir: "src",
  // entries are auto-detected from the src directory by Plasmo
  // background.ts, content.ts and sidepanel.tsx are picked up automatically.
  manifest: {
    name: "Review Log",
    description:
      "Capture, deduplicate and AI-analyze console logs in a Gemini-style side panel.",
    version: "0.1.0"
  }
})
