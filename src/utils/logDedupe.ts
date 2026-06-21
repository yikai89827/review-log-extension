import type { LogEntry, NetworkRequestEvent, PageActionEvent } from "../types"

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
      tabId?: number | string
      inputKey?: string
    }
  | {
      kind: "action"
      id: string
      action: string
      target?: string
      ts: number
      tabId?: number | string
    }
  | {
      kind: "network"
      id: string
      method: string
      url: string
      status?: number
      duration?: number
      ts: number
      tabId?: number | string
    }

export function logKey(entry: LogEntry): string {
  if (entry.inputKey) return `input::${entry.inputKey}`
  return `${entry.level}::${entry.text}`
}

let _id = 0
export function nextId(): string {
  _id += 1
  return `${Date.now().toString(36)}-${_id.toString(36)}`
}

const DEDUPE_KEY = "__review_log_dedupe_sets__"

interface DedupeSets {
  logs: Set<string>
  actions: Set<string>
  networks: Set<string>
}

function getDedupeSets(): DedupeSets {
  const g = globalThis as typeof globalThis & { [DEDUPE_KEY]?: DedupeSets }
  if (!g[DEDUPE_KEY]) {
    g[DEDUPE_KEY] = { logs: new Set(), actions: new Set(), networks: new Set() }
  }
  return g[DEDUPE_KEY]
}

function logDedupeKey(entry: LogEntry): string {
  if (entry.eventId) return entry.eventId
  return `${entry.tabId ?? -1}:${entry.seq}`
}

function actionDedupeKey(event: PageActionEvent & { tabId?: number }): string {
  if (event.eventId) return event.eventId
  return `${event.tabId ?? -1}:${event.action}:${event.target ?? ""}:${event.ts}`
}

function networkDedupeKey(req: NetworkRequestEvent & { tabId?: number }): string {
  if (req.eventId) return req.eventId
  return `${req.tabId ?? -1}:${req.method}:${req.url}:${req.ts}`
}

export function resetLogDedupe(): void {
  const sets = getDedupeSets()
  sets.logs.clear()
  sets.actions.clear()
  sets.networks.clear()
}

function mergeLogRow(rows: DisplayRow[], index: number, entry: LogEntry): DisplayRow[] {
  const prev = rows[index] as Extract<DisplayRow, { kind: "log" }>
  const merged: DisplayRow = {
    ...prev,
    text: entry.text,
    args: entry.args,
    count: prev.count + 1,
    lastTs: entry.ts
  }
  return [...rows.slice(0, index), merged, ...rows.slice(index + 1)]
}

export function pushLog(rows: DisplayRow[], entry: LogEntry): DisplayRow[] {
  const sets = getDedupeSets()
  const dedupeKey = logDedupeKey(entry)
  if (sets.logs.has(dedupeKey)) return rows
  sets.logs.add(dedupeKey)

  if (entry.inputKey) {
    const idx = rows.findIndex(
      (r) => r.kind === "log" && r.inputKey === entry.inputKey && r.tabId === entry.tabId
    )
    if (idx >= 0) return mergeLogRow(rows, idx, entry)
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
        tabId: entry.tabId,
        inputKey: entry.inputKey
      }
    ]
  }

  const last = rows[rows.length - 1]
  if (
    last &&
    last.kind === "log" &&
    !last.inputKey &&
    last.level === entry.level &&
    last.text === entry.text &&
    last.tabId === entry.tabId
  ) {
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
      tabId: entry.tabId as number | undefined
    }
  ]
}

export function pushAction(
  rows: DisplayRow[],
  event: PageActionEvent & { tabId?: number | string }
): DisplayRow[] {
  const sets = getDedupeSets()
  const dedupeKey = actionDedupeKey(event)
  if (sets.actions.has(dedupeKey)) return rows
  sets.actions.add(dedupeKey)

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

export function pushNetwork(
  rows: DisplayRow[],
  request: NetworkRequestEvent & { tabId?: number | string }
): DisplayRow[] {
  const sets = getDedupeSets()
  const dedupeKey = networkDedupeKey(request)
  if (sets.networks.has(dedupeKey)) return rows
  sets.networks.add(dedupeKey)

  return [
    ...rows,
    {
      kind: "network",
      id: nextId(),
      method: request.method,
      url: request.url,
      status: request.status,
      duration: request.duration,
      ts: request.ts,
      tabId: request.tabId
    }
  ]
}

export function rowSearchText(row: DisplayRow): string {
  if (row.kind === "action") {
    return `${row.action} ${row.target ?? ""}`
  }
  if (row.kind === "network") {
    return `${row.method} ${row.url} ${row.status ?? ""}`
  }
  return row.text
}

export function rowMatchesSearch(row: DisplayRow, query: string): boolean {
  const q = query.trim().toLowerCase()
  if (!q) return true
  return rowSearchText(row).toLowerCase().includes(q)
}

export function rowCopyText(row: DisplayRow): string {
  const t = new Date(row.kind === "log" ? row.lastTs : row.ts).toISOString()
  if (row.kind === "action") {
    return `[${t}] ACTION ${row.action}${row.target ? ` → ${row.target}` : ""}`
  }
  if (row.kind === "network") {
    const status = row.status != null ? ` ${row.status}` : ""
    const dur = row.duration != null ? ` ${row.duration}ms` : ""
    return `[${t}] NET ${row.method} ${row.url}${status}${dur}`
  }
  const repeat = row.count > 1 ? ` (×${row.count})` : ""
  return `[${t}] ${row.level.toUpperCase()} ${row.text}${repeat}`
}

export function buildTranscript(rows: DisplayRow[]): string {
  return rows.map(rowCopyText).join("\n")
}

export function buildJsonExport(rows: DisplayRow[]): string {
  return JSON.stringify(
    {
      exportedAt: new Date().toISOString(),
      count: rows.length,
      rows
    },
    null,
    2
  )
}

/** Find nearest network row within ms window of a log timestamp */
export function findRelatedNetwork(
  rows: DisplayRow[],
  logTs: number,
  tabId?: number,
  windowMs = 3000
): Extract<DisplayRow, { kind: "network" }> | undefined {
  let best: Extract<DisplayRow, { kind: "network" }> | undefined
  let bestDelta = windowMs + 1
  for (const r of rows) {
    if (r.kind !== "network") continue
    if (tabId != null && r.tabId !== tabId) continue
    const delta = Math.abs(r.ts - logTs)
    if (delta <= windowMs && delta < bestDelta) {
      best = r
      bestDelta = delta
    }
  }
  return best
}
