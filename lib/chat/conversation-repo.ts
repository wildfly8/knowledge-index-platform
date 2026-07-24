import type { NeonQueryFunction } from '@neondatabase/serverless'
import { getSql } from '@/lib/db/neon'

export type ConversationRole = 'user' | 'assistant' | 'system'

export type ConversationRow = {
  id: string
  title: string | null
  created_at: string
  updated_at: string
}

export type MessageRow = {
  id: string
  conversation_id: string
  role: ConversationRole
  content: string
  retrieval_meta: Record<string, unknown> | null
  llm_meta: Record<string, unknown> | null
  created_at: string
}

export type ListMessagesOptions = {
  limit?: number
  before?: string
}

export class ConversationRepo {
  constructor(private readonly sql: NeonQueryFunction<false, false>) {}

  static fromEnv(env: NodeJS.ProcessEnv = process.env): ConversationRepo {
    return new ConversationRepo(getSql(env))
  }

  async createConversation(title?: string | null): Promise<ConversationRow> {
    const rows = await this.sql<ConversationRow>`
      INSERT INTO conversations (title)
      VALUES (${title ?? null})
      RETURNING id, title, created_at::text, updated_at::text
    `
    return rows[0]
  }

  async getConversation(id: string): Promise<ConversationRow | null> {
    const rows = await this.sql<ConversationRow>`
      SELECT id, title, created_at::text, updated_at::text
      FROM conversations
      WHERE id = ${id}::uuid
      LIMIT 1
    `
    return rows[0] ?? null
  }

  async touchConversation(id: string): Promise<void> {
    await this.sql`
      UPDATE conversations SET updated_at = now() WHERE id = ${id}::uuid
    `
  }

  async addMessage(input: {
    conversationId: string
    role: ConversationRole
    content: string
    retrievalMeta?: Record<string, unknown> | null
    llmMeta?: Record<string, unknown> | null
  }): Promise<MessageRow> {
    const rows = await this.sql<MessageRow>`
      INSERT INTO conversation_messages (
        conversation_id, role, content, retrieval_meta, llm_meta
      )
      VALUES (
        ${input.conversationId}::uuid,
        ${input.role},
        ${input.content},
        ${input.retrievalMeta ? JSON.stringify(input.retrievalMeta) : null}::jsonb,
        ${input.llmMeta ? JSON.stringify(input.llmMeta) : null}::jsonb
      )
      RETURNING
        id,
        conversation_id,
        role,
        content,
        retrieval_meta,
        llm_meta,
        created_at::text
    `
    await this.touchConversation(input.conversationId)
    return rows[0]
  }

  async listMessages(
    conversationId: string,
    options: ListMessagesOptions = {}
  ): Promise<MessageRow[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 200)
    if (options.before) {
      return this.sql<MessageRow>`
        SELECT
          id,
          conversation_id,
          role,
          content,
          retrieval_meta,
          llm_meta,
          created_at::text
        FROM conversation_messages
        WHERE conversation_id = ${conversationId}::uuid
          AND created_at < (
            SELECT created_at FROM conversation_messages WHERE id = ${options.before}::uuid
          )
        ORDER BY created_at ASC
        LIMIT ${limit}
      `
    }
    return this.sql<MessageRow>`
      SELECT
        id,
        conversation_id,
        role,
        content,
        retrieval_meta,
        llm_meta,
        created_at::text
      FROM conversation_messages
      WHERE conversation_id = ${conversationId}::uuid
      ORDER BY created_at ASC
      LIMIT ${limit}
    `
  }
}
