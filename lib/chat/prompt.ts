import type { LlmMessage } from '@/lib/chat/llm/types'
import type { RetrievalChunk } from '@/lib/knowledge/retrieval-types'
import { cleanPassageText } from '@/lib/knowledge/extractive'

const DEFAULT_HISTORY_LIMIT = 12
const DEFAULT_CHUNK_CHARS = 1200

export function buildRetrievalContext(
  chunks: RetrievalChunk[],
  maxChunkChars = DEFAULT_CHUNK_CHARS
): string {
  if (chunks.length === 0) {
    return 'No relevant passages were retrieved from the indexed corpus.'
  }

  return chunks
    .map((chunk, index) => {
      const title = chunk.heading
        ? `${chunk.essay_slug} — ${chunk.heading}`
        : chunk.essay_slug || chunk.essay_path || `passage-${index + 1}`
      const text = cleanPassageText(chunk.text).slice(0, maxChunkChars)
      const ellipsis = cleanPassageText(chunk.text).length > maxChunkChars ? '…' : ''
      return `[${index + 1}] ${title}\n${text}${ellipsis}`
    })
    .join('\n\n')
}

export function buildConversationalSystemPrompt(context: string): string {
  return [
    'You answer questions using only the retrieved essay passages below.',
    'Cite passage numbers like [1] when you rely on a source.',
    'If the passages do not contain enough information, say so briefly.',
  ].join(' ')
    .concat('\n\nRetrieved passages:\n')
    .concat(context)
}

export function historyToLlmMessages(
  history: Array<{ role: 'user' | 'assistant'; content: string }>,
  limit = DEFAULT_HISTORY_LIMIT
): LlmMessage[] {
  const slice = history.slice(-limit)
  return slice.map((row) => ({ role: row.role, content: row.content }))
}

export function buildConversationalUserTurn(query: string): string {
  return query.trim()
}
