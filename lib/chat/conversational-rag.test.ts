import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  conversationalAnswer,
  shouldPersistConversation
} from '@/lib/chat/conversational-rag'
import type { ChatAnswerResult } from '@/lib/knowledge/chat-core'
import type { ConversationRepo } from '@/lib/chat/conversation-repo'

const baseResult: ChatAnswerResult = {
  answer: 'extractive answer',
  chunks: [],
  annChunks: [],
  meta: {
    index_status: 'index_current',
    manifest_digest: 'sha256:abc',
    stale: false,
    bi_encoder_model: 'x',
    rerank_model: 'y',
    rerank: true,
    model: 'y',
    generator_model: null,
    synthesized: false,
    answer_mode: 'extractive'
  }
}

function makeRepo(): ConversationRepo {
  const messages: Array<{
    id: string
    conversation_id: string
    role: 'user' | 'assistant'
    content: string
    retrieval_meta: null
    llm_meta: null
    created_at: string
  }> = []
  let conversationId = 'conv-1'

  return {
    createConversation: async (title) => ({
      id: conversationId,
      title: title ?? null,
      created_at: 't0',
      updated_at: 't0'
    }),
    getConversation: async (id) =>
      id === conversationId
        ? {
            id: conversationId,
            title: null,
            created_at: 't0',
            updated_at: 't0'
          }
        : null,
    touchConversation: async () => {},
    addMessage: async (input) => {
      const row = {
        id: `msg-${messages.length + 1}`,
        conversation_id: input.conversationId,
        role: input.role,
        content: input.content,
        retrieval_meta: null,
        llm_meta: null,
        created_at: `t${messages.length + 1}`
      }
      messages.push(row)
      return row
    },
    listMessages: async () => messages
  } as unknown as ConversationRepo
}

describe('conversational-rag', () => {
  it('stays stateless when no conversation id or title', async () => {
    assert.equal(shouldPersistConversation({}), false)
    const result = await conversationalAnswer(
      { query: 'what is catamorphism' },
      {
        answerWithRagFn: async () => baseResult,
        env: {}
      }
    )
    assert.equal(result.conversation_id, null)
    assert.equal(result.message_id, null)
  })

  it('persists turns when title is provided', async () => {
    const result = await conversationalAnswer(
      { query: 'what is catamorphism', title: 'thread' },
      {
        repo: makeRepo(),
        answerWithRagFn: async () => baseResult,
        env: { POSTGRES_URL: 'postgresql://example' }
      }
    )
    assert.equal(result.conversation_id, 'conv-1')
    assert.ok(result.message_id)
  })

  it('falls back to extractive when external LLM fails', async () => {
    const result = await conversationalAnswer(
      { query: 'q', title: 't', useExternalLlm: true },
      {
        repo: makeRepo(),
        answerWithRagFn: async () => baseResult,
        completeWithProviderFn: async () => {
          throw new Error('llm down')
        },
        env: {
          POSTGRES_URL: 'postgresql://example',
          LLM_PROVIDER: 'gemini',
          GEMINI_API_KEY: 'k'
        }
      }
    )
    assert.equal(result.llm_meta.llm_fallback, true)
    assert.equal(result.answer, 'extractive answer')
  })
})
