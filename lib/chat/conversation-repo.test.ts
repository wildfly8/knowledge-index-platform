import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import type { NeonQueryFunction } from '@neondatabase/serverless'
import { ConversationRepo } from '@/lib/chat/conversation-repo'

function normalizeSql(strings: TemplateStringsArray): string {
  return strings.join('?').replace(/\s+/g, ' ').trim()
}

function makeRepo(
  handlers: Record<string, (values: unknown[]) => unknown>
): ConversationRepo {
  const sql = (async (
    strings: TemplateStringsArray,
    ...values: unknown[]
  ) => {
    const key = normalizeSql(strings)
    const handler =
      handlers[key] ??
      Object.entries(handlers).find(([pattern]) => key.includes(pattern))?.[1]
    if (!handler) {
      throw new Error(`unexpected query: ${key}`)
    }
    return handler(values)
  }) as NeonQueryFunction<false, false>

  return new ConversationRepo(sql)
}

describe('ConversationRepo', () => {
  it('creates a conversation', async () => {
    const repo = makeRepo({
      'INSERT INTO conversations': () => [
        {
          id: '11111111-1111-1111-1111-111111111111',
          title: 'Test',
          created_at: '2026-01-01T00:00:00Z',
          updated_at: '2026-01-01T00:00:00Z'
        }
      ]
    })

    const row = await repo.createConversation('Test')
    assert.equal(row.id, '11111111-1111-1111-1111-111111111111')
    assert.equal(row.title, 'Test')
  })

  it('returns null for missing conversation', async () => {
    const repo = makeRepo({
      'FROM conversations': () => []
    })

    const row = await repo.getConversation('22222222-2222-2222-2222-222222222222')
    assert.equal(row, null)
  })

  it('lists messages in chronological order', async () => {
    const repo = makeRepo({
      'FROM conversation_messages': () => [
        {
          id: 'a',
          conversation_id: 'c',
          role: 'user',
          content: 'hi',
          retrieval_meta: null,
          llm_meta: null,
          created_at: 't1'
        },
        {
          id: 'b',
          conversation_id: 'c',
          role: 'assistant',
          content: 'hello',
          retrieval_meta: null,
          llm_meta: null,
          created_at: 't2'
        }
      ]
    })

    const rows = await repo.listMessages('c', { limit: 50 })
    assert.equal(rows.length, 2)
    assert.equal(rows[0].role, 'user')
    assert.equal(rows[1].role, 'assistant')
  })
})
