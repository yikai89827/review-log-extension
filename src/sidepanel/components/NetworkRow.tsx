import type { DisplayRow } from "../../utils/logDedupe"
import "./NetworkRow.css"

interface Props {
  row: Extract<DisplayRow, { kind: "network" }>
}

export default function NetworkRow({ row }: Props) {
  const time = new Date(row.ts).toTimeString().slice(0, 8)
  const statusClass =
    row.status == null
      ? ""
      : row.status >= 400
        ? "net-status-error"
        : row.status >= 200 && row.status < 300
          ? "net-status-ok"
          : "net-status-warn"

  return (
    <div className="network-row">
      <div className="row-time">{time}</div>
      <div className="network-badge">{row.method}</div>
      <div className="network-content">
        <div className="network-url">{row.url}</div>
        <div className="network-meta">
          {row.status != null && <span className={statusClass}>{row.status}</span>}
          {row.duration != null && <span className="net-duration">{row.duration}ms</span>}
        </div>
      </div>
    </div>
  )
}
