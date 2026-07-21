import { Index } from '@upstash/vector'
import { vectorRestToken, vectorRestUrl } from '@/lib/env/load-env'

let index: Index | null = null

export function isVectorConfigured(): boolean {
  return Boolean(vectorRestUrl() && vectorRestToken())
}

export function getVectorIndex(): Index {
  const url = vectorRestUrl()
  const token = vectorRestToken()
  if (!url || !token) {
    throw new Error(
      'UPSTASH_VECTOR_REST_URL and UPSTASH_VECTOR_REST_TOKEN are required ' +
        '(or RAG_UPSTASH_VECTOR_REST_* from Vercel Upstash integration)'
    )
  }
  if (!index) {
    index = new Index({ url, token })
  }
  return index
}
