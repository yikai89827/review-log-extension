import { useState, useEffect, useCallback, useMemo, useRef } from "react"

import {
  buildJsonExport,
  buildTranscript,
  findRelatedNetwork,
  pushAction,
  pushLog,
  pushNetwork,
  resetLogDedupe,
  rowCopyText,
  rowMatchesSearch,
  type DisplayRow
} from "../utils/logDedupe"
import { analyzeLogs, loadConfig, saveConfig } from "../utils/ai"
import type { AiConfig } from "../types"
import { safeRuntimeSendMessage } from "../utils/extensionContext"
import { copyText, downloadText } from "../utils/clipboard"
import { highlightDomInActiveTab } from "../utils/domInspect"
import type { RuntimeMessage } from "../types"
import LogRow from "./components/LogRow"
import ActionRow from "./components/ActionRow"
import NetworkRow from "./components/NetworkRow"
import SettingsPanel from "./components/SettingsPanel"
import AnalysisPanel from "./components/AnalysisPanel"
import ContextMenu from "./components/ContextMenu"
import { setSidepanelMessageHandler } from "./messageHub"

import "./components/ContextMenu.css"
import "./style.css"

type FilterType = "all" | "log" | "info" | "warn" | "error" | "action" | "network"
type ThemeType = "dark" | "light"

interface ContextMenuState {
  x: number
  y: number
  row?: DisplayRow
}

function findRelatedSelector(rows: DisplayRow[], beforeTs: number, tabId?: number): string | undefined {
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i]
    if (r.kind !== "action" || !r.target) continue
    if (tabId != null && r.tabId !== tabId) continue
    if (r.ts <= beforeTs) return r.target
  }
  return undefined
}

function rowTabId(tabId?: number | string): number | undefined {
  if (tabId == null) return undefined
  return typeof tabId === "number" ? tabId : Number(tabId)
}

function belongsToTab(entryTabId: number | string | undefined, activeTabId: number | null): boolean {
  if (activeTabId == null) return false
  return rowTabId(entryTabId) === activeTabId
}

