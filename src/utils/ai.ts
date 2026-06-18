// Thin wrapper around an OpenAI-compatible chat-completions endpoint. The
// endpoint, model and key are all configurable from the side panel.

import type { AiConfig, AiResult } from "../types"

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
