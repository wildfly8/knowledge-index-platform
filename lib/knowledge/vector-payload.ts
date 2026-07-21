import { vectorIdForChunk } from '@/lib/knowledge/paths'

export function chunkVectorPayload(chunk: {
  essay_path: string
  essay_slug: string
  heading: string | null
  chunk_index: number
  text: string
  content_hash: string
  token_estimate: number
}) {
  return {
    id: vectorIdForChunk(chunk.essay_slug, chunk.chunk_index),
    data: chunk.text.slice(0, 4000),
    metadata: {
      essay_path: chunk.essay_path,
      essay_slug: chunk.essay_slug,
      heading: chunk.heading,
      chunk_index: chunk.chunk_index,
      content_hash: chunk.content_hash,
      token_estimate: chunk.token_estimate,
      text: chunk.text.slice(0, 2000)
    }
  }
}
