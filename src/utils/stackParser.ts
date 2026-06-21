export interface StackFrame {
  raw: string
  functionName?: string
  tagHint?: string
  url?: string
  line?: number
  column?: number
}

const FRAME_RE =
  /^\s*at\s+(?:(.+?)\s+\()?(.+?):(\d+):(\d+)\)?$|^\s*(HTML\w+Element\.\w+)\s+\((.+?):(\d+):(\d+)\)$/

export function parseStack(stack: string): StackFrame[] {
  const lines = stack.split("\n").filter(Boolean)
  const frames: StackFrame[] = []

  for (const raw of lines) {
    const m = raw.match(FRAME_RE)
    if (!m) {
      frames.push({ raw })
      continue
    }

    if (m[5]) {
      const tagHint = htmlElementToTag(m[5].split(".")[0])
      frames.push({
        raw,
        tagHint,
        functionName: m[5],
        url: m[6],
        line: Number(m[7]),
        column: Number(m[8])
      })
      continue
    }

    frames.push({
      raw,
      functionName: m[1],
      url: m[2],
      line: Number(m[3]),
      column: Number(m[4])
    })
  }

  return frames
}

function htmlElementToTag(htmlTag: string): string | undefined {
  const m = htmlTag.match(/^HTML(\w+)Element$/)
  if (!m) return undefined
  return m[1].toLowerCase()
}

export function splitErrorText(text: string): { message: string; stack?: string } {
  const idx = text.indexOf("\n")
  if (idx < 0) return { message: text }
  return {
    message: text.slice(0, idx).trim(),
    stack: text.slice(idx + 1).trim()
  }
}
