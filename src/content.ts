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

  chrome.runtime.onMessage.addListener((raw, sender, sendResponse) => {
    if (!isExtensionContextValid()) return false
    const msg = raw as { type?: string; payload?: DomHighlightPayload }
    
    if (msg?.type === "log:highlight-dom" && msg.payload) {
      postHighlightToPage(msg.payload)
    }
    
    // 获取 DOM 结构信息
    if (msg?.type === "GET_DOM_INFO") {
      const domInfo = getDomInfo()
      sendResponse({ domInfo })
      return true // 表示异步响应
    }
    
    // 获取 JS 文件列表
    if (msg?.type === "GET_JS_FILES") {
      const jsFiles = getJsFiles()
      sendResponse({ jsFiles })
      return true // 表示异步响应
    }
    
    return false
  })
}

// 获取 DOM 结构信息
function getDomInfo(): string {
  try {
    const body = document.body
    if (!body) return "无法获取 DOM 结构"
    
    // 获取页面标题
    const title = document.title || "无标题"
    
    // 获取脚本数量
    const scripts = document.querySelectorAll('script')
    const scriptCount = scripts.length
    
    // 获取链接数量
    const links = document.querySelectorAll('link')
    const linkCount = links.length
    
    // 获取图片数量
    const images = document.querySelectorAll('img')
    const imageCount = images.length
    
    // 获取表单数量
    const forms = document.querySelectorAll('form')
    const formCount = forms.length
    
    // 获取主要的 HTML 结构
    function getElementStructure(el: Element, depth: number = 0): string {
      if (depth > 3) return "" // 限制深度
      
      const tagName = el.tagName.toLowerCase()
      const id = el.id ? `#${el.id}` : ""
      // className 可能是 SVGAnimatedString，需要转为字符串
      const className = el.className ? String(el.className).replace(/\s+/g, ".") : ""
      const classAttr = className ? `.${className}` : ""
      const children = Array.from(el.children).slice(0, 5) // 只取前5个子元素
      
      let result = `${"  ".repeat(depth)}<${tagName}${id}${classAttr}>`
      if (children.length > 0) {
        result += "\n" + children.map(child => getElementStructure(child, depth + 1)).join("\n")
      }
      return result
    }
    
    const structure = getElementStructure(body, 0)
    
    return `页面标题: ${title}

页面统计:
- 脚本数量: ${scriptCount}
- 样式链接: ${linkCount}
- 图片数量: ${imageCount}
- 表单数量: ${formCount}

DOM 结构概览:
${structure}`
    
  } catch (e) {
    return `获取 DOM 信息失败: ${e instanceof Error ? e.message : String(e)}`
  }
}

// 获取加载的 JS 文件列表
function getJsFiles(): string {
  try {
    const scripts = document.querySelectorAll('script[src]')
    const jsFiles = Array.from(scripts).map((script, index) => {
      const src = (script as HTMLScriptElement).src
      const async = script.hasAttribute('async') ? '[async]' : ''
      const defer = script.hasAttribute('defer') ? '[defer]' : ''
      return `${index + 1}. ${async}${defer} ${src}`
    })
    
    if (jsFiles.length === 0) {
      return "页面中没有外部 JS 文件"
    }
    
    return jsFiles.join("\n")
    
  } catch (e) {
    return `获取 JS 文件列表失败: ${e instanceof Error ? e.message : String(e)}`
  }
}

ensureRuntimeListener()

const prev = w[LISTENER_KEY] as EventListener | undefined
if (prev) {
  window.removeEventListener("message", prev)
}
w[LISTENER_KEY] = handleMessage
window.addEventListener("message", handleMessage)
