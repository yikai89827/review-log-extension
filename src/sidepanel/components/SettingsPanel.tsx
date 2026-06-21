import { useState, useEffect } from "react"

import { saveConfig } from "../../utils/ai"
import { AI_MODEL_PRESETS, getPreset, matchPreset } from "../../utils/aiModels"
import type { AiConfig } from "../../types"

import "./SettingsPanel.css"

interface Props {
  config: AiConfig
  onChange: (cfg: AiConfig) => void
  onClose: () => void
  onSaved?: () => void
}

export default function SettingsPanel({ config, onChange, onClose, onSaved }: Props) {
  const [presetId, setPresetId] = useState(() => matchPreset(config))
  const [endpoint, setEndpoint] = useState(config.endpoint)
  const [model, setModel] = useState(config.model)
  const [apiKey, setApiKey] = useState(config.apiKey)
  const [showKey, setShowKey] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const isCustom = presetId === "custom"

  useEffect(() => {
    setPresetId(matchPreset(config))
    setEndpoint(config.endpoint)
    setModel(config.model)
    setApiKey(config.apiKey)
  }, [config])

  const onPresetChange = (id: string) => {
    setPresetId(id)
    setError(null)
    const preset = getPreset(id)
    if (!preset || id === "custom") return
    setEndpoint(preset.endpoint)
    setModel(preset.model)
  }

  const save = () => {
    const trimmedKey = apiKey.trim()
    const trimmedEndpoint = endpoint.trim()
    const trimmedModel = model.trim()

    if (!trimmedKey) {
      setError("请填写 API Key")
      return
    }
    if (!trimmedEndpoint) {
      setError("请填写 API Endpoint")
      return
    }
    if (!trimmedModel) {
      setError("请填写 Model")
      return
    }

    const next: AiConfig = {
      endpoint: trimmedEndpoint,
      model: trimmedModel,
      apiKey: trimmedKey
    }

    saveConfig(next)
    onChange(next)
    onSaved?.()
    onClose()
  }

  const intlPresets = AI_MODEL_PRESETS.filter((p) => p.provider === "intl")
  const cnPresets = AI_MODEL_PRESETS.filter((p) => p.provider === "cn")

  return (
    <div className="settings-overlay" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="settings-panel">
        <div className="settings-header">
          <div className="settings-title">AI 设置</div>
          <button className="icon-btn" type="button" onClick={onClose}>×</button>
        </div>
        <div className="settings-body">
          <label className="field">
            <span className="field-label">模型</span>
            <select
              className="settings-select"
              value={presetId}
              onChange={(e) => onPresetChange(e.target.value)}
            >
              <optgroup label="国际">
                {intlPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              <optgroup label="国内">
                {cnPresets.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </optgroup>
              <option value="custom">自定义</option>
            </select>
          </label>

          <label className="field">
            <span className="field-label">API Endpoint</span>
            <input
              value={endpoint}
              onChange={(e) => {
                setEndpoint(e.target.value)
                if (!isCustom) setPresetId("custom")
              }}
              type="text"
              readOnly={!isCustom}
              placeholder="https://api.openai.com/v1/chat/completions"
            />
          </label>

          {isCustom && (
            <label className="field">
              <span className="field-label">Model ID</span>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                type="text"
                placeholder="gpt-4o-mini"
              />
            </label>
          )}

          {!isCustom && (
            <div className="field-readonly">
              <span className="field-label">Model ID</span>
              <code className="model-id-display">{model}</code>
            </div>
          )}

          <label className="field">
            <span className="field-label">API Key</span>
            <div className="key-row">
              <input
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value)
                  setError(null)
                }}
                type={showKey ? "text" : "password"}
                placeholder="sk-..."
                autoComplete="off"
              />
              <button className="ghost-btn" type="button" onClick={() => setShowKey(!showKey)}>
                {showKey ? "隐藏" : "显示"}
              </button>
            </div>
          </label>

          {error && <div className="settings-error">{error}</div>}

          <div className="hint">
            选择模型后 Endpoint 会自动填充。只需填入 API Key 并保存即可。
            密钥仅保存在当前浏览器扩展的 localStorage 中。
          </div>
        </div>
        <div className="settings-footer">
          <button className="ghost-btn" type="button" onClick={onClose}>取消</button>
          <button className="primary-btn" type="button" onClick={save}>保存</button>
        </div>
      </div>
    </div>
  )
}
