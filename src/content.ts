// Content script. Bridges between the page's MAIN world (where console is
// hooked) and the extension's background service worker. It runs in the
// ISOLATED world and listens to window.postMessage from the injected script.

import type { PlasmoContentScript } from "plasmo"

import type {
  InjectEventMessage,
  InjectToContentMessage,
  LogEntry,
  PageActionEvent
} from "./types"

export const config: PlasmoContentScript = {
  matches: ["<all_urls>"]
}

const HANDSHAKE = "review-log-inject"
const HANDSHAKE_EVENT = `${HANDSHAKE}-event`
const HANDSHAKE_READY = `${HANDSHAKE}-ready`
const INIT_FLAG = "__review_log_content_injected__"

// Prevent duplicate injection
if ((window as unknown as Record<string, boolean>)[INIT_FLAG]) {
  console.debug("[ReviewLog Content] Already injected, skipping")
} else {
  ;(window as unknown as Record<string, boolean>)[INIT_FLAG] = true

  function handleMessage(event: MessageEvent) {
    if (event.source !== window) return
    const data = event.data as
      | InjectToContentMessage
      | InjectEventMessage
      | { source: typeof HANDSHAKE_READY }
      | undefined
    if (!data || typeof data !== "object" || !("source" in data)) return

    if (data.source === HANDSHAKE) {
      const entry: LogEntry = { ...data.payload }
      try {
        chrome.runtime.sendMessage({ type: "log:append", entry })
      } catch {
        /* extension reloading, ignore */
      }
      return
    }

    if (data.source === HANDSHAKE_EVENT) {
      try {
        chrome.runtime.sendMessage({
          type: "action:append",
          event: { ...data.payload, tabId: -1 } // background rewrites tabId
        })
      } catch {
        /* ignore */
      }
      return
    }

    if (data.source === HANDSHAKE_READY) {
      return
    }
  }

  window.addEventListener("message", handleMessage)
}
