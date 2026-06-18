import { useState, useEffect, useCallback, useMemo } from "react"

import {
  buildTranscript,
  pushAction,
  pushLog,
  type DisplayRow
} from "../utils/logDedupe"
import { analyzeLogs, loadConfig, saveConfig, type AiConfig } from "../utils/ai"
import type { LogEntry, PageActionEvent, RuntimeMessage } from "../types"
import LogRow from "./components/LogRow"
import ActionRow from "./components/ActionRow"
import SettingsPanel from "./components/SettingsPanel"
import AnalysisPanel from "./components/AnalysisPanel"

import "./style.css"

type FilterType = "all" | "log" | "info" | "warn" | "error" | "action"
type ThemeType = "dark" | "light"

export default function App() {
  const [rows, setRows] = useState<DisplayRow[]>([])
  const [filter, setFilter] = useState<FilterType>("all")
  const [autoScroll, setAutoScroll] = useState(true)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [analysisError, setAnalysisError] = useState<string | null>(null)
  const [analysis, setAnalysis] = useState<{ analysis: string; fix: string } | null>(null)
  const [theme, setTheme] = useState<ThemeType>("dark")

  const [aiConfig, setAiConfig] = useState<AiConfig>(loadConfig())

  useEffect(() => {
    saveConfig(aiConfig)
  }, [aiConfig])

  const handleMessage = useCallback((msg: RuntimeMessage) => {
    if (!msg || typeof msg !== "object") return

    if (msg.type === "log:append") {
      setRows((prev) => pushLog(prev, msg.entry))
    } else if (msg.type === "action:append") {
      setRows((prev) => pushAction(prev, msg.event))
    } else if (msg.type === "log:request-history-response") {
      let next: DisplayRow[] = []
      for (const e of msg.entries) next = pushLog(next, e)
      for (const a of msg.actions) next = pushAction(next, a)
      setRows(next)
    }
  }, [])

  const clearActive = useCallback(() => {
    setRows([])
    chrome.runtime.sendMessage({ type: "log:clear", tabId: -1 })
  }, [])

  useEffect(() => {
    if (autoScroll) {
      setTimeout(() => {
        const el = document.getElementById("log-scroll")
        if (el) el.scrollTop = el.scrollHeight
      }, 0)
    }
  }, [rows, autoScroll])

  const filteredRows = useMemo(() => {
    if (filter === "all") return rows
    if (filter === "action") return rows.filter((r) => r.kind === "action")
    return rows.filter((r) => r.kind === "log" && r.level === filter)
  }, [rows, filter])

  const sortedRows = useMemo(() => {
    return [...filteredRows].sort((a, b) => {
      const timeA = a.kind === "log" ? a.lastTs : a.ts
      const timeB = b.kind === "log" ? b.lastTs : b.ts
      return timeA - timeB
    })
  }, [filteredRows])

  const visibleCounts = useMemo(() => {
    const counts = { log: 0, info: 0, warn: 0, error: 0, action: 0 }
    for (const r of rows) {
      if (r.kind === "action") counts.action += 1
      else counts[r.level] += 1
    }
    return counts
  }, [rows])

  const runAnalysis = useCallback(async () => {
    if (analyzing) return
    setAnalyzing(true)
    setAnalysisError(null)
    setAnalysisOpen(true)
    setAnalysis(null)

    try {
      const transcript = buildTranscript(sortedRows)
      if (!transcript.trim()) {
        throw new Error("当前没有可分析的事件流。")
      }
      const result = await analyzeLogs(aiConfig, transcript)
      setAnalysis(result)
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : String(err))
    } finally {
      setAnalyzing(false)
    }
  }, [analyzing, sortedRows, aiConfig])

  const onConfigChange = useCallback((next: AiConfig) => {
    setAiConfig(next)
  }, [])

  const toggleTheme = useCallback(() => {
    setTheme((prev) => (prev === "dark" ? "light" : "dark"))
  }, [])

  useEffect(() => {
    chrome.runtime.onMessage.addListener(handleMessage)
    
    chrome.tabs.query({ active: true, currentWindow: true }).then((tabs) => {
      const activeTab = tabs[0]
      if (activeTab?.id) {
        chrome.runtime.sendMessage({ type: "log:request-history", tabId: activeTab.id })
      }
    })

    return () => {
      chrome.runtime.onMessage.removeListener(handleMessage)
    }
  }, [handleMessage])

  return (
    <div className={`app-shell ${theme}`}>
      <header className="app-header">
        <div className="header-actions">
          <button
            className="icon-btn"
            aria-pressed={autoScroll}
            title="自动滚动到底部"
            onClick={() => setAutoScroll(!autoScroll)}
          >
            {autoScroll ? "⤓" : "⤒"}
          </button>
          <button className="icon-btn" title="清空" onClick={clearActive}>⌫</button>
          <button className="icon-btn" title="主题切换" onClick={toggleTheme}>
            {theme === "dark" ? "☀" : "☽"}
          </button>
          <button className="icon-btn" title="设置" onClick={() => setSettingsOpen(true)}>⚙</button>
        </div>
      </header>

      <div className="filter-bar">
        <button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>
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
          动作 <span className="count">{visibleCounts.action}</span>
        </button>
      </div>

      <main id="log-scroll" className="log-scroll">
        {sortedRows.length === 0 ? (
          <div className="empty">
            <div className="empty-title">还没有日志</div>
            <div className="empty-hint">
              在页面中调用 console.log()，事件会自动收集并展示在此。
            </div>
          </div>
        ) : (
          sortedRows.map((row) =>
            row.kind === "log" ? (
              <LogRow key={row.id} row={row} />
            ) : (
              <ActionRow key={row.id} row={row} />
            )
          )
        )}
      </main>

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
          onChange={onConfigChange}
          onClose={() => setSettingsOpen(false)}
        />
      )}

      <footer className="app-footer">
        <button className="primary-btn" disabled={analyzing} onClick={runAnalysis}>
          {analyzing && <span className="spinner" aria-hidden="true"></span>}
          <span>{analyzing ? "AI 分析中…" : "✨ 一键 AI 分析"}</span>
        </button>
        <div className="footer-hint">基于 {sortedRows.length} 条记录</div>
      </footer>
    </div>
  )
}
