import type { ConversationRepo } from '@/lib/chat/conversation-repo'
import { ConversationRepo as DefaultConversationRepo } from '@/lib/chat/conversation-repo'
import { completeWithProvider, externalLlmConfigured } from '@/lib/chat/llm'
import {
  buildConversationalSystemPrompt,
  buildConversationalUserTurn,
  buildRetrievalContext,
  historyToLlmMessages
} from '@/lib/chat/prompt'
import {
  answerWithRag,
  type ChatAnswerMeta,
  type ChatAnswerOptions,
  type ChatAnswerResult
} from '@/lib/knowledge/chat-core'
import { persistenceEnabled } from '@/lib/db/postgres-url'

export type ConversationalChatOptions = ChatAnswerOptions & {
  conversationId?: string
  title?: string
  useExternalLlm?: boolean
}

export type ConversationalChatResult = ChatAnswerResult & {
  conversation_id: string | null
  message_id: string | null
  llm_meta: {
    llm_provider: string | null
    llm_model: string | null
    llm_fallback: boolean
  }
}

export function shouldPersistConversation(
  options: Pick<ConversationalChatOptions, 'conversationId' | 'title'>
): boolean {
  return Boolean(options.conversationId?.trim() || options.title?.trim())
}

export function persistenceRequired(
  options: Pick<ConversationalChatOptions, 'conversationId' | 'title'>,
  env: NodeJS.ProcessEnv = process.env
): boolean {
  return shouldPersistConversation(options) && !persistenceEnabled(env)
}

type ConversationalDeps = {
  repo?: ConversationRepo
  answerWithRagFn?: typeof answerWithRag
  completeWithProviderFn?: typeof completeWithProvider
  env?: NodeJS.ProcessEnv
}

function mergeMeta(
  base: ChatAnswerMeta,
  llm: ConversationalChatResult['llm_meta']
): ChatAnswerMeta & ConversationalChatResult['llm_meta'] {
  return {
    ...base,
    llm_provider: llm.llm_provider,
    llm_model: llm.llm_model,
    llm_fallback: llm.llm_fallback
  }
}

export async function conversationalAnswer(
  options: ConversationalChatOptions,
  deps: ConversationalDeps = {}
): Promise<ConversationalChatResult> {
  const env = deps.env ?? process.env
  const answerFn = deps.answerWithRagFn ?? answerWithRag
  const llmFn = deps.completeWithProviderFn ?? completeWithProvider

  if (!shouldPersistConversation(options)) {
    const stateless = await answerFn(options)
    return {
      ...stateless,
      conversation_id: null,
      message_id: null,
      llm_meta: {
        llm_provider: null,
        llm_model: null,
        llm_fallback: false
      }
    }
  }

  if (!persistenceEnabled(env)) {
    throw new Error('Persistence unavailable')
  }

  const repo = deps.repo ?? DefaultConversationRepo.fromEnv(env)
  let conversationId = options.conversationId?.trim() ?? ''

  if (conversationId) {
    const existing = await repo.getConversation(conversationId)
    if (!existing) {
      throw new Error('Conversation not found')
    }
  } else {
    const created = await repo.createConversation(options.title?.trim() || null)
    conversationId = created.id
  }

  const prior = await repo.listMessages(conversationId, { limit: 50 })
  const history = prior.map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.content
  }))

  const useExternalLlm =
    options.useExternalLlm ??
  (externalLlmConfigured(env) ? true : false)

  let result: ChatAnswerResult
  let llmMeta: ConversationalChatResult['llm_meta'] = {
    llm_provider: null,
    llm_model: null,
    llm_fallback: false
  }

  if (useExternalLlm && externalLlmConfigured(env)) {
    const retrievalOnly = await answerFn({ ...options, synthesize: false })
    if (
      retrievalOnly.meta.index_status === 'no_index' ||
      retrievalOnly.meta.index_status === 'sync_failed'
    ) {
      return {
        ...retrievalOnly,
        conversation_id: conversationId,
        message_id: null,
        llm_meta: llmMeta
      }
    }

    const context = buildRetrievalContext(retrievalOnly.chunks)
    const system = buildConversationalSystemPrompt(context)
    const messages = [
      ...historyToLlmMessages(history),
      { role: 'user' as const, content: buildConversationalUserTurn(options.query) }
    ]

    try {
      const completion = await llmFn({ messages, system }, { env })
      result = {
        answer: completion.text,
        chunks: retrievalOnly.chunks,
        annChunks: retrievalOnly.annChunks,
        meta: {
          ...retrievalOnly.meta,
          generator_model: completion.model,
          synthesized: true,
          answer_mode: 'generative'
        }
      }
      llmMeta = {
        llm_provider: completion.provider,
        llm_model: completion.model,
        llm_fallback: false
      }
    } catch {
      const fallback = await answerFn(options)
      result = fallback
      llmMeta = {
        llm_provider: resolveProviderName(env),
        llm_model: null,
        llm_fallback: true
      }
    }
  } else {
    result = await answerFn(options)
  }

  await repo.addMessage({
    conversationId,
    role: 'user',
    content: options.query
  })

  const assistant = await repo.addMessage({
    conversationId,
    role: 'assistant',
    content: result.answer,
    retrievalMeta: {
      index_status: result.meta.index_status,
      manifest_digest: result.meta.manifest_digest,
      rerank: result.meta.rerank
    },
    llmMeta: {
      provider: llmMeta.llm_provider,
      model: llmMeta.llm_model,
      fallback: llmMeta.llm_fallback
    }
  })

  return {
    ...result,
    conversation_id: conversationId,
    message_id: assistant.id,
    llm_meta: llmMeta,
    meta: mergeMeta(result.meta, llmMeta)
  }
}

function resolveProviderName(env: NodeJS.ProcessEnv): string | null {
  const provider = (env.LLM_PROVIDER ?? '').trim()
  if (provider) return provider
  if ((env.GEMINI_API_KEY ?? '').trim()) return 'gemini'
  return null
}
