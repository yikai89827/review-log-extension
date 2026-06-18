import type { DisplayRow } from "../../utils/logDedupe"
import ObjectPreview from "./ObjectPreview"
import "./LogRow.css"

interface Props {
  row: Extract<DisplayRow, { kind: "log" }>
}

export default function LogRow({ row }: Props) {
  const time = new Date(row.lastTs).toTimeString().slice(0, 8)

  const hasObjects = row.args.some(arg => arg.kind === "object" && typeof arg.value === "object" && arg.value !== null && Object.keys(arg.value).length > 0)

  return (
    <div className={`log-row level-${row.level}`}>
      <div className="row-time">{time}</div>
      <div className="row-level">{row.level.toUpperCase()}</div>
      <div className="row-content">
        {hasObjects ? (
          <div className="row-args">
            {row.args.map((arg, i) => (
              <div key={i} className="arg-item">
                <ObjectPreview value={arg} />
              </div>
            ))}
          </div>
        ) : (
          <pre className="row-text">{row.text}</pre>
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