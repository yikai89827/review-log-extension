import { useState, useRef, useEffect } from "react"
import type { AiResult, ChatMessage } from "../../utils/ai"

import "./AnalysisPanel.css"

interface Props {
  analyzing: boolean
  result: AiResult | null
  error: string | null
  transcript: string
  onChat: (message: string, chatHistory: ChatMessage[]) => Promise<string>
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

export default function AnalysisPanel({ analyzing, result, error, transcript, onChat, onClose }: Props) {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState("")
  const [chatLoading, setChatLoading] = useState(false)
  const [chatError, setChatError] = useState<string | null>(null)
  const [chatExpanded, setChatExpanded] = useState(false)
  const [isAtBottom, setIsAtBottom] = useState(true)
  const chatListRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  // 检测是否滚动到底部
  const handleScroll = () => {
    if (!chatListRef.current) return
    const { scrollTop, scrollHeight, clientHeight } = chatListRef.current
    // 当滚动位置距离底部小于 50px 时，认为用户在底部
    setIsAtBottom(scrollHeight - scrollTop - clientHeight < 50)
  }

  // 自动滚动到最新消息 - 只有当用户在底部时才滚动
  useEffect(() => {
    if (chatListRef.current && isAtBottom) {
      chatListRef.current.scrollTop = chatListRef.current.scrollHeight
    }
  }, [chatHistory, isAtBottom])

  // 添加滚动事件监听
  useEffect(() => {
    const list = chatListRef.current
    if (list) {
      list.addEventListener('scroll', handleScroll)
      return () => list.removeEventListener('scroll', handleScroll)
    }
  }, [])

  // 分析完成后聚焦输入框
  useEffect(() => {
    if (result && !analyzing && inputRef.current) {
      inputRef.current.focus()
    }
  }, [result, analyzing])

  const handleSendMessage = async () => {
    const message = chatInput.trim()
    if (!message || chatLoading) return

    setChatInput("")
    setChatError(null)
    setChatLoading(true)

    // 添加用户消息
    const userMsg: ChatMessage = {
      role: 'user',
      content: message,
      timestamp: Date.now()
    }
    const newHistory = [...chatHistory, userMsg]
    setChatHistory(newHistory)

    try {
      // 调用 AI 对话
      const response = await onChat(message, chatHistory)
      
      // 添加 AI 回复
      const assistantMsg: ChatMessage = {
        role: 'assistant',
        content: response,
        timestamp: Date.now()
      }
      setChatHistory([...newHistory, assistantMsg])
    } catch (err) {
      setChatError(err instanceof Error ? err.message : "对话失败")
      // 移除用户消息（失败时）
      setChatHistory(chatHistory)
    } finally {
      setChatLoading(false)
      inputRef.current?.focus()
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

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
              {/* 分析结果区域 - 展开对话时隐藏 */}
              {!chatExpanded && (
                <>
                  <section className="analysis-result-section">
                    <h3 className="md-h3">原因分析</h3>
                    <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.analysis) }} />
                  </section>
                  <section className="analysis-result-section">
                    <h3 className="md-h3">修复建议</h3>
                    <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(result.fix) }} />
                  </section>
                </>
              )}
              
              {/* 对话区域 */}
              <section className={`chat-section ${chatExpanded ? 'chat-expanded' : ''}`}>
                <div className="chat-header">
                  <h3 className="md-h3 chat-title">继续对话</h3>
                  <button
                    className="expand-btn"
                    onClick={() => setChatExpanded(!chatExpanded)}
                    title={chatExpanded ? '收起对话' : '展开对话'}
                  >
                    {chatExpanded ? '收起对话' : '展开对话'}
                  </button>
                </div>
                <div className="chat-list" ref={chatListRef}>
                  {chatHistory.length === 0 && (
                    <div className="chat-empty">
                      有更多问题？输入下方输入框继续与 AI 沟通
                    </div>
                  )}
                  {chatHistory.map((msg, idx) => (
                    <div key={idx} className={`chat-message chat-${msg.role}`}>
                      <div className="chat-avatar">
                        {msg.role === 'user' ? '👤' : '🤖'}
                      </div>
                      <div className="chat-content">
                        <div className="md" dangerouslySetInnerHTML={{ __html: renderMarkdown(msg.content) }} />
                      </div>
                    </div>
                  ))}
                  {chatLoading && (
                    <div className="chat-message chat-assistant">
                      <div className="chat-avatar">🤖</div>
                      <div className="chat-content chat-loading-msg">
                        <span className="spinner-small"></span>
                        正在思考...
                      </div>
                    </div>
                  )}
                </div>
                
                {chatError && <div className="chat-error">{chatError}</div>}
                
                <div className="chat-input-area">
                  <input
                    ref={inputRef}
                    type="text"
                    className="chat-input"
                    placeholder="输入问题继续对话..."
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={chatLoading}
                  />
                  <button
                    className="chat-send-btn"
                    onClick={handleSendMessage}
                    disabled={chatLoading || !chatInput.trim()}
                  >
                    发送
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>
    </div>
  )
}