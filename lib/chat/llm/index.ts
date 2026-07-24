import { completeWithGemini, geminiModelName } from '@/lib/chat/llm/gemini'
import type {
  LlmCompletionRequest,
  LlmCompletionResult,
  LlmProvider
} from '@/lib/chat/llm/types'
import { resolveLlmProvider } from '@/lib/chat/llm/types'

export type CompleteWithProviderOptions = {
  env?: NodeJS.ProcessEnv
  fetchFn?: typeof fetch
}

export async function completeWithProvider(
  request: LlmCompletionRequest,
  options: CompleteWithProviderOptions = {}
): Promise<LlmCompletionResult> {
  const env = options.env ?? process.env
  const provider = resolveLlmProvider(env)
  if (!provider) {
    throw new Error('No LLM provider configured')
  }

  switch (provider) {
    case 'gemini': {
      const apiKey = (env.GEMINI_API_KEY ?? '').trim()
      if (!apiKey) throw new Error('GEMINI_API_KEY is required for gemini provider')
      return completeWithGemini(request, {
        apiKey,
        model: geminiModelName(env),
        fetchFn: options.fetchFn
      })
    }
    case 'openai':
    case 'anthropic':
      throw new Error(`LLM provider ${provider} is not implemented yet`)
    default:
      throw new Error(`Unknown LLM provider: ${provider as LlmProvider}`)
  }
}

export { resolveLlmProvider, externalLlmConfigured } from '@/lib/chat/llm/types'
export type { LlmCompletionRequest, LlmCompletionResult, LlmMessage } from '@/lib/chat/llm/types'
