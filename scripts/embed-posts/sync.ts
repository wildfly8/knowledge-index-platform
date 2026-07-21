#!/usr/bin/env node
/**
 * Post corpus embedding sync — SAGA-EMBED-001 implementation.
 * Invoked via `npm run embed:sync` (operator/CI).
 */

import { loadEnvFiles } from '@/lib/env/load-env'

loadEnvFiles()

import {
  computeCorpusDigest,
  listCorpusFiles,
  readCorpusFile
} from '@/lib/knowledge/corpus'
import { chunkMdxFile } from './chunk-mdx'
import {
  embedDimension,
  embedModelName,
  embedTexts
} from '@/lib/knowledge/embed'
import {
  beginJob,
  readManifest,
  writeManifest,
  type SyncManifest
} from '@/lib/knowledge/manifest'
import { POSTS_PRE_EXAMINED_PREFIX, vectorIdForChunk } from '@/lib/knowledge/paths'
import { chunkVectorPayload } from '@/lib/knowledge/vector-payload'
import { isVectorConfigured, getVectorIndex } from '@/lib/knowledge/vector-client'
import { resolveEmbedEventForSync } from '@/lib/knowledge/embed-saga'

const BATCH_SIZE = 16
const PRE_EXAMINED_PREFIX = POSTS_PRE_EXAMINED_PREFIX

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

async function withRetry<T>(fn: () => Promise<T>, attempts = 3): Promise<T> {
  let last: unknown
  for (let i = 0; i < attempts; i++) {
    try {
      return await fn()
    } catch (err) {
      last = err
      if (i < attempts - 1) await sleep(500 * 2 ** i)
    }
  }
  throw last
}

function syncRequired(): boolean {
  return process.env.EMBED_SYNC_REQUIRED === 'true'
}

function syncOptional(): boolean {
  return process.env.EMBED_SYNC_OPTIONAL === 'true' || !syncRequired()
}

function filesNeedingWork(
  manifest: SyncManifest,
  corpus: ReturnType<typeof listCorpusFiles>
): string[] {
  if (!manifest.manifest_digest || manifest.status === 'no_index') {
    return corpus.map((f) => f.essay_path)
  }
  return corpus
    .filter((f) => manifest.files[f.essay_path]?.content_hash !== f.content_hash)
    .map((f) => f.essay_path)
}

function removedEssayPaths(manifest: SyncManifest, corpus: ReturnType<typeof listCorpusFiles>) {
  const live = new Set(corpus.map((f) => f.essay_path))
  return Object.keys(manifest.files).filter((p) => !live.has(p))
}

