// Background service worker. Receives log/action events from content scripts,
// tags them with tab id, assigns monotonic sequence numbers, maintains a ring
// buffer of recent entries per tab, and forwards to the side panel.
// Also supports receiving logs from mobile devices via HTTP/WebSocket server.

import type {
  LogEntry,
  PageActionEvent,
  RuntimeMessage
} from "./types"

import { saveLog, saveAction, deleteLogsByTabId } from "./utils/indexedDB"

const MAX_ENTRIES_PER_TAB = 2000

const seqByTab = new Map<number | string, number>()
const history = new Map<number | string, LogEntry[]>()
const actions = new Map<number | string, (PageActionEvent & { tabId?: number | string })[]>()

const MOBILE_PREFIX = 'mobile_'

function getMobileKey(deviceId: string): string {
  return MOBILE_PREFIX + deviceId
}

function isMobileKey(key: number | string): boolean {
  return typeof key === 'string' && key.startsWith(MOBILE_PREFIX)
}

function nextSeq(key: number | string): number {
  const n = (seqByTab.get(key) ?? 0) + 1
  seqByTab.set(key, n)
  return n
}

function appendLog(entry: LogEntry, key: number | string): LogEntry {
  const tagged: LogEntry = { ...entry, seq: nextSeq(key), tabId: typeof key === 'number' ? key : -1 }
  const list = history.get(key) ?? []
  list.push(tagged)
  if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB)
  history.set(key, list)
  return tagged
}

function appendAction(event: PageActionEvent & { tabId?: number | string }, key: number | string) {
  const list = actions.get(key) ?? []
  list.push({ ...event, tabId: typeof key === 'number' ? key : -1 })
  if (list.length > MAX_ENTRIES_PER_TAB) list.splice(0, list.length - MAX_ENTRIES_PER_TAB)
  actions.set(key, list)
  return event
}

function clearKey(key: number | string) {
  history.set(key, [])
  actions.set(key, [])
  seqByTab.set(key, 0)
}

