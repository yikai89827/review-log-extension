import { useState, useEffect } from "react"

import "./MobileSettingsPanel.css"

interface Props {
  onClose: () => void
}

export default function MobileSettingsPanel({ onClose }: Props) {
  const [serverUrl, setServerUrl] = useState("")
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    // 获取当前连接状态
    chrome.runtime.sendMessage({ type: "mobile:get-status" })
    const handleStatus = (msg: unknown) => {
      const message = msg as { type: string; connected: boolean; serverUrl: string }
      if (message.type === "mobile:status") {
        setConnected(message.connected)
        setServerUrl(message.serverUrl || "")
      }
    }
    chrome.runtime.onMessage.addListener(handleStatus)
    return () => chrome.runtime.onMessage.removeListener(handleStatus)
  }, [])

  const handleConnect = async () => {
    if (!serverUrl.trim()) {
      setError("请输入服务器地址")
      return
    }
    
    setConnecting(true)
    setError(null)
    
    try {
      // 验证地址格式
      const url = serverUrl.trim()
      if (!url.startsWith("http://") && !url.startsWith("https://")) {
        setError("地址必须以 http:// 或 https:// 开头")
        setConnecting(false)
        return
      }
      
      chrome.runtime.sendMessage({ type: "mobile:connect", serverUrl: url })
      
      // 等待连接响应
      const handleConnected = (msg: unknown) => {
        const message = msg as { type: string; serverUrl: string }
        if (message.type === "mobile:connected") {
          setConnected(true)
          setConnecting(false)
          chrome.runtime.onMessage.removeListener(handleConnected)
        }
      }
      chrome.runtime.onMessage.addListener(handleConnected)
      
      // 3秒后超时
      setTimeout(() => {
        if (connecting) {
          setError("连接超时，请检查服务器地址")
          setConnecting(false)
        }
      }, 3000)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
      setConnecting(false)
    }
  }

  const handleDisconnect = () => {
    chrome.runtime.sendMessage({ type: "mobile:disconnect" })
    setConnected(false)
    
    const handleDisconnected = (msg: unknown) => {
      const message = msg as { type: string }
      if (message.type === "mobile:disconnected") {
        chrome.runtime.onMessage.removeListener(handleDisconnected)
      }
    }
    chrome.runtime.onMessage.addListener(handleDisconnected)
  }

  return (
    <div className="mobile-settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="mobile-settings-panel">
        <div className="mobile-settings-header">
          <div className="mobile-settings-title">移动端连接设置</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="mobile-settings-body">
          <div className="mobile-settings-desc">
            连接移动端日志服务器，实时接收移动设备的日志和事件。
          </div>
          <label className="field">
            <span className="field-label">服务器地址</span>
            <input
              value={serverUrl}
              onChange={(e) => setServerUrl(e.target.value)}
              type="text"
              placeholder="http://192.168.1.100:8080"
              disabled={connected}
            />
          </label>
          <div className="hint">
            移动端需要引入 SDK 并连接到此服务器。服务器地址格式：http://IP:端口
          </div>
          {error && <div className="error-msg">{error}</div>}
          {connected && (
            <div className="status connected">
              <span className="status-icon">✓</span>
              <span>已连接到 {serverUrl}</span>
            </div>
          )}
        </div>
        <div className="mobile-settings-footer">
          <button className="ghost-btn" onClick={onClose}>关闭</button>
          {connected ? (
            <button className="danger-btn" onClick={handleDisconnect}>断开连接</button>
          ) : (
            <button className="primary-btn" onClick={handleConnect} disabled={connecting}>
              {connecting ? "连接中..." : "连接"}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}