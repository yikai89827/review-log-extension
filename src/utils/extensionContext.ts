/** True when this JS context can still talk to the extension background. */
export function isExtensionContextValid(): boolean {
  try {
    return typeof chrome !== "undefined" && !!chrome.runtime?.id
  } catch {
    return false
  }
}

/** Fire-and-forget runtime message; never throws or leaves unhandled rejections. */
export function safeRuntimeSendMessage(message: unknown): boolean {
  if (!isExtensionContextValid()) return false
  try {
    const result = chrome.runtime.sendMessage(message)
    if (result && typeof (result as Promise<unknown>).catch === "function") {
      void (result as Promise<unknown>).catch(() => {})
    }
    return true
  } catch {
    return false
  }
}