export default function App() {
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [filter, setFilter] = useState<FilterType>("all")
  const [searchQuery, setSearchQuery] = useState("")
  const [autoScroll, setAutoScroll] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<{ analysis: string; fix: string } | null>(null)
  const [theme, setTheme] = useState<ThemeType>("dark")
  const [copyToast, setCopyToast] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  const activeTabIdRef = useRef<number | null>(null)

  const [aiConfig, setAiConfig] = useState<AiConfig>(loadConfig())

  useEffect(() => {
    saveConfig(aiConfig)
  }, [aiConfig])

  const showToast = useCallback((msg: string) => {
    setCopyToast(msg)
    setTimeout(() => setCopyToast(null), 1600)
  }, [])

  const handleMessage = useCallback((msg: RuntimeMessage) => {
    const activeTabId = activeTabIdRef.current

    if (msg.type === "log:append") {
      if (!belongsToTab(msg.entry.tabId, activeTabId)) return
      setRows((prev) => pushLog(prev, msg.entry))
    } else if (msg.type === "action:append") {
      if (!belongsToTab(msg.event.tabId, activeTabId)) return
      setRows((prev) => pushAction(prev, msg.event))
    } else if (msg.type === "network:append") {
      if (!belongsToTab(msg.request.tabId, activeTabId)) return
      setRows((prev) => pushNetwork(prev, msg.request))
    } else if (msg.type === "log:request-history-response") {
      if (!belongsToTab(msg.tabId, activeTabId)) return
      resetLogDedupe()
      let next: DisplayRow[] = []
      for (const e of msg.entries) next = pushLog(next, e)
      for (const a of msg.actions) next = pushAction(next, a)
      for (const n of msg.networks ?? []) next = pushNetwork(next, n)
      setRows(next)
    }
  }, [])

  const clearActive = useCallback(async () => {
    resetLogDedupe()
    setRows([])
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
    const tabId = tabs[0]?.id ?? -1
    safeRuntimeSendMessage({ type: "log:clear", tabId })
  }, [])

  useEffect(() => {
    if (autoScroll) {
      setTimeout(() => {
        const el = document.getElementById("log-scroll")
        if (el) el.scrollTop = el.scrollHeight
      }, 0)
    }
  }, [rows, autoScroll, searchQuery, filter])

  const filteredRows = useMemo(() => {
    let list = rows
    if (filter === "action") list = list.filter((r) => r.kind === "action")
    else if (filter === "network") list = list.filter((r) => r.kind === "network")
    else if (filter !== "all") list = list.filter((r) => r.kind === "log" && r.level === filter)
    if (searchQuery.trim()) list = list.filter((r) => rowMatchesSearch(r, searchQuery))
    return list
  }, [rows, filter, searchQuery])

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const timeA = a.kind === "log" ? a.lastTs : a.ts
      const timeB = b.kind === "log" ? b.lastTs : b.ts
      return timeA - timeB
    })
  }, [filteredRows])

  const visibleCounts = useMemo(() => {
    const counts = { log: 0, info: 0, warn: 0, error: 0, debug: 0, action: 0, network: 0 }
    for (const r of rows) {
      if (r.kind === "action") counts.action += 1
      else if (r.kind === "network") counts.network += 1
      else if (r.kind === "log") counts[r.level] = (counts[r.level] ?? 0) + 1
    }
    return counts
  }, [rows])

  const copyRow = useCallback(
    async (row: DisplayRow) => {
      const ok = await copyText(rowCopyText(row))
      showToast(ok ? "已复制本条日志" : "复制失败")
    },
    [showToast]
  )

  const copyAllVisible = useCallback(async () => {
    const ok = await copyText(buildTranscript(sortedRows))
    showToast(ok ? `已复制 ${sortedRows.length} 条记录` : "复制失败")
  }, [sortedRows, showToast])

  const exportLogs = useCallback(() => {
    const stamp = new Date().toISOString().replace(/[:.]/g, "-")
    downloadText(`review-log-${stamp}.txt`, buildTranscript(rows))
    downloadText(`review-log-${stamp}.json`, buildJsonExport(rows))
    showToast("已导出 txt + json")
  }, [rows, showToast])

  const openRowContextMenu = useCallback((e: React.MouseEvent, row?: DisplayRow) => {
    e.preventDefault()
    e.stopPropagation()
    setContextMenu({ x: e.clientX, y: e.clientY, row })
  }, [])

  const runAnalysis = useCallback(async () => {
    if (analyzing) return
    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisOpen(true)
    setAnalysis(null)

    try {
      const transcript = buildTranscript(sortedRows)
      if (!transcript.trim()) throw new Error("当前没有可分析的事件流。")
      const result = await analyzeLogs(aiConfig, transcript)
      setAnalysis(result)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzing(false)
    }
  }, [analyzing, sortedRows, aiConfig])

  useEffect(() => {
    setSidepanelMessageHandler(handleMessage)

    const loadTabHistory = async () => {
      const tabs = await chrome.tabs.query({ active: true, currentWindow: true })
      const activeTab = tabs[0]
      if (activeTab?.id != null) {
        activeTabIdRef.current = activeTab.id
        resetLogDedupe()
        setRows([])
        safeRuntimeSendMessage({ type: "log:request-history", tabId: activeTab.id })
      }
    }

    void loadTabHistory()
    const onTabActivated = () => void loadTabHistory()
    const onTabUpdated = (tabId: number, info: chrome.tabs.TabChangeInfo) => {
      if (info.status === "complete") {
        chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
          if (tabs[0]?.id === tabId) void loadTabHistory()
        })
      }
    }

    chrome.tabs.onActivated.addListener(onTabActivated)
    chrome.tabs.onUpdated.addListener(onTabUpdated)
    return () => {
      chrome.tabs.onActivated.removeListener(onTabActivated)
      chrome.tabs.onUpdated.removeListener(onTabUpdated)
    }
  }, [handleMessage])

  return (
    <div className={`app-shell ${theme}`}>
      <header className="app-header">
        <input
          className="search-input"
          type="search"
          placeholder="搜索日志…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
        <div className="header-actions">
          <button className="icon-btn" title="导出日志" onClick={exportLogs}>⤓</button>
          <button
            className="icon-btn"
            aria-pressed={autoScroll}
            title="自动滚动到底部"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? "⇣" : "⇡"}
          </button>
          <button className="icon-btn" title="清空" onClick={clearActive}>⌫</button>
          <button className="icon-btn" title="主题切换" onClick={() => setTheme((t) => (t === "dark" ? "light" : "dark"))}>
            {theme === "dark" ? "☀" : "☽"}
          </button>
          <button className="icon-btn" title="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <div className="filter-bar">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>All</button>
        <button className={filter === "log" ? "active" : ""} onClick={() => setFilter("log")}>
          log <span className="count">{visibleCounts.log}</span>
        </button>
        <button className={filter === "info" ? "active" : ""} onClick={() => setFilter("info")}>
          info <span className="count">{visibleCounts.info}</span>
        </button>
        <button className={filter === "warn" ? "active" : ""} onClick={() => setFilter("warn")}>
          warn <span className="count">{visibleCounts.warn}</span>
        </button>
        <button className={filter === "error" ? "active" : ""} onClick={() => setFilter("error")}>
          error <span className="count">{visibleCounts.error}</span>
        </button>
        <button className={filter === "action" ? "active" : ""} onClick={() => setFilter("action")}>
          Action <span className="count">{visibleCounts.action}</span>
        </button>
        <button className={filter === "network" ? "active" : ""} onClick={() => setFilter("network")}>
          net <span className="count">{visibleCounts.network}</span>
        </button>
      </div>

      <main
        id="log-scroll"
        className="log-scroll"
        onContextMenu={(e) => openRowContextMenu(e)}
      >
        {sortedRows.length === 0 ? (
          <div className="empty">
            <div className="empty-title">{searchQuery ? "无匹配结果" : "还没有日志"}</div>
            <div className="empty-hint">
              {searchQuery
                ? "试试其他关键词，或清空搜索框。"
                : "在页面中调用 console.log()，事件会自动收集并展示在此。"}
            </div>
          </div>
        ) : (
          sortedRows.map((row) => {
            if (row.kind === "log") {
              const ts = row.lastTs
              const relatedSelector = findRelatedSelector(rows, ts, rowTabId(row.tabId))
              const relatedNetwork = findRelatedNetwork(rows, ts, rowTabId(row.tabId))
              return (
                <LogRow
                  key={row.id}
                  row={row}
                  relatedSelector={relatedSelector}
                  relatedNetwork={relatedNetwork}
                  searchQuery={searchQuery}
                  onContextMenu={(e) => openRowContextMenu(e, row)}
                />
              )
            }
            if (row.kind === "network") {
              return (
                <NetworkRow
                  key={row.id}
                  row={row}
                  onContextMenu={(e) => openRowContextMenu(e, row)}
                />
              )
            }
            return (
              <ActionRow
                key={row.id}
                row={row}
                searchQuery={searchQuery}
                onContextMenu={(e) => openRowContextMenu(e, row)}
                onTargetClick={(selector) => void highlightDomInActiveTab({ selector })}
              />
            )
          })
        )}
      </main>

      {contextMenu && (
        <ContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          onClose={() => setContextMenu(null)}
          items={[
            ...(contextMenu.row
              ? [{ label: "复制本条日志", onClick: () => void copyRow(contextMenu.row!) }]
              : []),
            { label: "复制全部（当前列表）", onClick: () => void copyAllVisible() },
            { label: "导出 txt + json", onClick: exportLogs }
          ]}
        />
      )}

      {copyToast && <div className="copy-toast">{copyToast}</div>}

      {analysisOpen && (
        <AnalysisPanel
          analyzing={analyzing}
          result={analysis}
          error={analysisError}
          onClose={() => setAnalysisOpen(false)}
        />
      )}

      {settingsOpen && (
        <SettingsPanel
          config={aiConfig}
          onChange={setAiConfig}
          onClose={() => setSettingsOpen(false)}
          onSaved={() => showToast("AI 设置已保存")}
        />
      )}

      <footer className="app-footer">
        <button className="primary-btn" disabled={analyzing} onClick={runAnalysis}>
          {analyzing && <span className="spinner" aria-hidden="true" />}
          <span>{analyzing ? "AI 分析中…" : "✨ 一键 AI 分析"}</span>
        </button>
        <div className="footer-hint">显示 {sortedRows.length} / {rows.length} 条 · 右键菜单</div>
      </footer>
    </div>
  )
}