function getAllKeys(): (number | string)[] {
  return Array.from(new Set([...history.keys(), ...actions.keys()]))
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

interface MobileLogEntry {
  type: string
  deviceId: string
  deviceType: string
  timestamp: number
  url: string
  userAgent: string
  payload: {
    level: LogEntry['level']
    args: LogEntry['args']
    text: string
    timestamp: number
    action?: string
    target?: string
  }
}

async function fetchMobileLogs(serverUrl: string): Promise<void> {
  try {
    const response = await fetch(`${serverUrl}/logs`)
    if (!response.ok) {
      console.warn('[ReviewLog] Failed to fetch mobile logs:', response.status)
      return
    }
    const data = await response.json()
    if (data.logs && Array.isArray(data.logs)) {
      for (const entry of data.logs as MobileLogEntry[]) {
        handleMobileEntry(entry)
      }
    }
  } catch (e) {
    console.warn('[ReviewLog] Error fetching mobile logs:', e)
  }
}

function handleMobileEntry(entry: MobileLogEntry) {
  const key = getMobileKey(entry.deviceId)
  if (entry.type === 'log') {
    const logEntry: LogEntry = {
      seq: 0,
      level: entry.payload.level,
      args: entry.payload.args,
      text: entry.payload.text,
      ts: entry.payload.timestamp,
      url: entry.url,
      tabId: -1
    }
    const tagged = appendLog(logEntry, key)
    broadcast({ type: 'log:append', entry: { ...tagged, tabId: key as unknown as number } })
  } else if (entry.type === 'action') {
    const actionEvent: PageActionEvent & { tabId?: number | string } = {
      type: 'user-event',
      action: entry.payload.action || 'unknown',
      target: entry.payload.target,
      ts: entry.payload.timestamp,
      url: entry.url,
      tabId: key
    }
    appendAction(actionEvent, key)
    broadcast({ type: 'action:append', event: { ...actionEvent, tabId: key as unknown as number } })
  }
}

let mobileServerUrl = ''
let pollingInterval: number | null = null

function startMobilePolling(url: string) {
  stopMobilePolling()
  mobileServerUrl = url
  fetchMobileLogs(url)
  pollingInterval = window.setInterval(() => {
    fetchMobileLogs(url)
  }, 2000)
}

function stopMobilePolling() {
  if (pollingInterval) {
    clearInterval(pollingInterval)
    pollingInterval = null
  }
}

const MESSAGE_LISTENER_INIT_FLAG = '__review_log_message_listener_initialized__'

// Prevent duplicate listener registration due to service worker restarts
if (!(self as unknown as Record<string, boolean>)[MESSAGE_LISTENER_INIT_FLAG]) {
  ;(self as unknown as Record<string, boolean>)[MESSAGE_LISTENER_INIT_FLAG] = true

  function handleMessage(raw: unknown, sender: chrome.runtime.MessageSender, _sendResponse: (response?: unknown) => void) {
    const msg = raw as RuntimeMessage

    if (msg.type === 'log:append') {
      const tabId = sender.tab?.id ?? -1
      const entry: LogEntry = { ...msg.entry, tabId }
      const tagged = appendLog(entry, tabId)
      void broadcast({ type: 'log:append', entry: tagged })
      // 保存到 IndexedDB
      void saveLog(tabId, entry)
      return false
    }

    if (msg.type === 'action:append') {
      const tabId = sender.tab?.id ?? msg.event.tabId ?? -1
      const event = { ...msg.event, tabId }
      appendAction(event, tabId)
      void broadcast({ type: 'action:append', event })
      // 保存到 IndexedDB
      void saveAction(tabId, event)
      return false
    }

    if (msg.type === 'log:clear') {
      clearKey(msg.tabId)
      // 从 IndexedDB 删除
      void deleteLogsByTabId(msg.tabId)
      return false
    }

    if (msg.type === 'log:request-history') {
      const tabId = msg.tabId
      const entries = history.get(tabId) ?? []
      const act = actions.get(tabId) ?? []
      try {
        chrome.runtime.sendMessage({
          type: 'log:request-history-response',
          entries,
          actions: act
        })
      } catch {
        /* no listeners */
      }
      return false
    }

    if (msg.type === 'log:open-panel') {
      void openSidePanelForActiveTab()
      return false
    }

    if (msg.type === 'log:ai-result' || msg.type === 'log:ai-error') {
      void broadcast(msg)
      return false
    }

    if (msg.type === 'mobile:connect') {
      const config = msg as { type: 'mobile:connect'; serverUrl: string }
      startMobilePolling(config.serverUrl)
      chrome.runtime.sendMessage({ type: 'mobile:connected', serverUrl: config.serverUrl })
      return false
    }

    if (msg.type === 'mobile:disconnect') {
      stopMobilePolling()
      chrome.runtime.sendMessage({ type: 'mobile:disconnected' })
      return false
    }

    if (msg.type === 'mobile:get-status') {
      try {
        chrome.runtime.sendMessage({
          type: 'mobile:status',
          connected: !!mobileServerUrl,
          serverUrl: mobileServerUrl
        })
      } catch {
        /* no listeners */
      }
      return false
    }

    if (msg.type === 'mobile:list-devices') {
      const mobileKeys = getAllKeys().filter(isMobileKey)
      try {
        chrome.runtime.sendMessage({
          type: 'mobile:devices',
          devices: mobileKeys.map(k => ({
            id: k.replace(MOBILE_PREFIX, ''),
            logCount: history.get(k)?.length ?? 0,
            actionCount: actions.get(k)?.length ?? 0
          }))
        })
      } catch {
        /* no listeners */
      }
      return false
    }

    return false
  }

  chrome.runtime.onMessage.addListener(handleMessage)
}

chrome.sidePanel?.setPanelBehavior({ openPanelOnActionClick: true }).catch(() => {
  /* API not available on older Chrome versions */
})

chrome.tabs.onRemoved.addListener((tabId) => {
  if (typeof tabId === 'number') {
    history.delete(tabId)
    actions.delete(tabId)
    seqByTab.delete(tabId)
    // 从 IndexedDB 删除
    void deleteLogsByTabId(tabId)
  }
})

chrome.runtime.onStartup.addListener(() => {
  const savedUrl = localStorage.getItem('review-log-mobile-server')
  if (savedUrl) {
    startMobilePolling(savedUrl)
  }
})
