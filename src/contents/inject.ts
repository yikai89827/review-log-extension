// MAIN world script. Runs in the page's own JS context, so it can override
// console.* and observe user actions directly. It then postMessage()s a
// serialized payload to the content script, which is responsible for
// forwarding the data into the extension world.

import type { PlasmoCSConfig } from "plasmo"

import type {
  DomHighlightPayload,
  DomNode,
  InjectEventMessage,
  InjectNetworkMessage,
  InjectToContentMessage,
  LogEntry,
  LogLevel,
  NetworkRequestEvent,
  PageActionEvent,
  SerializedArg
} from "../types"

export const config: PlasmoCSConfig = {
  matches: ["<all_urls>"],
  world: "MAIN"
}

const HANDSHAKE = "review-log-inject"
const HANDSHAKE_EVENT = `${HANDSHAKE}-event`
const HANDSHAKE_NETWORK = `${HANDSHAKE}-network`
const HANDSHAKE_HIGHLIGHT = `${HANDSHAKE}-highlight`
const WINDOW_INIT_FLAG = "__review_log_main_injected__"
const WRAPPED_FLAG = "__review_log_wrapped__"

let eventCounter = 0
function nextEventId(): string {
  eventCounter += 1
  return `${Date.now()}-${eventCounter}`
}

const consoleObj = window.console as unknown as Record<string, unknown>
const isAlreadyInjected =
  (window as unknown as Record<string, boolean>)[WINDOW_INIT_FLAG] ||
  !!consoleObj[WRAPPED_FLAG]

