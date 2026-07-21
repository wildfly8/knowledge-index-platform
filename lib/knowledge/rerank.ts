import { useKnowledgeInferenceWorker } from './inference-mode'
import {
  XENOVA_RERANK_MODEL,
  rerankModelName,
  defaultCandidatePoolSize,
  clampCandidatePool
} from './rerank-meta'

export {
  XENOVA_RERANK_MODEL,
  rerankModelName,
  defaultCandidatePoolSize,
  clampCandidatePool
}

/** Raw classification logits for query–passage pairs (batch). Higher = more relevant. */
export async function scoreQueryPassagePairs(
  query: string,
  passages: string[]
): Promise<number[]> {
  if (passages.length === 0) return []
  if (useKnowledgeInferenceWorker()) {
    const { workerScoreQueryPassagePairs } = await import('./inference-bridge')
    return workerScoreQueryPassagePairs(query, passages)
  }
  const { scoreQueryPassagePairsRuntime } = await import('./rerank-runtime')
  return scoreQueryPassagePairsRuntime(query, passages)
}
