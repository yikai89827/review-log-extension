// Thin wrapper around an OpenAI-compatible chat-completions endpoint. The
// endpoint, model and key are all configurable from the side panel.

import type { AiConfig, AiResult, ChatMessage } from "../types"

export type { AiConfig, AiResult, ChatMessage } from "../types"

export { AI_MODEL_PRESETS, matchPreset, getPreset } from "./aiModels"
export type { AiModelPreset } from "./aiModels"

const DEFAULT_CONFIG: AiConfig = {
  endpoint: "https://api.openai.com/v1/chat/completions",
  model: "gpt-4o-mini",
  apiKey: ""
}

export function loadConfig(): AiConfig {
  try {
    const raw = localStorage.getItem("review-log.ai.config")
    if (!raw) return { ...DEFAULT_CONFIG }
    const parsed = JSON.parse(raw) as Partial<AiConfig>
    return { ...DEFAULT_CONFIG, ...parsed }
  } catch {
    return { ...DEFAULT_CONFIG }
  }
}

export function saveConfig(config: AiConfig) {
  try {
    localStorage.setItem("review-log.ai.config", JSON.stringify(config))
  } catch {
    /* storage full / unavailable */
  }
}

const SYSTEM_PROMPT = `You are a senior front-end engineer helping debug a web application.
You will receive a chronological transcript that mixes user actions and
console output. Your job is to:
1. Identify the root cause of any errors or unexpected behaviour.
2. Explain what the user did, what the application did in response, and where
   things went wrong.
3. Propose concrete code-level fix suggestions.

Reply in two clearly separated sections, using these exact headings:
## Root cause analysis
## Suggested fix
Use Chinese in the response unless the transcript is entirely English. Be
concise but specific. Reference the timestamps and the deduplicated log
counts when relevant.`

export async function analyzeLogs(config: AiConfig, transcript: string): Promise<AiResult> {
  if (!config.apiKey) {
    throw new Error("尚未配置 API Key，请在侧边栏的设置中填入。")
  }
  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.2,
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        {
          role: "user",
          content:
            "Below is the captured user-action / console-log flow (deduplicated).\n\n" +
            transcript +
            "\n\nPlease analyse and respond with the two sections requested."
        }
      ]
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`AI request failed: ${res.status} ${res.statusText} ${text}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content ?? ""
  return splitResult(content)
}

function splitResult(content: string): AiResult {
  const analysisMatch = content.match(/##\s*Root cause analysis([\s\S]*?)(?=##\s*Suggested fix|$)/i)
  const fixMatch = content.match(/##\s*Suggested fix([\s\S]*)$/i)
  return {
    analysis: (analysisMatch?.[1] ?? content).trim(),
    fix: (fixMatch?.[1] ?? "").trim()
  }
}

// 单条日志分析提示词
const SINGLE_LOG_PROMPT = `You are a senior front-end engineer helping debug a web application.
You will receive a single log entry. Your job is to:
1. Analyze this specific log entry and explain what it means.
2. If it's an error, identify the possible root cause.
3. Provide suggestions for fixing or investigating this issue.

Reply in two clearly separated sections, using these exact headings:
## Analysis
## Suggestion
Use Chinese in the response. Be concise but specific.`

// 分析单条日志
export async function analyzeSingleLog(config: AiConfig, logText: string): Promise<AiResult> {
  if (!config.apiKey) {
    throw new Error("尚未配置 API Key，请在侧边栏的设置中填入。")
  }
  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      messages: [
        { role: "system", content: SINGLE_LOG_PROMPT },
        {
          role: "user",
          content: `Analyze this log entry:\n\n${logText}`
        }
      ]
    })
  })
  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`AI request failed: ${res.status} ${res.statusText} ${text}`)
  }
  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }
  const content = data.choices?.[0]?.message?.content ?? ""
  return splitSingleLogResult(content)
}

function splitSingleLogResult(content: string): AiResult {
  const analysisMatch = content.match(/##\s*Analysis([\s\S]*?)(?=##\s*Suggestion|$)/i)
  const fixMatch = content.match(/##\s*Suggestion([\s\S]*)$/i)
  return {
    analysis: (analysisMatch?.[1] ?? content).trim(),
    fix: (fixMatch?.[1] ?? "").trim()
  }
}

// AI 对话功能
export async function chatWithAI(
  config: AiConfig,
  transcript: string,
  previousResult: AiResult,
  chatHistory: ChatMessage[],
  userMessage: string
): Promise<string> {
  if (!config.apiKey) {
    throw new Error("尚未配置 API Key，请在侧边栏的设置中填入。")
  }

  // 构建对话历史
  const messages: { role: string; content: string }[] = [
    {
      role: "system",
      content: SYSTEM_PROMPT + `\n\n以下是之前分析的日志内容：\n${transcript}\n\n之前的分析结果：\n## Root cause analysis\n${previousResult.analysis}\n## Suggested fix\n${previousResult.fix}\n\n现在用户会和你继续对话，请根据上下文回答用户的问题。如果用户询问代码修改建议，请给出具体的代码示例。保持回答简洁但具体。`
    }
  ]

  // 添加之前的对话历史
  for (const msg of chatHistory) {
    messages.push({
      role: msg.role,
      content: msg.content
    })
  }

  // 添加当前用户消息
  messages.push({
    role: "user",
    content: userMessage
  })

  const res = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${config.apiKey}`
    },
    body: JSON.stringify({
      model: config.model,
      temperature: 0.3,
      messages: messages
    })
  })

  if (!res.ok) {
    const text = await res.text().catch(() => "")
    throw new Error(`AI request failed: ${res.status} ${res.statusText} ${text}`)
  }

  const data = (await res.json()) as {
    choices?: { message?: { content?: string } }[]
  }

  return data.choices?.[0]?.message?.content ?? ""
}
