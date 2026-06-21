import type { DomHighlightPayload } from "../types"

export async function highlightDomInActiveTab(payload: DomHighlightPayload): Promise<void> {
  const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
  const tabId = tabs[0]?.id
  if (!tabId) return

  try {
    await chrome.runtime.sendMessage({
      type: "log:highlight-dom",
      tabId,
      payload
    })
  } catch {
    /* ignore */
  }
}
