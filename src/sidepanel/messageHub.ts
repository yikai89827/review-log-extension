import type { RuntimeMessage } from "../types"

type Handler = (msg: RuntimeMessage) => void

let handler: Handler | null = null
let installed = false

/** 全局唯一 listener，避免 HMR 重复注册导致日志双份 */
export function setSidepanelMessageHandler(next: Handler) {
  handler = next
  if (installed) return
  installed = true
  chrome.runtime.onMessage.addListener((msg) => {
    if (handler && msg && typeof msg === "object") {
      handler(msg as RuntimeMessage)
    }
  })
}
