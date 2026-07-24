import type { LlmCompletionRequest, LlmCompletionResult } from '@/lib/chat/llm/types'

export type GeminiOptions = {
  apiKey: string
  model?: string
  fetchFn?: typeof fetch
}

const DEFAULT_MODEL = 'gemini-2.0-flash'

export function geminiModelName(env: NodeJS.ProcessEnv = process.env): string {
  return (env.GEMINI_MODEL ?? DEFAULT_MODEL).trim() || DEFAULT_MODEL
}

export async function completeWithGemini(
  request: LlmCompletionRequest,
  options: GeminiOptions
): Promise<LlmCompletionResult> {
  const model = options.model ?? DEFAULT_MODEL
  const fetchFn = options.fetchFn ?? fetch
  const url =
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(options.apiKey)}`

  const contents = request.messages
    .filter((m) => m.role !== 'system')
    .map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }]
    }))

  const body: Record<string, unknown> = { contents }
  if (request.system?.trim()) {
    body.systemInstruction = { parts: [{ text: request.system }] }
  }

  const res = await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  })

  if (!res.ok) {
    const detail = await res.text()
    throw new Error(`Gemini API ${res.status}: ${detail.slice(0, 400)}`)
  }

  const payload = (await res.json()) as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>
  }
  const text =
    payload.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? ''

  if (!text.trim()) {
    throw new Error('Gemini returned empty completion')
  }

  return { text: text.trim(), provider: 'gemini', model }
}
