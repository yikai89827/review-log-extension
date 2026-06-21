// Shared types used across background, content, sidepanel and the injected main-world script.

export type LogLevel = "log" | "info" | "warn" | "error" | "debug"

export interface LogEntry {
  id?: string
  /** Unique id from inject script; used to dedupe across HMR / double listeners */
  eventId?: string
  seq: number
  level: LogLevel
  args: SerializedArg[]
  text: string
  ts: number
  tabId?: number | string
  url?: string
}

export interface DomNode {
  tagName: string
  id: string
  className: string
  attributes: Record<string, string>
  textContent: string
  children: DomNode[]
  nodeType: number
  nodeName: string
}

export type SerializedArg =
  | { kind: "string"; value: string }
  | { kind: "number"; value: number }
  | { kind: "boolean"; value: boolean }
  | { kind: "null" }
  | { kind: "undefined" }
  | { kind: "object"; value: Record<string, SerializedArg> | SerializedArg[] }
  | { kind: "function"; value: string }
  | { kind: "symbol"; value: string }
  | { kind: "bigint"; value: string }
  | { kind: "error"; name: string; message: string; stack?: string }
  | { kind: "dom"; value: DomNode }

export interface PageActionEvent {
  type: "user-event"
  action: string
  target?: string
  ts: number
  url: string
  tabId?: number | string
  eventId?: string
}

export interface InjectToContentMessage {
  source: "review-log-inject"
  payload: LogEntry
}

export interface InjectEventMessage {
  source: "review-log-inject-event"
  payload: PageActionEvent
}

export interface LogForwardMessage {
  type: "log:append"
  entry: LogEntry
}

export interface LogClearMessage {
  type: "log:clear"
  tabId: number | string
}

export interface PageActionForwardMessage {
  type: "action:append"
  event: PageActionEvent & { tabId: number | string }
}

export type RuntimeMessage =
  | LogForwardMessage
  | LogClearMessage
  | PageActionForwardMessage
  | { type: "log:request-history"; tabId: number | string }
  | { type: "log:request-history-response"; entries: LogEntry[]; actions: PageActionEvent[] }
  | { type: "log:open-panel"; tabId?: number }
  | { type: "log:config"; config: AiConfig }
  | { type: "log:ai-result"; requestId: string; result: AiResult }
  | { type: "log:ai-error"; requestId: string; error: string }

export interface AiConfig {
  endpoint: string
  model: string
  apiKey: string
}

export interface AiResult {
  analysis: string
  fix: string
}
