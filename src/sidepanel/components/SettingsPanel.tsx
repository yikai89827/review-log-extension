import { useState, useEffect } from "react"

import type { AiConfig } from "../../utils/ai"

import "./SettingsPanel.css"

interface Props {
  config: AiConfig
  onChange: (cfg: AiConfig) => void
  onClose: () => void
}

export default function SettingsPanel({ config, onChange, onClose }: Props) {
  const [endpoint, setEndpoint] = useState(config.endpoint)
  const [model, setModel] = useState(config.model)
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [showKey, setShowKey] = useState(false)

  useEffect(() => {
    setEndpoint(config.endpoint)
    setModel(config.model)
    setApiKey(config.apiKey)
  }, [config])

  const save = () => {
    onChange({
      endpoint: endpoint.trim(),
      model: model.trim(),
      apiKey: apiKey.trim()
    })
  }

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div className="settings-header">
          <div className="settings-title">AI 设置</div>
          <button className="icon-btn" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          <label className="field">
            <span className="field-label">API Endpoint</span>
            <input
              value={endpoint}
              onChange={(e) => setEndpoint(e.target.value)}
              type="text"
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </label>
          <label className="field">
            <span className="field-label">Model</span>
            <input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              type="text"
              placeholder="gpt-4o-mini"
            />
          </label>
          <label className="field">
            <span className="field-label">API Key</span>
            <div className="key-row">
              <input
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button className="ghost-btn" type="button" onClick={() => setShowKey(!showKey)}>
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </label>
          <div className="hint">
            使用任意 OpenAI 兼容服务（OpenAI / DeepSeek / 通义千问 / 自建代理）。
            密钥仅保存在当前浏览器扩展的 localStorage 中。
          </div>
        </div>
        <div className="settings-footer">
          <button className="ghost-btn" onClick={onClose}>取消</button>
          <button className="primary-btn" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}