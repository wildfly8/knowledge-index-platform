import {
  computeCorpusDigest,
  isCorpusStale,
  listCorpusFiles
} from '@/lib/knowledge/corpus'
import {
  contentHash,
  embedDimension,
  embedModelName,
  embedQuery
} from '@/lib/knowledge/embed'
import {
  readManifest,
  MANIFEST_VECTOR_ID,
  type IndexStatus,
  type SyncManifest
} from '@/lib/knowledge/manifest'
import { POSTS_PRE_EXAMINED_PREFIX } from '@/lib/knowledge/paths'
import {
  clampCandidatePool,
  defaultCandidatePoolSize,
  rerankModelName,
  scoreQueryPassagePairs
} from '@/lib/knowledge/rerank'
import {
  DEFAULT_MIN_ANN_SCORE,
  DEFAULT_MIN_RERANK_SCORE,
  coerceRerankScore,
  expandRetrievalQuery,
  termOverlapBoost
} from '@/lib/knowledge/retrieve-query'
import { getVectorIndex, isVectorConfigured } from '@/lib/knowledge/vector-client'
import { defaultRerankEnabled } from '@/lib/knowledge/rerank-meta'

export type RetrievalChunk = {
  essay_slug: string
  essay_path: string
  heading: string | null
  chunk_index: number
  text: string
  score: number
}

export type RetrievalMeta = {
  index_status: IndexStatus
  manifest_digest: string | null
  stale: boolean
  model: string
  bi_encoder_model: string
  rerank_model: string | null
  rerank: boolean
}

export type RetrievalResult = {
  chunks: RetrievalChunk[]
  annChunks: RetrievalChunk[]
  meta: RetrievalMeta
}

function isStale(manifest: SyncManifest): boolean {
  return isCorpusStale(manifest)
}

export function getLiveCorpusDigest(): string {
  return computeCorpusDigest()
}

export async function getManifestSummary(): Promise<SyncManifest & { stale: boolean }> {
  const manifest = await readManifest()
  return { ...manifest, stale: isStale(manifest) }
}

function dedupeByEssay(chunks: RetrievalChunk[], topK: number): RetrievalChunk[] {
  const byEssay = new Map<string, RetrievalChunk>()
  for (const chunk of chunks) {
    const existing = byEssay.get(chunk.essay_slug)
    if (!existing || chunk.score > existing.score) {
      byEssay.set(chunk.essay_slug, chunk)
    }
  }
  return [...byEssay.values()]
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
}

function buildMeta(args: {
  manifest: SyncManifest
  stale: boolean
  rerank: boolean
}): RetrievalMeta {
  const biEncoder = embedModelName()
  const rerankModel = args.rerank ? rerankModelName() : null
  return {
    index_status: args.stale ? 'stale' : args.manifest.status,
    manifest_digest: args.manifest.manifest_digest,
    stale: args.stale,
    bi_encoder_model: biEncoder,
    rerank_model: rerankModel,
    rerank: args.rerank,
    model: rerankModel ?? biEncoder
  }
}

function mapAnnHits(
  results: Awaited<ReturnType<ReturnType<typeof getVectorIndex>['query']>>
): RetrievalChunk[] {
  const chunks: RetrievalChunk[] = []
  for (const hit of results) {
    if (hit.id === MANIFEST_VECTOR_ID) continue
    const md = (hit.metadata ?? {}) as Record<string, string | number | null>
    const essay_path = String(md.essay_path ?? '')
    if (essay_path.startsWith(POSTS_PRE_EXAMINED_PREFIX)) continue
    chunks.push({
      essay_slug: String(md.essay_slug ?? ''),
      essay_path,
      heading: md.heading != null ? String(md.heading) : null,
      chunk_index: Number(md.chunk_index ?? 0),
      text: String(md.text ?? ''),
      score: hit.score ?? 0
    })
  }
  return chunks.sort((a, b) => b.score - a.score)
}

function filterRetrievalChunks(
  chunks: RetrievalChunk[],
  rerank: boolean,
  minRerankScore: number
): RetrievalChunk[] {
  if (!rerank) return chunks
  return chunks.filter((c) => c.score >= minRerankScore)
}

export async function retrieveKnowledge(args: {
  query: string
  topK?: number
  minScore?: number
  rerank?: boolean
  candidatePool?: number
  minRerankScore?: number
}): Promise<RetrievalResult> {
  const manifest = await readManifest()
  const stale = isStale(manifest)
  const topK = Math.min(20, Math.max(1, args.topK ?? 5))
  const minScore = args.minScore ?? DEFAULT_MIN_ANN_SCORE
  const minRerankScore = args.minRerankScore ?? DEFAULT_MIN_RERANK_SCORE
  const rerank = args.rerank ?? defaultRerankEnabled()
  const candidatePool = clampCandidatePool(
    args.candidatePool ?? defaultCandidatePoolSize(topK),
    topK
  )
  const biEncoder = embedModelName()

  const emptyMeta = (indexStatus: IndexStatus): RetrievalMeta => ({
    index_status: indexStatus,
    manifest_digest: manifest.manifest_digest,
    stale,
    bi_encoder_model: biEncoder,
    rerank_model: rerank ? rerankModelName() : null,
    rerank,
    model: rerank ? rerankModelName() : biEncoder
  })

  if (!isVectorConfigured()) {
    return {
      chunks: [],
      annChunks: [],
      meta: emptyMeta(manifest.status === 'no_index' ? 'no_index' : manifest.status)
    }
  }

  if (manifest.status === 'no_index' || manifest.status === 'sync_failed') {
    return {
      chunks: [],
      annChunks: [],
      meta: emptyMeta(manifest.status)
    }
  }

  const retrievalQuery = expandRetrievalQuery(args.query)
  const queryVector = await embedQuery(retrievalQuery)
  const index = getVectorIndex()
  const results = await index.query({
    vector: queryVector,
    topK: candidatePool,
    includeMetadata: true,
    includeVectors: false
  })

  const annChunks = mapAnnHits(results)
  let chunks = annChunks.filter((c) => c.score >= minScore)

  if (rerank && chunks.length > 0) {
    const annScores = chunks.map((c) => c.score)
    const ceScores = await scoreQueryPassagePairs(
      retrievalQuery,
      chunks.map((c) => c.text)
    )
    chunks = chunks
      .map((chunk, i) => ({
        ...chunk,
        score: coerceRerankScore(annScores[i] ?? chunk.score, ceScores[i] ?? chunk.score)
      }))
      .sort((a, b) => b.score - a.score)
  }

  chunks = filterRetrievalChunks(chunks, rerank, minRerankScore)
  chunks = chunks
    .map((chunk) => ({
      ...chunk,
      score: chunk.score + termOverlapBoost(args.query, chunk)
    }))
    .sort((a, b) => b.score - a.score)

  const capped = dedupeByEssay(chunks, topK)

  return {
    chunks: capped,
    annChunks: dedupeByEssay(annChunks, Math.max(topK, candidatePool)),
    meta: buildMeta({ manifest, stale, rerank })
  }
}

export { embedDimension, contentHash, listCorpusFiles }
