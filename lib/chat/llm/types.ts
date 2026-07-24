export type LlmRole = 'user' | 'assistant' | 'system'

export type LlmMessage = {
  role: LlmRole
  content: string
}

export type LlmCompletionRequest = {
  messages: LlmMessage[]
  system?: string
}

export type LlmCompletionResult = {
  text: string
  provider: string
  model: string
}

export type LlmProvider = 'gemini' | 'openai' | 'anthropic'

export function resolveLlmProvider(
  env: NodeJS.ProcessEnv = process.env
): LlmProvider | null {
  const raw = (env.LLM_PROVIDER ?? '').trim().toLowerCase()
  if (raw === 'gemini' || raw === 'openai' || raw === 'anthropic') {
    return raw
  }
  if ((env.GEMINI_API_KEY ?? '').trim()) return 'gemini'
  if ((env.OPENAI_API_KEY ?? '').trim()) return 'openai'
  if ((env.ANTHROPIC_API_KEY ?? '').trim()) return 'anthropic'
  return null
}

export function externalLlmConfigured(
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return resolveLlmProvider(env) !== null
}