async function purgePreExamined(index: ReturnType<typeof getVectorIndex>) {
  const manifest = await readManifest()
  for (const essayPath of Object.keys(manifest.files)) {
    if (!essayPath.startsWith(PRE_EXAMINED_PREFIX)) continue
    const count = manifest.files[essayPath]?.chunk_count ?? 0
    const slug = essayPath.replace(/^content\//, '').replace(/\.(mdx|md|txt)$/, '')
    const essaySlug = `/${slug}`
    const ids = Array.from({ length: count }, (_, i) =>
      vectorIdForChunk(essaySlug, i)
    )
    if (ids.length) await withRetry(() => index.delete(ids))
    delete manifest.files[essayPath]
  }
  await writeManifest(manifest)
}

async function deleteEssayVectors(
  index: ReturnType<typeof getVectorIndex>,
  essayPath: string,
  chunkCount: number,
  essaySlug: string
) {
  if (chunkCount <= 0) return
  const ids = Array.from({ length: chunkCount }, (_, i) =>
    vectorIdForChunk(essaySlug, i)
  )
  await withRetry(() => index.delete(ids))
  void essayPath
}

async function runSync(trigger: 'deploy_postbuild' | 'manual' | 'ci' = 'deploy_postbuild') {
  const corpus = listCorpusFiles()
  const digest = computeCorpusDigest(corpus)
  const prior = await readManifest()
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

  if (event === 'posts_digest_unchanged') {
    console.log('[embed:sync] EM09: digest unchanged — skip sync')
    return 0
  }

  if (!isVectorConfigured()) {
    const msg = '[embed:sync] UPSTASH_VECTOR_* not configured'
    if (syncOptional()) {
      console.warn(`${msg} — skipping (optional)`)
      return 0
    }
    console.error(msg)
    return 1
  }

  const job = beginJob(trigger, corpus.length)
  const manifest: SyncManifest = {
    ...prior,
    status: 'sync_running',
    model: embedModelName(),
    dimension: embedDimension(),
    last_job: job,
    last_error: null
  }

  try {
    await writeManifest(manifest)
    const index = getVectorIndex()
    await purgePreExamined(index)

    const toProcess = filesNeedingWork(prior, corpus)
    const removed = removedEssayPaths(prior, corpus)

    for (const essayPath of removed) {
      const fileMeta = prior.files[essayPath]
      const slug = essayPath.replace(/^content\//, '').replace(/\.(mdx|md|txt)$/, '')
      await deleteEssayVectors(
        index,
        essayPath,
        fileMeta?.chunk_count ?? 0,
        `/${slug}`
      )
      job.chunks_deleted += fileMeta?.chunk_count ?? 0
      delete manifest.files[essayPath]
    }

    let chunksWritten = 0

    for (const essayPath of toProcess) {
      const source = readCorpusFile(essayPath)
      const chunks = chunkMdxFile(essayPath, source)

      for (let i = 0; i < chunks.length; i += BATCH_SIZE) {
        const batch = chunks.slice(i, i + BATCH_SIZE)
        const vectors = await withRetry(() => embedTexts(batch.map((c) => c.text)))
        const upserts = batch.map((chunk, idx) => ({
          ...chunkVectorPayload(chunk),
          vector: vectors[idx]
        }))
        await withRetry(() => index.upsert(upserts))
        chunksWritten += batch.length
      }

      manifest.files[essayPath] = {
        content_hash: corpus.find((f) => f.essay_path === essayPath)!.content_hash,
        chunk_count: chunks.length
      }
    }

    job.chunks_written = chunksWritten
    job.finished_at = new Date().toISOString()
    job.state = 'index_current'

    manifest.vector_count = Object.values(manifest.files).reduce(
      (n, f) => n + f.chunk_count,
      0
    )
    manifest.manifest_digest = digest
    manifest.status = 'index_current'
    manifest.last_sync_at = job.finished_at
    manifest.last_job = job
    await writeManifest(manifest)

    console.log(
      `[embed:sync] complete: ${chunksWritten} chunks, ${corpus.length} files, digest ${digest.slice(0, 19)}…`
    )
    return 0
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    job.finished_at = new Date().toISOString()
    job.state = 'sync_failed'
    job.error_stage = 'upsert'
    manifest.status = 'sync_failed'
    manifest.last_error = message
    manifest.last_job = job
    try {
      await writeManifest(manifest)
    } catch (writeErr) {
      // Quota exhaustion can reject this write too (it is an Upstash upsert);
      // don't let it escape the catch block, or the remote manifest stays
      // frozen at 'sync_running' and the process crashes unhandled.
      const writeMessage =
        writeErr instanceof Error ? writeErr.message : String(writeErr)
      console.error(
        '[embed:sync] could not record sync_failed manifest:',
        writeMessage
      )
    }
    console.error('[embed:sync] failed:', message)
    return syncOptional() ? 0 : 1
  }
}

const triggerArg = process.argv[2]
const trigger =
  triggerArg === 'manual' || triggerArg === 'ci' ? triggerArg : 'deploy_postbuild'

runSync(trigger)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error('[embed:sync] fatal:', err instanceof Error ? err.message : err)
    process.exit(syncOptional() ? 0 : 1)
  })
