// Background service worker: receives log/action from content scripts,
// tags with tab id, keeps ring buffer, forwards to side panel.

import type { LogEntry, NetworkRequestEvent, PageActionEvent, RuntimeMessage } from "./types"

import { saveLog, saveAction, deleteLogsByTabId } from "./utils/indexedDB"

const MAX_ENTRIES_PER_TAB = 2000
const MAX_SEEN_EVENT_IDS = 5000

const seqByTab = new Map<number, number>()
const history = new Map<number, LogEntry[]>()
const actions = new Map<number, (PageActionEvent & { tabId?: number })[]>()
const networks = new Map<number, (NetworkRequestEvent & { tabId?: number })[]>()
const seenEventIds = new Set<string>()

function rememberEventId(eventId: string | undefined): boolean {
  if (!eventId) return false
  if (seenEventIds.has(eventId)) return true
  seenEventIds.add(eventId)
  if (seenEventIds.size > MAX_SEEN_EVENT_IDS) {
    const oldest = seenEventIds.values().next().value
    if (oldest) seenEventIds.delete(oldest)
  }
  return false
}

function nextSeq(tabId: number): number {
  const n = (seqByTab.get(tabId) ?? 0) + 1
  seqByTab.set(tabId, n)
  return n
}

function appendLog(entry: LogEntry, tabId: number): LogEntry {
  const tagged: LogEntry = { ...entry, seq: nextSeq(tabId), tabId }
  const list = history.get(tabId) ?? []
  list.push(tagged)
  if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB)
  history.set(tabId, list)
  return tagged
}

function appendAction(event: PageActionEvent & { tabId?: number }, tabId: number) {
  const list = actions.get(tabId) ?? []
  list.push({ ...event, tabId })
  if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB)
  actions.set(tabId, list)
}

function appendNetwork(request: NetworkRequestEvent & { tabId?: number }, tabId: number) {
  const list = networks.get(tabId) ?? []
  list.push({ ...request, tabId })
  if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB)
  networks.set(tabId, list)
}

function clearKey(tabId: number) {
  history.set(tabId, [])
  actions.set(tabId, [])
  networks.set(tabId, [])
  seqByTab.set(tabId, 0)
}

async function broadcast(msg: RuntimeMessage) {
  try {
    await chrome.runtime.sendMessage(msg)
  } catch {
    /* no listeners */
  }
}

async function openSidePanelForActiveTab() {
  if (!chrome.sidePanel) return
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true })
  if (tab?.id) {
    await chrome.sidePanel.open({ tabId: tab.id })
  } else {
    await chrome.sidePanel.open({})
  }
}

const MESSAGE_LISTENER_INIT_FLAG = "__review_log_message_listener_initialized__"

if (!(self as unknown as Record<string, boolean>)[MESSAGE_LISTENER_INIT_FLAG]) {
  ;(self as unknown as Record<string, boolean>)[MESSAGE_LISTENER_INIT_FLAG] = true

  chrome.runtime.onMessage.addListener((raw, sender) => {
    const msg = raw as RuntimeMessage

    if (msg.type === "log:append") {
      const tabId = sender.tab?.id ?? -1
      if (tabId < 0) return false
      if (rememberEventId(msg.entry.eventId)) return false
      const entry: LogEntry = { ...msg.entry, tabId }
      const tagged = appendLog(entry, tabId)
      void broadcast({ type: "log:append", entry: tagged })
      void saveLog(tabId, entry)
      return false
    }

    if (msg.type === "action:append") {
      const tabId = sender.tab?.id ?? msg.event.tabId ?? -1
      if (typeof tabId !== "number" || tabId < 0) return false
      if (rememberEventId(msg.event.eventId)) return false
      const event = { ...msg.event, tabId }
      appendAction(event, tabId)
      void broadcast({ type: "action:append", event })
      void saveAction(tabId, event)
      return false
    }

    if (msg.type === "network:append") {
      const tabId = sender.tab?.id ?? msg.request.tabId ?? -1
      if (typeof tabId !== "number" || tabId < 0) return false
      if (rememberEventId(msg.request.eventId)) return false
      const request = { ...msg.request, tabId }
      appendNetwork(request, tabId)
      void broadcast({ type: "network:append", request })
      return false
    }

    if (msg.type === "log:highlight-dom") {
      const tabId = msg.tabId
      chrome.tabs.sendMessage(tabId, msg).catch(() => {
        /* tab may not have content script */
      })
      return false
    }

    if (msg.type === "log:clear") {
      clearKey(msg.tabId as number)
      void deleteLogsByTabId(msg.tabId)
      return false
    }

    if (msg.type === "log:request-history") {
      const tabId = msg.tabId as number
      const entries = history.get(tabId) ?? []
      const act = actions.get(tabId) ?? []
      const net = networks.get(tabId) ?? []
      try {
        chrome.runtime.sendMessage({
          type: "log:request-history-response",
          entries,
          actions: act,
          networks: net
        })
      } catch {
        /* no listeners */
      }
      return false
    }

    if (msg.type === "log:open-panel") {
      void openSidePanelForActiveTab()
      return false
    }

    if (msg.type === "log:ai-result" || msg.type === "log:ai-error") {
      void broadcast(msg)
      return false
    }

    return false
  })
}

chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  /* older Chrome */
})

chrome.tabs.onRemoved.addListener((tabId) => {
  history.delete(tabId)
  actions.delete(tabId)
  networks.delete(tabId)
  seqByTab.delete(tabId)
  void deleteLogsByTabId(tabId)
})
