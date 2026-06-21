import type { DisplayRow } from "../../utils/logDedupe"
import { splitErrorText } from "../../utils/stackParser"
import ObjectPreview from "./ObjectPreview"
import StackTrace from "./StackTrace"
import { ClampedText } from "./ClampedText"
import "./LogRow.css"

interface Props {
  row: Extract<DisplayRow, { kind: "log" }>
  relatedSelector?: string
  relatedNetwork?: Extract<DisplayRow, { kind: "network" }>
  searchQuery?: string
  onContextMenu?: (e: React.MouseEvent) => void
}

function highlightText(text: string, query?: string) {
  const q = query?.trim()
  if (!q) return text
  const idx = text.toLowerCase().indexOf(q.toLowerCase())
  if (idx < 0) return text
  return (
    <>
      {text.slice(0, idx)}
      <mark className="search-hit">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  )
}

export default function LogRow({
  row,
  relatedSelector,
  relatedNetwork,
  searchQuery,
  onContextMenu
}: Props) {
  const time = new Date(row.lastTs).toTimeString().slice(0, 8)

  const hasObjects = row.args.some(
    (arg) =>
      arg.kind === "dom" ||
      arg.kind === "error" ||
      (arg.kind === "object" &&
        typeof arg.value === "object" &&
        arg.value !== null &&
        Object.keys(arg.value).length > 0)
  )

  const errorParts = row.level === "error" && !hasObjects ? splitErrorText(row.text) : null

  return (
    <div
      className={`log-row level-${row.level}${row.inputKey ? " log-row-input" : ""}`}
      onContextMenu={onContextMenu}
    >
      <div className="row-time">{time}</div>
      <div className="row-level">{row.level.toUpperCase()}</div>
      <div className="row-content">
        {hasObjects ? (
          <div className="row-args">
            {row.args.map((arg, i) => (
              <div key={i} className="arg-item">
                <ObjectPreview value={arg} relatedSelector={relatedSelector} />
              </div>
            ))}
          </div>
        ) : errorParts?.stack ? (
          <div className="error-block">
            <ClampedText text={errorParts.message} className="row-text">
              {highlightText(errorParts.message, searchQuery)}
            </ClampedText>
            <StackTrace stack={errorParts.stack} relatedSelector={relatedSelector} />
          </div>
        ) : (
          <ClampedText text={row.text} className="row-text">
            {highlightText(row.text, searchQuery)}
          </ClampedText>
        )}
        {relatedNetwork && (
          <ClampedText
            text={`↗ ${relatedNetwork.method} ${relatedNetwork.url}${relatedNetwork.status != null ? ` · ${relatedNetwork.status}` : ""}`}
            className="related-network"
            lines={2}
          />
        )}
      </div>
      {row.count > 1 && (
        <div className="row-count" title={`重复输出了 ${row.count} 次`}>
          ×{row.count}
        </div>
      )}
    </div>
  )
}
