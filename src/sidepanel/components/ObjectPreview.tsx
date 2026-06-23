import { useState } from "react"
import type { SerializedArg, DomNode } from "../../types"
import StackTrace from "./StackTrace"
import "./ObjectPreview.css"

interface Props {
  value: SerializedArg
  defaultExpanded?: boolean
  depth?: number
  relatedSelector?: string
}

function formatValue(value: SerializedArg): string {
  switch (value.kind) {
    case "null":
      return "null"
    case "undefined":
      return "undefined"
    case "string":
      return `"${value.value}"`
    case "number":
      return String(value.value)
    case "boolean":
      return value.value ? "true" : "false"
    case "bigint":
      return `${value.value}n`
    case "symbol":
      return `Symbol(${value.value})`
    case "function":
      return `ƒ ${value.value}`
    case "error":
      return `${value.name}: ${value.message}`
    case "object":
      return typeof value.value === "object" ? (Array.isArray(value.value) ? `Array(${value.value.length})` : "Object") : String((value as { value: unknown }).value)
    case "dom":
      const dom = value.value
      return `<${dom.tagName || dom.nodeName.toLowerCase()}>${dom.textContent ? ` "${dom.textContent.slice(0, 20)}${dom.textContent.length > 20 ? "..." : ""}"` : ""}`
    default:
      return String((value as { value: unknown }).value)
  }
}

function isExpandable(value: SerializedArg): boolean {
  if (value.kind === "object" && typeof value.value === "object" && value.value !== null && Object.keys(value.value).length > 0) {
    return true
  }
  if (value.kind === "dom" && value.value.children.length > 0) {
    return true
  }
  if (value.kind === "error" && value.stack) {
    return true
  }
  return false
}

function getTypeColor(value: SerializedArg): string {
  switch (value.kind) {
    case "string":
      return "color-string"
    case "number":
    case "bigint":
      return "color-number"
    case "boolean":
      return "color-boolean"
    case "null":
    case "undefined":
      return "color-null"
    case "function":
      return "color-function"
    case "symbol":
      return "color-symbol"
    case "error":
      return "color-error"
    case "object":
      return typeof value.value === "object" && Array.isArray(value.value) ? "color-array" : "color-object"
    case "dom":
      return "color-dom"
    default:
      return ""
  }
}

interface EntryProps {
  keyName: string | number | null
  value: SerializedArg
  depth: number
  defaultExpanded: boolean
  relatedSelector?: string
}

function formatDomNode(node: DomNode): string {
  let result = `<${node.tagName || node.nodeName.toLowerCase()}`
  
  if (node.id) {
    result += ` id="${node.id}"`
  }
  if (node.className) {
    result += ` class="${node.className}"`
  }
  
  for (const [name, val] of Object.entries(node.attributes)) {
    if (name !== 'id' && name !== 'class') {
      result += ` ${name}="${val.slice(0, 30)}${val.length > 30 ? "..." : ""}"`
    }
  }
  
  result += ">"
  
  if (node.textContent && node.textContent.length > 0) {
    result += ` ${node.textContent.slice(0, 20)}${node.textContent.length > 20 ? "..." : ""}`
  }
  
  return result
}

function DomEntry({ node, depth, defaultExpanded }: { node: DomNode; depth: number; defaultExpanded: boolean }) {
  const [expanded, setExpanded] = useState(depth === 0 && defaultExpanded)
  const hasChildren = node.children.length > 0

  return (
    <div className="entry" style={{ paddingLeft: depth === 0 ? "0" : `${depth * 16}px` }}>
      <div className="entry-line">
        {hasChildren && (
          <button
            className="expand-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "折叠" : "展开"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}
        <span className="entry-value color-dom">
          {formatDomNode(node)}
        </span>
        {hasChildren && !expanded && (
          <span className="entry-hint">
            ({node.children.length})
          </span>
        )}
      </div>
      {hasChildren && expanded && (
        <div className="entry-children">
          {node.children.map((child, index) => (
            <DomEntry
              key={index}
              node={child}
              depth={depth + 1}
              defaultExpanded={defaultExpanded}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Entry({ keyName, value, depth, defaultExpanded, relatedSelector }: EntryProps) {
  const [expanded, setExpanded] = useState(false)
  const expandable = isExpandable(value)
  const typeColor = getTypeColor(value)
  const displayValue = formatValue(value)

  if (value.kind === "dom") {
    return (
      <div className="entry" style={{ paddingLeft: depth === 0 ? "0" : `${depth * 16}px` }}>
        {keyName !== null && (
          <div className="entry-line">
            <span className="entry-key">
              {typeof keyName === "string" ? `"${keyName}": ` : `[${keyName}]: `}
            </span>
          </div>
        )}
        <DomEntry node={value.value} depth={keyName !== null ? depth : depth} defaultExpanded={defaultExpanded} />
      </div>
    )
  }

  if (value.kind === "error") {
    return (
      <div className="entry" style={{ paddingLeft: depth === 0 ? "0" : `${depth * 16}px` }}>
        <div className="entry-line">
          {expandable && (
            <button
              className="object-expand-btn"
              onClick={() => setExpanded(!expanded)}
              title={expanded ? "折叠" : "展开"}
            >
              {expanded ? "▼" : "▶"}
            </button>
          )}
          {keyName !== null && (
            <span className="entry-key">
              {typeof keyName === "string" ? `"${keyName}": ` : `[${keyName}]: `}
            </span>
          )}
          <span className={`entry-value ${typeColor}`}>
            {displayValue}
          </span>
        </div>
        {expandable && expanded && value.stack && (
          <div className="entry-children">
            <StackTrace stack={value.stack} relatedSelector={relatedSelector} />
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="entry" style={{ paddingLeft: depth === 0 ? "0" : `${depth * 16}px` }}>
      <div className="entry-line">
        {expandable && (
          <button
            className="object-expand-btn"
            onClick={() => setExpanded(!expanded)}
            title={expanded ? "折叠" : "展开"}
          >
            {expanded ? "▼" : "▶"}
          </button>
        )}
        {keyName !== null && (
          <span className="entry-key">
            {typeof keyName === "string" ? `"${keyName}": ` : `[${keyName}]: `}
          </span>
        )}
        <span className={`entry-value ${typeColor}`}>
          {displayValue}
        </span>
        {expandable && !expanded && value.kind === "object" && (
          <span className="entry-hint">
            ({Object.keys(value.value as Record<string, unknown>).length})
          </span>
        )}
      </div>
      {expandable && expanded && value.kind === "object" && (
        <div className="entry-children">
          {typeof value.value === "object" &&
            Object.entries(value.value).map(([k, v]) => {
              const displayKey = k.startsWith("$") ? k.slice(1) : k
              return (
                <Entry
                  key={k}
                  keyName={displayKey}
                  value={v as SerializedArg}
                  depth={depth + 1}
                  defaultExpanded={defaultExpanded}
                />
              )
            })}
        </div>
      )}
    </div>
  )
}

export default function ObjectPreview({ value, defaultExpanded = true, depth = 0, relatedSelector }: Props) {
  return (
    <Entry
      keyName={null}
      value={value}
      depth={depth}
      defaultExpanded={defaultExpanded}
      relatedSelector={relatedSelector}
    />
  )
}
