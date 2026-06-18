import type { AiResult } from "../../utils/ai"

import "./AnalysisPanel.css"

interface Props {
  analyzing: boolean
  result: AiResult | null
  error: string | null
  onClose: () => void
}

function renderMarkdown(s: string): string {
  if (!s) return ""
  let html = s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
  
  html = html.replace(/```([\s\S]*?)```/g, (_, code) => {
    return `<pre class="md-pre"><code>${code.replace(/\n$/, "")}</code></pre>`
  })
  
  html = html.replace(/`([^`\n]+)`/g, '<code class="md-code">$1</code>')
  
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
  
  html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, "$1<em>$2</em>")
  
  html = html.replace(/(^|\n)([-*])\s+(.*)/g, '$1<li class="md-li">$3</li>')
  html = html.replace(/(<li class="md-li">.*<\/li>)(?!\n<li)/gs, '<ul class="md-ul">$1</ul>')
  
  html = html.replace(/(^|\n)###\s+(.*)/g, '$1<h4 class="md-h4">$2</h4>')
  html = html.replace(/(^|\n)##\s+(.*)/g, '$1<h3 class="md-h3">$2</h3>')
  
  html = html
    .split(/\n{2,}/)
    .map((block) => {
      if (/^\s*<(h\d|ul|pre|li)/.test(block)) return block
      return `<p>${block.replace(/\n/g, "<br>")}</p>`
    })
    .join("\n")
  
  return html
}

export default function AnalysisPanel({ analyzing, result, error, onClose }: Props) {
  return (
    <div className="analysis-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="analysis-panel">
        <div className="analysis-header">
          <div className="analysis-title">AI 分析</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="analysis-body">
          {analyzing && (
            <div className="analysis-loading">
              <span className="spinner"></span>
              正在向模型发送事件流并等待分析结果…
            </div>
          )}
          {error && !analyzing && <div className="analysis-error">{error}</div>}
          {result && !analyzing && !error && (
            <>
              <section>
                <h3 className="md-h3">原因分析</h3>
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.analysis) }} />
              </section>
              <section>
                <h3 className="md-h3">修复建议</h3>
                <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.fix) }} />
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}