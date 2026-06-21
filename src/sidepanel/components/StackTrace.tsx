import type { DomHighlightPayload } from "../../types"
import { parseStack } from "../../utils/stackParser"
import { highlightDomInActiveTab } from "../../utils/domInspect"
import "./StackTrace.css"

interface Props {
  stack: string
  relatedSelector?: string
}

export default function StackTrace({ stack, relatedSelector }: Props) {
  const frames = parseStack(stack)

  const onFrameClick = (payload: DomHighlightPayload) => {
    void highlightDomInActiveTab({
      ...payload,
      selector: payload.selector ?? relatedSelector
    })
  }

  return (
    <div className="stack-trace">
      {frames.map((frame, i) => {
        const clickable = !!(frame.url || frame.tagHint || relatedSelector)
        return (
          <button
            key={i}
            type="button"
            className={`stack-line${clickable ? " stack-line-clickable" : ""}`}
            disabled={!clickable}
            title={clickable ? "在页面中高亮对应元素（打开 DevTools → Elements 查看）" : undefined}
            onClick={() =>
              onFrameClick({
                url: frame.url,
                line: frame.line,
                column: frame.column,
                tagHint: frame.tagHint,
                selector: relatedSelector
              })
            }
          >
            {frame.raw}
          </button>
        )
      })}
    </div>
  )
}
