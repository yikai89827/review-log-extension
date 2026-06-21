export interface AiModelPreset {
  id: string
  label: string
  provider: "intl" | "cn" | "custom"
  model: string
  endpoint: string
}

/** 常见 OpenAI 兼容模型；选择后自动填充 endpoint */
export const AI_MODEL_PRESETS: AiModelPreset[] = [
  {
    id: "openai-gpt-4o-mini",
    label: "GPT-4o Mini",
    provider: "intl",
    model: "gpt-4o-mini",
    endpoint: "https://api.openai.com/v1/chat/completions"
  },
  {
    id: "openai-gpt-4o",
    label: "GPT-4o",
    provider: "intl",
    model: "gpt-4o",
    endpoint: "https://api.openai.com/v1/chat/completions"
  },
  {
    id: "openai-gpt-4-turbo",
    label: "GPT-4 Turbo",
    provider: "intl",
    model: "gpt-4-turbo",
    endpoint: "https://api.openai.com/v1/chat/completions"
  },
  {
    id: "deepseek-chat",
    label: "DeepSeek Chat",
    provider: "cn",
    model: "deepseek-chat",
    endpoint: "https://api.deepseek.com/v1/chat/completions"
  },
  {
    id: "deepseek-reasoner",
    label: "DeepSeek Reasoner",
    provider: "cn",
    model: "deepseek-reasoner",
    endpoint: "https://api.deepseek.com/v1/chat/completions"
  },
  {
    id: "qwen-turbo",
    label: "通义千问 Turbo",
    provider: "cn",
    model: "qwen-turbo",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  },
  {
    id: "qwen-plus",
    label: "通义千问 Plus",
    provider: "cn",
    model: "qwen-plus",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  },
  {
    id: "qwen-max",
    label: "通义千问 Max",
    provider: "cn",
    model: "qwen-max",
    endpoint: "https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions"
  },
  {
    id: "glm-4-flash",
    label: "智谱 GLM-4 Flash",
    provider: "cn",
    model: "glm-4-flash",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
  },
  {
    id: "glm-4-air",
    label: "智谱 GLM-4 Air",
    provider: "cn",
    model: "glm-4-air",
    endpoint: "https://open.bigmodel.cn/api/paas/v4/chat/completions"
  },
  {
    id: "moonshot-v1-8k",
    label: "Moonshot Kimi 8K",
    provider: "cn",
    model: "moonshot-v1-8k",
    endpoint: "https://api.moonshot.cn/v1/chat/completions"
  },
  {
    id: "moonshot-v1-32k",
    label: "Moonshot Kimi 32K",
    provider: "cn",
    model: "moonshot-v1-32k",
    endpoint: "https://api.moonshot.cn/v1/chat/completions"
  },
  {
    id: "custom",
    label: "自定义（手动填写 Endpoint / Model）",
    provider: "custom",
    model: "",
    endpoint: ""
  }
]

export function matchPreset(config: { model: string; endpoint: string }): string {
  const exact = AI_MODEL_PRESETS.find(
    (p) => p.id !== "custom" && p.model === config.model && p.endpoint === config.endpoint
  )
  if (exact) return exact.id

  const byModel = AI_MODEL_PRESETS.find((p) => p.id !== "custom" && p.model === config.model)
  if (byModel) return byModel.id

  return "custom"
}

export function getPreset(id: string): AiModelPreset | undefined {
  return AI_MODEL_PRESETS.find((p) => p.id === id)
}
