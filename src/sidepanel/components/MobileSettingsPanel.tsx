import { useState, useEffect } from "react"

import "./MobileSettingsPanel.css"
import { getMobileConfig, type MobileConfig } from "../../utils/mobileConfig"

interface Props {
  onClose: () => void
}

type ConnectionMode = "self-hosted" | "goeasy"

export default function MobileSettingsPanel({ onClose }: Props) {
  // 从环境配置获取默认值
  const envConfig = getMobileConfig()
  
  const [connectionMode, setConnectionMode] = useState<ConnectionMode>(envConfig.defaultMode)
  const [serverUrl, setServerUrl] = useState(envConfig.selfHosted.serverUrl)
  const [goeasyHost, setGoeasyHost] = useState(envConfig.goeasy.host)
  const [goeasyAppkey, setGoeasyAppkey] = useState(envConfig.goeasy.appkey)
  const [goeasyChannel, setGoeasyChannel] = useState(envConfig.goeasy.channel)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    chrome.runtime.sendMessage({ type: "mobile:get-status" })
    const handleStatus = (msg: unknown) => {
      const message = msg as { type: string; connected: boolean; serverUrl: string; mode: ConnectionMode }
      if (message.type === "mobile:status") {
        setConnected(message.connected)
        if (message.mode === "goeasy") {
          setConnectionMode("goeasy")
        } else {
          setServerUrl(message.serverUrl || serverUrl)
        }
      }
    }
    chrome.runtime.onMessage.addListener(handleStatus)
    return () => chrome.runtime.onMessage.removeListener(handleStatus)
  }, [])

  const handleConnect = async () => {
    setConnecting(true)
    setError(null)
    
    try {
      if (connectionMode === "self-hosted") {
        if (!serverUrl.trim()) {
          setError("请输入服务器地址")
          setConnecting(false)
          return
        }
        
        const url = serverUrl.trim()
        if (!url.startsWith("http://") && !url.startsWith("https://")) {
          setError("地址必须以 http:// 或 https:// 开头")
          setConnecting(false)
          return
        }
        
        chrome.runtime.sendMessage({ type: "mobile:connect", serverUrl: url, mode: "self-hosted" })
      } else {
        if (!goeasyAppkey.trim()) {
          setError("请输入 GoEasy AppKey")
          setConnecting(false)
          return
        }
        if (!goeasyHost.trim()) {
          setError("请输入 GoEasy 主机地址")
          setConnecting(false)
          return
        }
        if (!goeasyChannel.trim()) {
          setError("请输入频道名称")
          setConnecting(false)
          return
        }
        
        chrome.runtime.sendMessage({ 
          type: "mobile:connect", 
          mode: "goeasy",
          goeasyConfig: {
            host: goeasyHost.trim(),
            appkey: goeasyAppkey.trim(),
            channel: goeasyChannel.trim()
          }
        })
      }
      
      const handleConnected = (msg: unknown) => {
        const message = msg as { type: string; serverUrl: string }
        if (message.type === "mobile:connected") {
          setConnected(true)
          setConnecting(false)
          chrome.runtime.onMessage.removeListener(handleConnected)
        }
      }
      chrome.runtime.onMessage.addListener(handleConnected)
      
      setTimeout(() => {
        if (connecting) {
          setError("连接超时，请检查配置")
          setConnecting(false)
        }
      }, 5000)
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

  // 检查是否有预配置
  const hasSelfHostedConfig = !!envConfig.selfHosted.serverUrl
  const hasGoEasyConfig = !!envConfig.goeasy.appkey && !!envConfig.goeasy.host && !!envConfig.goeasy.channel

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
          
          {/* 连接模式选择 */}
          <div className="mode-selector">
            <div className="mode-label">连接模式</div>
            <div className="mode-options">
              <button
                className={`mode-option ${connectionMode === "self-hosted" ? "active" : ""}`}
                onClick={() => setConnectionMode("self-hosted")}
                disabled={connected}
              >
                自建服务器
                {hasSelfHostedConfig && <span className="config-badge">已配置</span>}
              </button>
              <button
                className={`mode-option ${connectionMode === "goeasy" ? "active" : ""}`}
                onClick={() => setConnectionMode("goeasy")}
                disabled={connected}
              >
                GoEasy
                {hasGoEasyConfig && <span className="config-badge">已配置</span>}
              </button>
            </div>
          </div>

          {/* 自建服务器配置 */}
          {connectionMode === "self-hosted" && (
            <>
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
            </>
          )}

          {/* GoEasy 配置 */}
          {connectionMode === "goeasy" && (
            <>
              <label className="field">
                <span className="field-label">主机地址</span>
                <input
                  value={goeasyHost}
                  onChange={(e) => setGoeasyHost(e.target.value)}
                  type="text"
                  placeholder="hangzhou.goeasy.io"
                  disabled={connected}
                />
              </label>
              <label className="field">
                <span className="field-label">AppKey</span>
                <input
                  value={goeasyAppkey}
                  onChange={(e) => setGoeasyAppkey(e.target.value)}
                  type="text"
                  placeholder="BC-xxxxxxxxxxxx"
                  disabled={connected}
                />
              </label>
              <label className="field">
                <span className="field-label">频道名称</span>
                <input
                  value={goeasyChannel}
                  onChange={(e) => setGoeasyChannel(e.target.value)}
                  type="text"
                  placeholder="review-log-channel"
                  disabled={connected}
                />
              </label>
              <div className="hint">
                使用 GoEasy 云服务推送日志。需要先在 <a href="https://www.goeasy.io" target="_blank" className="hint-link">GoEasy官网</a> 注册获取 AppKey。
              </div>
            </>
          )}

          {error && <div className="error-msg">{error}</div>}
          {connected && (
            <div className="status connected">
              <span className="status-icon">✓</span>
              <span>
                {connectionMode === "goeasy" 
                  ? `已连接到 GoEasy (${goeasyHost})` 
                  : `已连接到 ${serverUrl}`
                }
              </span>
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