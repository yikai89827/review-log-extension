import type { DisplayRow } from "../../utils/logDedupe"
import "./ActionRow.css"

interface Props {
  row: Extract<DisplayRow, { kind: "action" }>
  searchQuery?: string
  onCopy?: () => void
  onContextMenu?: (e: React.MouseEvent) => void
  onTargetClick?: (selector: string) => void
}

export default function ActionRow({
  row,
  searchQuery,
  onCopy,
  onContextMenu,
  onTargetClick
}: Props) {
  const time = new Date(row.ts).toTimeString().slice(0, 8)

  const highlight = (text: string) => {
    const q = searchQuery?.trim()
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

  return (
    <div
      className="action-row"
      onDoubleClick={onCopy}
      onContextMenu={onContextMenu}
      title="双击复制本条日志"
    >
      <div className="row-time">{time}</div>
      <div className="action-icon">⚡</div>
      <div className="action-content">
        <div className="action-header">
          <span className="action-label">{highlight(row.action)}</span>
        </div>
        {row.target && (
          <div className="action-target-wrapper">
            <span className="target-label">触发元素:</span>
            <button
              type="button"
              className="action-target action-target-btn"
              title="在页面中高亮此元素"
              onClick={(e) => {
                e.stopPropagation()
                onTargetClick?.(row.target!)
              }}
            >
              {highlight(row.target)}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
