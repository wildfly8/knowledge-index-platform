/**
 * Deploy-sync planning (Feature 001) — used by `embed:sync --dry-run` and unit tests.
 */

import { computeCorpusDigest, type CorpusFile } from '@/lib/knowledge/corpus'
import {
  resolveEmbedEventForSync,
  type EmbedSagaEvent
} from '@/lib/knowledge/embed-saga'
import type { SyncManifest } from '@/lib/knowledge/manifest'

export interface SyncPlan {
  digest: string
  corpusFileCount: number
  priorStatus: SyncManifest['status']
  event: EmbedSagaEvent | null
  wouldSkip: boolean
  skipEdgeId: 'EM09' | null
  toProcess: string[]
  removed: string[]
  vectorConfigured: boolean
}

export function filesNeedingWork(
  manifest: SyncManifest,
  corpus: CorpusFile[]
): string[] {
  if (!manifest.manifest_digest || manifest.status === 'no_index') {
    return corpus.map((f) => f.essay_path)
  }
  return corpus
    .filter((f) => manifest.files[f.essay_path]?.content_hash !== f.content_hash)
    .map((f) => f.essay_path)
}

export function removedEssayPaths(
  manifest: SyncManifest,
  corpus: CorpusFile[]
): string[] {
  const live = new Set(corpus.map((f) => f.essay_path))
  return Object.keys(manifest.files).filter((p) => !live.has(p))
}

export function computeSyncPlan(
  prior: SyncManifest,
  corpus: CorpusFile[],
  vectorConfigured: boolean
): SyncPlan {
  const digest = computeCorpusDigest(corpus)
  const digestUnchanged =
    prior.manifest_digest === digest && prior.status === 'index_current'
  const digestChanged =
    prior.manifest_digest != null &&
    prior.manifest_digest !== digest &&
    prior.status === 'index_current'

  const event = resolveEmbedEventForSync({
    priorStatus: prior.status,
    digestChanged,
    digestUnchanged
  })

  const wouldSkip = event === 'posts_digest_unchanged'

  return {
    digest,
    corpusFileCount: corpus.length,
    priorStatus: prior.status,
    event,
    wouldSkip,
    skipEdgeId: wouldSkip ? 'EM09' : null,
    toProcess: wouldSkip ? [] : filesNeedingWork(prior, corpus),
    removed: wouldSkip ? [] : removedEssayPaths(prior, corpus),
    vectorConfigured
  }
}
