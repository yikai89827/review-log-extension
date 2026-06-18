import type { DisplayRow } from "../../utils/logDedupe"

import "./ActionRow.css"

interface Props {
  row: Extract<DisplayRow, { kind: "action" }>
}

export default function ActionRow({ row }: Props) {
  const time = new Date(row.ts).toTimeString().slice(0, 8)

  return (
    <div className="action-row">
      <div className="row-time">{time}</div>
      <div className="action-icon">⚡</div>
      <div className="action-content">
        <div className="action-header">
          <span className="action-label">{row.action}</span>
        </div>
        {row.target && (
          <div className="action-target-wrapper">
            <span className="target-label">触发元素:</span>
            <span className="action-target">{row.target}</span>
          </div>
        )}
      </div>
    </div>
  )
}