if (isAlreadyInjected) {
  // Already injected, do nothing
} else {
  // Set flag immediately to prevent race conditions
  ;(window as unknown as Record<string, boolean>)[WINDOW_INIT_FLAG] = true

  // Store original console methods BEFORE wrapping
  const originalConsoleMethods: Record<string, (...args: unknown[]) => void> = {}
  const levels: LogLevel[] = ["log", "info", "warn", "error", "debug"]
  for (const level of levels) {
    originalConsoleMethods[level] = window.console[level].bind(window.console)
  }

  let isPostingLog = false

  function safeStringify(value: unknown): string {
    try {
      if (typeof value === "string") return value
      if (typeof value === "number" || typeof value === "boolean") return String(value)
      if (value === null) return "null"
      if (value === undefined) return "undefined"
      if (typeof value === "bigint") return value.toString() + "n"
      if (typeof value === "symbol") return value.toString()
      if (typeof value === "function") return `[Function ${value.name || "anonymous"}]`
      if (value instanceof Error) {
        return `${value.name}: ${value.message}\n${value.stack || ""}`
      }
      return JSON.stringify(value, (_k, v) => {
        if (typeof v === "bigint") return v.toString() + "n"
        if (typeof v === "function") return `[Function ${v.name || "anonymous"}]`
        if (typeof v === "undefined") return "[undefined]"
        if (v instanceof Error) {
          return { name: v.name, message: v.message, stack: v.stack }
        }
        return v
      })
    } catch {
      try {
        return String(value)
      } catch {
        return "[Unserializable]"
      }
    }
  }

  function serializeDomNode(node: Node, depth: number = 0, maxDepth: number = 5): DomNode | null {
    if (depth >= maxDepth) return null
    
    const domNode: DomNode = {
      tagName: "",
      id: "",
      className: "",
      attributes: {},
      textContent: "",
      children: [],
      nodeType: node.nodeType,
      nodeName: node.nodeName
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const el = node as Element
      domNode.tagName = el.tagName.toLowerCase()
      domNode.id = el.id
      domNode.className = el.className instanceof SVGAnimatedString ? el.className.baseVal : (el.className as string || "")
      
      for (let i = 0; i < el.attributes.length; i++) {
        const attr = el.attributes[i]
        domNode.attributes[attr.name] = attr.value
      }

      if (el.textContent && el.textContent.trim().length > 0 && el.childNodes.length === 1) {
        domNode.textContent = el.textContent.trim().slice(0, 100)
      }

      for (let i = 0; i < el.childNodes.length; i++) {
        const child = serializeDomNode(el.childNodes[i], depth + 1, maxDepth)
        if (child) {
          domNode.children.push(child)
        }
      }
    } else if (node.nodeType === Node.TEXT_NODE) {
      const text = node.textContent?.trim() || ""
      if (text.length > 0) {
        domNode.textContent = text.slice(0, 100)
      }
    } else if (node.nodeType === Node.COMMENT_NODE) {
      domNode.textContent = "<!-- " + (node.textContent?.slice(0, 50) || "") + "-->"
    }

    return domNode
  }

  function serializeArg(value: unknown, seen: Set<object> = new Set()): SerializedArg {
    if (value === null) return { kind: "null" }
    if (value === undefined) return { kind: "undefined" }
    const t = typeof value
    if (t === "string") return { kind: "string", value: value as string }
    if (t === "number") return { kind: "number", value: value as number }
    if (t === "boolean") return { kind: "boolean", value: value as boolean }
    if (t === "bigint") return { kind: "bigint", value: (value as bigint).toString() }
    if (t === "symbol") return { kind: "symbol", value: (value as symbol).toString() }
    if (t === "function") return { kind: "function", value: (value as { name?: string }).name || "anonymous" }
    if (value instanceof Error) {
      return { kind: "error", name: value.name, message: value.message, stack: value.stack }
    }
    if (value instanceof Date) return { kind: "string", value: value.toISOString() }
    if (value instanceof RegExp) return { kind: "string", value: value.toString() }
    
    if (typeof value === "object" && value !== null) {
      const node = value as Node
      if ('nodeType' in node && typeof node.nodeType === 'number') {
        const domNode = serializeDomNode(node)
        if (domNode) {
          return { kind: "dom", value: domNode }
        }
      }
    }
    
    if (value instanceof Map) {
      const obj: Record<string, SerializedArg> = {}
      for (const [k, v] of (value as Map<unknown, unknown>).entries()) {
        obj[safeStringify(k)] = serializeArg(v, seen)
      }
      return { kind: "object", value: obj }
    }
    if (value instanceof Set) {
      const arr: SerializedArg[] = []
      for (const v of (value as Set<unknown>).values()) arr.push(serializeArg(v, seen))
      return { kind: "object", value: arr }
    }
    if (typeof value === "object") {
      if (seen.has(value as object)) return { kind: "string", value: "[Circular]" }
      seen.add(value as object)
      if (Array.isArray(value)) {
        return { kind: "object", value: (value as unknown[]).map((v) => serializeArg(v, seen)) }
      }
      const obj: Record<string, SerializedArg> = {}
      for (const k of Object.keys(value as Record<string, unknown>)) {
        try {
          obj[k] = serializeArg((value as Record<string, unknown>)[k], seen)
        } catch {
          obj[k] = { kind: "string", value: "[Unreadable]" }
        }
      }
      return { kind: "object", value: obj }
    }
    return { kind: "string", value: safeStringify(value) }
  }

  function makeEntry(level: LogLevel, args: unknown[]): LogEntry {
    const serialized = args.map((a) => serializeArg(a))
    const text = args.map((a) => safeStringify(a)).join(" ")
    return {
      eventId: nextEventId(),
      seq: 0,
      level,
      args: serialized,
      text,
      ts: Date.now(),
      url: location.href
    }
  }

  function postLog(level: LogLevel, args: unknown[]) {
    if (isPostingLog) return
    
    isPostingLog = true
    try {
      const entry = makeEntry(level, args)
      const msg: InjectToContentMessage = { source: HANDSHAKE, payload: entry }
      try {
        window.postMessage(msg, window.location.origin)
      } catch {
        // postMessage with structured clone may fail on detached windows; ignore.
      }
    } finally {
      isPostingLog = false
    }
  }

  function postInputLog(t: HTMLInputElement | HTMLTextAreaElement) {
    const inputKey = describeTarget(t) || t.tagName.toLowerCase()
    const label = t.placeholder || t.name || t.id || "input"
    const text = `[${label}]: ${t.value}`
    const entry: LogEntry = {
      ...makeEntry("log", [text]),
      inputKey
    }
    const msg: InjectToContentMessage = { source: HANDSHAKE, payload: entry }
    try {
      window.postMessage(msg, window.location.origin)
    } catch {
      /* ignore */
    }
  }

  function postNetwork(request: Omit<NetworkRequestEvent, "eventId" | "ts"> & { ts?: number }) {
    const payload: NetworkRequestEvent = {
      eventId: nextEventId(),
      method: request.method,
      url: request.url,
      status: request.status,
      duration: request.duration,
      ts: request.ts ?? Date.now()
    }
    const msg: InjectNetworkMessage = { source: HANDSHAKE_NETWORK, payload }
    try {
      window.postMessage(msg, window.location.origin)
    } catch {
      /* ignore */
    }
  }

  let lastInteractionTarget: string | undefined

  function findElementByDescribeTarget(desc: string): Element | null {
    const idMatch = desc.match(/^(\w+)(#[\w-]+)/)
    if (idMatch) {
      const el = document.querySelector(`${idMatch[1]}${idMatch[2]}`)
      if (el) return el
    }

    const textMatch = desc.match(/^(\w+)\s+"([^"]+)/)
    if (textMatch) {
      const [, tag, textPrefix] = textMatch
      for (const el of document.querySelectorAll(tag)) {
        const txt = el.textContent?.trim() ?? ""
        if (txt.startsWith(textPrefix.replace(/\.\.\.$/, ""))) return el
      }
    }

    const clsMatch = desc.match(/^(\w+)(\.[\w.-]+)/)
    if (clsMatch) {
      const el = document.querySelector(`${clsMatch[1]}${clsMatch[2]}`)
      if (el) return el
    }

    return null
  }

  function flashElement(el: Element): boolean {
    const htmlEl = el as HTMLElement
    htmlEl.scrollIntoView({ block: "center", behavior: "smooth" })
    const prevOutline = htmlEl.style.outline
    const prevOffset = htmlEl.style.outlineOffset
    htmlEl.style.outline = "3px solid #6366f1"
    htmlEl.style.outlineOffset = "2px"
    setTimeout(() => {
      htmlEl.style.outline = prevOutline
      htmlEl.style.outlineOffset = prevOffset
    }, 2500)
    try {
      // DevTools-only in page console; no-op in extension context but harmless
      ;(window as unknown as { inspect?: (n: Element) => void }).inspect?.(el)
    } catch {
      /* ignore */
    }
    return true
  }

  function highlightDom(payload: DomHighlightPayload): boolean {
    if (payload.selector) {
      const el = findElementByDescribeTarget(payload.selector)
      if (el) return flashElement(el)
    }

    if (payload.tagHint) {
      const candidates = document.querySelectorAll(payload.tagHint)
      if (candidates.length === 1) return flashElement(candidates[0])
      if (payload.tagHint === "button") {
        const withOnclick = document.querySelectorAll("button[onclick], [onclick]")
        if (withOnclick.length === 1) return flashElement(withOnclick[0])
      }
    }

    if (lastInteractionTarget) {
      const el = findElementByDescribeTarget(lastInteractionTarget)
      if (el) return flashElement(el)
    }

    return false
  }

  function captureNetwork() {
    const origFetch = window.fetch.bind(window)
    window.fetch = async function (...args: Parameters<typeof fetch>) {
      const start = Date.now()
      const input = args[0]
      const init = args[1]
      const url =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.href
            : input.url
      const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase()
      try {
        const res = await origFetch(...args)
        postNetwork({ method, url, status: res.status, duration: Date.now() - start })
        return res
      } catch (err) {
        postNetwork({ method, url, status: 0, duration: Date.now() - start })
        throw err
      }
    }

    const XHR = XMLHttpRequest.prototype
    const origOpen = XHR.open
    const origSend = XHR.send
    XHR.open = function (method: string, url: string | URL, ...rest: unknown[]) {
      ;(this as unknown as { __rlMethod: string }).__rlMethod = method.toUpperCase()
      ;(this as unknown as { __rlUrl: string }).__rlUrl = String(url)
      return origOpen.call(this, method, url, ...(rest as [boolean?, string?, string?]))
    }
    XHR.send = function (...sendArgs: unknown[]) {
      const start = Date.now()
      const xhr = this as XMLHttpRequest & { __rlMethod?: string; __rlUrl?: string }
      xhr.addEventListener("loadend", () => {
        postNetwork({
          method: xhr.__rlMethod ?? "GET",
          url: xhr.__rlUrl ?? "",
          status: xhr.status || 0,
          duration: Date.now() - start
        })
      })
      return origSend.apply(this, sendArgs as [Document | XMLHttpRequestBodyInit | null | undefined])
    }
  }

  captureNetwork()

  // Check if console has already been wrapped
  if (!consoleObj[WRAPPED_FLAG]) {
    consoleObj[WRAPPED_FLAG] = true
    
    for (const level of levels) {
      const originalFn = originalConsoleMethods[level].bind(window.console)
      consoleObj[level] = function(this: unknown, ...args: unknown[]) {
        postLog(level, args)
        // Call original console method
        if (typeof originalFn === "function") {
          originalFn.apply(this, args)
        }
      }
    }
  }

  let isHandlingError = false
  window.addEventListener("error", (e) => {
    if (isHandlingError || isPostingLog) return
    isHandlingError = true
    try {
      postLog("error", [e.message || "Uncaught error", e.error || ""])
    } finally {
      isHandlingError = false
    }
  })
  
  window.addEventListener("unhandledrejection", (e) => {
    if (isHandlingError || isPostingLog) return
    isHandlingError = true
    try {
      const reason = (e as PromiseRejectionEvent).reason
      postLog("error", ["Unhandled promise rejection", reason])
    } finally {
      isHandlingError = false
    }
  })

  function postAction(action: string, target?: string) {
    const payload: PageActionEvent = {
      type: "user-event",
      action,
      target,
      eventId: nextEventId(),
      ts: Date.now(),
      url: location.href
    }
    const msg: InjectEventMessage = { source: `${HANDSHAKE}-event`, payload }
    try {
      window.postMessage(msg, window.location.origin)
    } catch {
      /* ignore */
    }
  }

  function describeTarget(el: EventTarget | null): string | undefined {
    if (!(el instanceof Element)) return undefined
    
    const tagName = el.tagName.toLowerCase()
    const id = el.id ? `#${el.id}` : ""
    
    let cls = ""
    if (el.className && typeof el.className === "string") {
      const classList = el.className.trim().split(/\s+/).slice(0, 3)
      cls = classList.length > 0 ? `.${classList.join(".")}` : ""
    }
    
    const label = el.getAttribute('aria-label') || el.getAttribute('label')
    
    let textContent = ""
    if (el.textContent && el.textContent.trim().length > 0) {
      textContent = `"${el.textContent.trim().slice(0, 30)}${el.textContent.trim().length > 30 ? "..." : "\""}`
    }
    
    const type = (el as HTMLInputElement).type ? ` type="${(el as HTMLInputElement).type}"` : ""
    const name = el.getAttribute('name') ? ` name="${el.getAttribute('name')}"` : ""
    
    let selector = `${tagName}${id}${cls}`
    
    if (label) {
      selector += ` aria-label="${label}"`
    } else if (textContent) {
      selector += ` ${textContent}`
    }
    
    return selector
  }

  function hasEventListeners(el: Element, eventType: string): boolean {
    if (!el) return false
    
    const eventAttrMap: Record<string, string[]> = {
      'click': ['onclick'],
      'input': ['oninput'],
      'submit': ['onsubmit'],
      'keydown': ['onkeydown'],
      'keyup': ['onkeyup'],
      'keypress': ['onkeypress']
    }

    const attrsToCheck = eventAttrMap[eventType] || []
    for (const attr of attrsToCheck) {
      if (el.hasAttribute(attr)) {
        const attrValue = el.getAttribute(attr)
        if (attrValue && attrValue.trim()) {
          return true
        }
      }
    }

    const tagName = el.tagName.toLowerCase()
    const interactiveTags = ['button', 'a', 'input', 'textarea', 'select', 'form', 'label']
    if (interactiveTags.includes(tagName)) {
      return true
    }

    if (el.closest('a[href]') || el.closest('button') || el.closest('form')) {
      return true
    }

    const computedStyle = window.getComputedStyle(el)
    if (computedStyle.cursor === 'pointer') {
      return true
    }

    return false
  }

  const EVENT_LISTENER_FLAG = "__review_log_event_listeners_added__"
  const INPUT_ACTION_TRACKER = "__review_log_input_tracker__"
  
  if (!((window as unknown as Record<string, boolean>)[EVENT_LISTENER_FLAG])) {
    ;(window as unknown as Record<string, boolean>)[EVENT_LISTENER_FLAG] = true

    // Track which input elements have already logged an action
    const inputActionSent = new WeakSet<HTMLInputElement | HTMLTextAreaElement>()

    document.addEventListener(
      "click",
      (e) => {
        const t = e.target
        if (!(t instanceof Element)) return

        // input/textarea 已有 input 动作与值日志，默认不记录 click
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
          return
        }
        
        if (!hasEventListeners(t, 'click')) {
          return
        }
        
        postAction("click", describeTarget(t))
        lastInteractionTarget = describeTarget(t)
      },
      true
    )

    document.addEventListener(
      "input",
      (e) => {
        const t = e.target
        if (!(t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement)) return
        
        // Only send action once per input element focus session
        if (!inputActionSent.has(t)) {
          inputActionSent.add(t)
          const target = describeTarget(t)
          postAction("input", target)
          lastInteractionTarget = target
        }

        postInputLog(t)
      },
      true
    )

    // Clear tracker on blur so next focus creates a new action
    document.addEventListener(
      "blur",
      (e) => {
        const t = e.target
        if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement) {
          inputActionSent.delete(t)
        }
      },
      true
    )

    document.addEventListener(
      "submit",
      (e) => {
        const t = e.target
        if (!(t instanceof Element)) return
        postAction("submit", describeTarget(t))
      },
      true
    )

    document.addEventListener(
      "keydown",
      (e) => {
        if (e.key === "Enter" || e.key === "Escape" || e.key === "Tab") {
          const t = e.target
          if (t instanceof Element) {
            postAction(`keydown:${e.key}`, describeTarget(t))
          }
        }
      },
      true
    )

  }

  window.addEventListener("message", (event) => {
    if (event.source !== window) return
    const data = event.data as { source?: string; payload?: DomHighlightPayload } | undefined
    if (data?.source === HANDSHAKE_HIGHLIGHT && data.payload) {
      highlightDom(data.payload)
    }
  })

  window.postMessage({ source: `${HANDSHAKE}-ready` }, window.location.origin)
}
