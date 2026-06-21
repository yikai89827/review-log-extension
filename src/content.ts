// Content script. Bridges between the page's MAIN world (where console is
// hooked) and the extension's background service worker. It runs in the
// ISOLATED world and listens to window.postMessage from the injected script.

import type { PlasmoContentScript } from "plasmo"

import {
  isExtensionContextValid,
  safeRuntimeSendMessage
} from "./utils/extensionContext"
import type {
  DomHighlightPayload,
  InjectEventMessage,
  InjectNetworkMessage,
  InjectToContentMessage,
  LogEntry
} from "./types"

export const config: PlasmoContentScript = {
  matches: ["<all_urls>"]
}

const HANDSHAKE = "review-log-inject"
const HANDSHAKE_EVENT = `${HANDSHAKE}-event`
const HANDSHAKE_NETWORK = `${HANDSHAKE}-network`
const HANDSHAKE_HIGHLIGHT = `${HANDSHAKE}-highlight`
const LISTENER_KEY = "__review_log_content_handle_message__"
const RUNTIME_LISTENER_KEY = "__review_log_content_runtime_listener__"

const w = window as unknown as Record<string, unknown>

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
    | InjectNetworkMessage
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

  if (data.source === HANDSHAKE_NETWORK) {
    if (
      !safeRuntimeSendMessage({
        type: "network:append",
        request: { ...data.payload, tabId: -1 }
      })
    ) {
      teardownContentBridge()
    }
  }
}

function postHighlightToPage(payload: DomHighlightPayload): void {
  try {
    window.postMessage({ source: HANDSHAKE_HIGHLIGHT, payload }, window.location.origin)
  } catch {
    /* ignore */
  }
}

function ensureRuntimeListener(): void {
  if (w[RUNTIME_LISTENER_KEY]) return
  w[RUNTIME_LISTENER_KEY] = true

  chrome.runtime.onMessage.addListener((raw) => {
    if (!isExtensionContextValid()) return false
    const msg = raw as { type?: string; payload?: DomHighlightPayload }
    if (msg?.type === "log:highlight-dom" && msg.payload) {
      postHighlightToPage(msg.payload)
    }
    return false
  })
}

ensureRuntimeListener()

const prev = w[LISTENER_KEY] as EventListener | undefined
if (prev) {
  window.removeEventListener("message", prev)
}
w[LISTENER_KEY] = handleMessage
window.addEventListener("message", handleMessage)
