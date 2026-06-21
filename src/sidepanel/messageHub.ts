import type { RuntimeMessage } from "../types"

type Handler = (msg: RuntimeMessage) => void

const HUB_KEY = "__review_log_sidepanel_message_hub__"

interface HubState {
  installed: boolean
  handler: Handler | null
}

function getHub(): HubState {
  const g = globalThis as typeof globalThis & { [HUB_KEY]?: HubState }
  if (!g[HUB_KEY]) {
    g[HUB_KEY] = { installed: false, handler: null }
  }
  return g[HUB_KEY]
}

/** 全局唯一 listener；flag 存 globalThis，HMR 重载模块时不会重复注册 */
export function setSidepanelMessageHandler(next: Handler) {
  const hub = getHub()
  hub.handler = next
  if (hub.installed) return
  hub.installed = true
  chrome.runtime.onMessage.addListener((msg) => {
    if (hub.handler && msg && typeof msg === "object") {
      hub.handler(msg as RuntimeMessage)
    }
  })
}
