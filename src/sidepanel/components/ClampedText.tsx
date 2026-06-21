import { useState } from "react"

interface ClampedTextProps {
  text: string
  className?: string
  lines?: number
  children?: React.ReactNode
}

/** 超过 N 行截断；hover 浮层显示完整内容 */
export function ClampedText({ text, className = "", lines = 3, children }: ClampedTextProps) {
  const [showPopover, setShowPopover] = useState(false)

  const lineCount = text.split("\n").length
  const isLong = text.length > 120 || lineCount > lines

  return (
    <div
      className={`clamped-text ${className}${isLong ? " clamped-text-truncated" : ""}`}
      data-lines={lines !== 3 ? lines : undefined}
      onMouseEnter={() => isLong && setShowPopover(true)}
      onMouseLeave={() => setShowPopover(false)}
    >
      <div className="clamped-text-inner">
        {children ?? text}
      </div>
      {showPopover && isLong && (
        <div className="clamped-text-popover" role="tooltip">
          {text}
        </div>
      )}
    </div>
  )
}
