import type { DisplayRow } from "../../utils/logDedupe"
import { ClampedText } from "./ClampedText"
import "./NetworkRow.css"

interface Props {
  row: Extract<DisplayRow, { kind: "network" }>
  onContextMenu?: (e: React.MouseEvent) => void
}

export default function NetworkRow({ row, onContextMenu }: Props) {
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
    <div className="network-row" onContextMenu={onContextMenu}>
      <div className="row-time">{time}</div>
      <div className="network-badge">{row.method}</div>
      <div className="network-content">
        <ClampedText text={row.url} className="network-url" lines={3} />
        <div className="network-meta">
          {row.status != null && <span className={statusClass}>{row.status}</span>}
          {row.duration != null && <span className="net-duration">{row.duration}ms</span>}
        </div>
      </div>
    </div>
  )
}
