import type { LogEntry, PageActionEvent } from "../types"

/**
 * A displayable row in the side panel. Consecutive identical log entries are
 * collapsed into a single row whose `count` records how many times the same
 * text was emitted. Page-action events are inserted as a separate kind of row
 * so the user can see the action -> log flow.
 */
export type DisplayRow =
  | {
      kind: "log"
      id: string
      level: LogEntry["level"]
      text: string
      args: LogEntry["args"]
      count: number
      firstTs: number
      lastTs: number
      tabId?: number
    }
  | {
      kind: "action"
      id: string
      action: string
      target?: string
      ts: number
      tabId?: number
    }

/** Hash a log entry's text + level for dedupe comparison. */
export function logKey(entry: LogEntry): string {
  return `${entry.level}::${entry.text}`
}

let _id = 0
export function nextId(): string {
  _id += 1
  return `${Date.now().toString(36)}-${_id.toString(36)}`
}

/**
 * Push a new log entry into a row list, merging with the previous row if it
 * is a log with the same key.
 */
export function pushLog(rows: DisplayRow[], entry: LogEntry): DisplayRow[] {
  const key = logKey(entry)
  const last = rows[rows.length - 1]
  if (last && last.kind === "log" && logKey({ ...last, seq: 0 }) === key && last.tabId === entry.tabId) {
    const merged: DisplayRow = {
      ...last,
      count: last.count + 1,
      lastTs: entry.ts
    }
    return [...rows.slice(0, -1), merged]
  }
  return [
    ...rows,
    {
      kind: "log",
      id: nextId(),
      level: entry.level,
      text: entry.text,
      args: entry.args,
      count: 1,
      firstTs: entry.ts,
      lastTs: entry.ts,
      tabId: entry.tabId
    }
  ]
}

export function pushAction(
  rows: DisplayRow[],
  event: PageActionEvent & { tabId?: number }
): DisplayRow[] {
  return [
    ...rows,
    {
      kind: "action",
      id: nextId(),
      action: event.action,
      target: event.target,
      ts: event.ts,
      tabId: event.tabId
    }
  ]
}

/**
 * Build a markdown transcript suitable to feed into the AI. The dedup
 * summary is included so the model can see the flow rather than spam.
 */
export function buildTranscript(rows: DisplayRow[]): string {
  const lines: string[] = []
  for (const row of rows) {
    const t = new Date(row.kind === "log" ? row.lastTs : row.ts).toISOString()
    if (row.kind === "action") {
      lines.push(`[${t}] ACTION: ${row.action}${row.target ? ` (target=${row.target})` : ""}`)
    } else {
      const head = row.level.toUpperCase().padEnd(5)
      const repeat = row.count > 1 ? `  (x${row.count})` : ""
      lines.push(`[${t}] ${head} ${row.text}${repeat}`)
    }
  }
  return lines.join("\n")
}
