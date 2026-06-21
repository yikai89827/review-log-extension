// Content script. Bridges between the page's MAIN world (where console is
// hooked) and the extension's background service worker. It runs in the
// ISOLATED world and listens to window.postMessage from the injected script.

import type { PlasmoContentScript } from "plasmo"

import {
  isExtensionContextValid,
  safeRuntimeSendMessage
} from "./utils/extensionContext"
import type {
  InjectEventMessage,
  InjectToContentMessage,
  LogEntry
} from "./types"

export const config: PlasmoContentScript = {
  matches: ["<all_urls>"]
}

const HANDSHAKE = "review-log-inject"
const HANDSHAKE_EVENT = `${HANDSHAKE}-event`
const HANDSHAKE_READY = `${HANDSHAKE}-ready`
const LISTENER_KEY = "__review_log_content_handle_message__"

const w = window as unknown as Record<string, EventListener | undefined>

function teardownContentBridge(): void {
  window.removeEventListener("message", handleMessage)
  w[LISTENER_KEY] = undefined
}

function handleMessage(event: Event) {
  if (!isExtensionContextValid()) {
    teardownContentBridge()
    return
  }

  const messageEvent = event as MessageEvent
  if (messageEvent.source !== window) return
  const data = messageEvent.data as
    | InjectToContentMessage
    | InjectEventMessage
    | { source: typeof HANDSHAKE_READY }
    | undefined
  if (!data || typeof data !== "object" || !("source" in data)) return

  if (data.source === HANDSHAKE) {
    const entry: LogEntry = { ...data.payload }
    if (!safeRuntimeSendMessage({ type: "log:append", entry })) {
      teardownContentBridge()
    }
    return
  }

  if (data.source === HANDSHAKE_EVENT) {
    if (
      !safeRuntimeSendMessage({
        type: "action:append",
        event: { ...data.payload, tabId: -1 }
      })
    ) {
      teardownContentBridge()
    }
    return
  }
}

// Replace stale listener after HMR / extension reload (old context is gone)
const prev = w[LISTENER_KEY]
if (prev) {
  window.removeEventListener("message", prev)
}
w[LISTENER_KEY] = handleMessage
window.addEventListener("message", handleMessage)
