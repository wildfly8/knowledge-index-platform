#!/usr/bin/env node
/**
 * Archive embedding backfill — SAGA-BACKFILL-001 implementation (Feature 002).
 *
 * Budgeted daily batch that drains the ChatGPT/Gemini year-archive backlog
 * into Upstash Vector without breaching the provider's daily write cap.
 * Invoked via `npm run embed:backfill` by an operator or the Airflow DAG
 * (airflow/dags/embed_archive_backfill.py) — never by deploy postbuild.
 *
 * Flags:
 *   --dry-run              scan + plan only; zero provider writes
 *   --verify               reconcile manifest cursors against live vectors; zero writes
 *   --essay-path <path>    limit scope (repeatable), e.g. content/posts/unfolding/chatgpt-2023.mdx
 *   --trigger <t>          daily_schedule | manual (default manual; retry inferred from state)
 */

import { loadEnvFiles } from '@/lib/env/load-env'

loadEnvFiles()

import { chunkMdxFile } from './chunk-mdx'
import { embedTexts } from '@/lib/knowledge/embed'
import { readCorpusFile } from '@/lib/knowledge/corpus'
import {
  BudgetMeter,
  assertBudgetValid,
  resolveWriteBudget
} from '@/lib/knowledge/backfill-budget'
import {
  beginBackfillRun,
  committedArchiveVectors,
  readBackfillManifest,
  writeBackfillManifest,
  writeBackfillManifestLocal,
  type BackfillBatchRun,
  type BackfillManifest
} from '@/lib/knowledge/backfill-manifest'
import {
  backfillTransition,
  normalizeBackfillStatusForStart,
  resolveBackfillStartEvent
} from '@/lib/knowledge/backfill-saga'
import {
  assertDisjointFromDeploySync,
  listBackfillArchiveFiles,
  scanBacklog,
  vectorIdsForRange,
  type BacklogDiff
} from '@/lib/knowledge/backfill-scan'
import { chunkVectorPayload } from '@/lib/knowledge/vector-payload'
import { getVectorIndex, isVectorConfigured } from '@/lib/knowledge/vector-client'

const BATCH_SIZE = 16
const DELETE_BATCH_SIZE = 200
const LOG = '[embed:backfill]'

type CliArgs = {
  dryRun: boolean
  verify: boolean
  essayPaths: string[] | null
  trigger: 'daily_schedule' | 'manual'
}

function parseArgs(argv: string[]): CliArgs {
  const args: CliArgs = {
    dryRun: false,
    verify: false,
    essayPaths: null,
    trigger: 'manual'
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry-run') args.dryRun = true
    else if (a === '--verify') args.verify = true
    else if (a === '--essay-path') {
      const value = argv[++i]
      if (!value) throw new Error('--essay-path requires a value')
      args.essayPaths = [...(args.essayPaths ?? []), value.replace(/\\/g, '/')]
    } else if (a === '--trigger') {
      const value = argv[++i]
      if (value === 'daily_schedule' || value === 'manual') args.trigger = value
      else throw new Error(`--trigger must be daily_schedule|manual (got: ${value})`)
    } else {
      throw new Error(`Unknown flag: ${a}`)
    }
  }
  return args
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** FR-006: bounded retry with exponential backoff for embed/upsert/delete. */
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

function logPlan(diff: BacklogDiff, manifest: BackfillManifest) {
  for (const action of diff.actions) {
    if (action.kind === 'embed_new') {
      console.log(`${LOG}   new:      ${action.essay_path}`)
    } else if (action.kind === 'embed_resume') {
      const e = manifest.files[action.essay_path]
      console.log(
        `${LOG}   resume:   ${action.essay_path} (${e.next_chunk_index}/${e.total_chunks})`
      )
    } else if (action.kind === 'reembed_changed') {
      console.log(
        `${LOG}   changed:  ${action.essay_path} (re-embed, old total ${action.old_total_chunks})`
      )
    } else {
      console.log(
        `${LOG}   removed:  ${action.essay_path} (delete ${action.total_chunks} vectors)`
      )
    }
  }
}

/** T016 --verify: sample committed vector ids and reconcile counts. No writes. */
async function runVerify(manifest: BackfillManifest): Promise<number> {
  if (!isVectorConfigured()) {
    console.error(`${LOG} verify requires UPSTASH_VECTOR_* configuration`)
    return 1
  }
  const index = getVectorIndex()
  let failures = 0
  for (const [essayPath, entry] of Object.entries(manifest.files)) {
    if (entry.committed_chunks <= 0) {
      console.log(`${LOG} verify ${essayPath}: 0 committed — skip`)
      continue
    }
    const last = entry.committed_chunks - 1
    const sample = [...new Set([0, Math.floor(last / 2), last])]
    const ids = sample.flatMap((i) => vectorIdsForRange(essayPath, i, i + 1))
    const rows = await index.fetch(ids)
    const missing = ids.filter((_, i) => !rows[i])
    if (missing.length > 0) {
      failures++
      console.error(
        `${LOG} verify ${essayPath}: MISSING ${missing.join(', ')} ` +
          `(cursor says ${entry.committed_chunks} committed)`
      )
    } else {
      console.log(
        `${LOG} verify ${essayPath}: OK (${entry.committed_chunks}/${entry.total_chunks} committed)`
      )
    }
  }
  const total = committedArchiveVectors(manifest)
  console.log(
    `${LOG} verify total: ${total} committed archive vectors ` +
      `(manifest says ${manifest.committed_archive_vectors})`
  )
  if (total !== manifest.committed_archive_vectors) failures++
  return failures === 0 ? 0 : 1
}

async function runBackfill(args: CliArgs): Promise<number> {
  const manifest = await readBackfillManifest()

  if (args.verify) return runVerify(manifest)

  // Stage: validate (FR-002/FR-012 — fail closed before any provider write).
  let budget
  try {
    budget = resolveWriteBudget()
    assertBudgetValid(budget)
    assertDisjointFromDeploySync(
      listBackfillArchiveFiles().map((f) => f.essay_path)
    )
  } catch (err) {
    console.error(`${LOG} validate failed:`, err instanceof Error ? err.message : err)
    return 1
  }

  manifest.provider_daily_cap = budget.provider_daily_cap
  manifest.write_budget = budget.write_budget

  // Stage: scan (FR-001/FR-008/FR-010).
  const diff = scanBacklog(manifest, args.essayPaths)
  const durableStatus = manifest.status
  const recoveredStatus = normalizeBackfillStatusForStart(durableStatus)
  if (recoveredStatus !== durableStatus) {
    console.warn(
      `${LOG} stuck status=${durableStatus} — recovering as ${recoveredStatus} for BF06 resume`
    )
    manifest.status = recoveredStatus
  }
  const startEvent = resolveBackfillStartEvent(manifest.status, {
    archiveContentChanged: diff.archiveContentChanged
  })
  const startEdge = backfillTransition(manifest.status, startEvent)

  console.log(
    `${LOG} status=${manifest.status} event=${startEvent} ` +
      `edge=${startEdge?.id ?? 'none'} actions=${diff.actions.length} ` +
      `budget=${budget.write_budget}/${budget.provider_daily_cap}`
  )
  logPlan(diff, manifest)

  if (diff.drained) {
    // No-op day: backlog already drained and nothing changed.
    if (manifest.status !== 'backlog_complete' && !args.dryRun) {
      manifest.status = 'backlog_complete'
      await writeBackfillManifest(manifest)
    }
    console.log(`${LOG} backlog complete — nothing to do`)
    return 0
  }

  if (args.dryRun) {
    console.log(`${LOG} dry-run — no writes performed`)
    return 0
  }

  if (!isVectorConfigured()) {
    console.error(`${LOG} UPSTASH_VECTOR_* not configured`)
    return 1
  }
  if (!startEdge) {
    console.error(
      `${LOG} no saga transition from ${manifest.status} on ${startEvent} — refusing to run`
    )
    return 1
  }

  const trigger: BackfillBatchRun['trigger'] =
    startEvent === 'batch_retry' ? 'retry' : args.trigger
  const meter = new BudgetMeter(budget)
  const run = beginBackfillRun(trigger, manifest, budget.write_budget, args.essayPaths)
  const index = getVectorIndex()

  manifest.status = startEdge.to // batch_running (BF01/BF06) or backlog_pending re-enqueue
  if (manifest.status !== 'batch_running') {
    // BF07/BF08 re-enqueue lands back in backlog_pending, then BF01 starts the batch.
    manifest.status = 'batch_running'
  }
  manifest.last_run = run
  let stage: NonNullable<BackfillBatchRun['error_stage']> = 'commit'

  try {
    // One bookkeeping write to mark the run as started (SSOT visibility).
    await withRetry(() => writeBackfillManifest(manifest))
    meter.recordBookkeeping(1)

    // Stage 1 — deletions: removed archives and changed-archive overhang.
    for (const action of diff.actions) {
      if (action.kind !== 'delete_removed' && action.kind !== 'reembed_changed') {
        continue
      }
      stage = action.kind === 'delete_removed' ? 'commit' : 'chunk'

      if (action.kind === 'delete_removed') {
        const entry = manifest.files[action.essay_path]
        let remaining = entry.total_chunks
        while (remaining > 0 && meter.remainingChunkCapacity > 0) {
          const n = Math.min(DELETE_BATCH_SIZE, remaining, meter.remainingChunkCapacity)
          const ids = vectorIdsForRange(action.essay_path, remaining - n, remaining)
          stage = 'commit'
          await withRetry(() => index.delete(ids))
          meter.recordDeletes(n)
          run.chunks_deleted += n
          remaining -= n
          entry.total_chunks = remaining
          entry.committed_chunks = Math.min(entry.committed_chunks, remaining)
          entry.next_chunk_index = Math.min(entry.next_chunk_index, remaining)
          writeBackfillManifestLocal(manifest)
        }
        if (remaining === 0) delete manifest.files[action.essay_path]
        continue
      }

      // reembed_changed: chunk the new source, delete tail overhang, reset cursor.
      stage = 'chunk'
      const source = readCorpusFile(action.essay_path)
      const newTotal = chunkMdxFile(action.essay_path, source).length
      const entry = manifest.files[action.essay_path]
      let oldTotal = entry.total_chunks
      let overhangDone = true
      while (oldTotal > newTotal) {
        if (meter.remainingChunkCapacity <= 0) {
          overhangDone = false
          break
        }
        const n = Math.min(
          DELETE_BATCH_SIZE,
          oldTotal - newTotal,
          meter.remainingChunkCapacity
        )
        const ids = vectorIdsForRange(action.essay_path, oldTotal - n, oldTotal)
        stage = 'commit'
        await withRetry(() => index.delete(ids))
        meter.recordDeletes(n)
        run.chunks_deleted += n
        oldTotal -= n
        // Keep the old hash while the overhang survives so the next run
        // re-detects the change and finishes the deletion (crash-safe).
        entry.total_chunks = oldTotal
        entry.committed_chunks = Math.min(entry.committed_chunks, oldTotal)
        writeBackfillManifestLocal(manifest)
      }
      if (overhangDone) {
        manifest.files[action.essay_path] = {
          content_hash: action.content_hash,
          total_chunks: newTotal,
          next_chunk_index: 0,
          committed_chunks: 0
        }
        writeBackfillManifestLocal(manifest)
      }
    }

    // Stage 2 — embed + upsert pending slices, oldest path first (FR-003/FR-004).
    const pendingPaths = Object.keys(manifest.files)
      .filter((p) => !args.essayPaths || args.essayPaths.includes(p))
      .sort()
    // Newly discovered archives are not in manifest.files yet.
    for (const action of diff.actions) {
      if (action.kind === 'embed_new' && !manifest.files[action.essay_path]) {
        stage = 'chunk'
        const total = chunkMdxFile(
          action.essay_path,
          readCorpusFile(action.essay_path)
        ).length
        manifest.files[action.essay_path] = {
          content_hash: action.content_hash,
          total_chunks: total,
          next_chunk_index: 0,
          committed_chunks: 0
        }
        if (!pendingPaths.includes(action.essay_path)) {
          pendingPaths.push(action.essay_path)
          pendingPaths.sort()
        }
      }
    }

    for (const essayPath of pendingPaths) {
      const entry = manifest.files[essayPath]
      if (!entry || entry.next_chunk_index >= entry.total_chunks) continue
      if (meter.remainingChunkCapacity <= 0) break

      stage = 'chunk'
      const chunks = chunkMdxFile(essayPath, readCorpusFile(essayPath))
      if (chunks.length !== entry.total_chunks) {
        // Deterministic chunker + hash-guarded scan should prevent this.
        throw new Error(
          `${essayPath}: chunk count drift (${chunks.length} != ${entry.total_chunks})`
        )
      }

      while (
        entry.next_chunk_index < entry.total_chunks &&
        meter.remainingChunkCapacity > 0
      ) {
        const size = Math.min(BATCH_SIZE, meter.remainingChunkCapacity)
        const batch = chunks.slice(
          entry.next_chunk_index,
          entry.next_chunk_index + size
        )
        stage = 'embed'
        const vectors = await withRetry(() => embedTexts(batch.map((c) => c.text)))
        stage = 'upsert'
        const upserts = batch.map((chunk, idx) => ({
          ...chunkVectorPayload(chunk),
          vector: vectors[idx]
        }))
        await withRetry(() => index.upsert(upserts))
        meter.recordUpserts(batch.length)
        run.chunks_upserted += batch.length
        entry.next_chunk_index += batch.length
        entry.committed_chunks = entry.next_chunk_index
        // Micro-batch commit (T014): local persist is free and crash-safe;
        // the remote SSOT is updated at run start/end (bookkeeping reserve).
        writeBackfillManifestLocal(manifest)
      }
      console.log(
        `${LOG} ${essayPath}: ${entry.committed_chunks}/${entry.total_chunks} committed`
      )
    }

    // Stage: commit (BF02 → BF03/BF04).
    stage = 'commit'
    const remainingAfter = scanBacklog(manifest, args.essayPaths)
    const commitEdge = backfillTransition('batch_running', 'batch_upsert_ok')!
    const finalEvent = remainingAfter.drained ? 'backlog_drained' : 'backlog_remaining'
    const finalEdge = backfillTransition(commitEdge.to, finalEvent)!

    run.state = finalEdge.to
    run.finished_at = new Date().toISOString()
    run.cursor_after = committedArchiveVectors(manifest)
    run.budget_spent = meter.spent + 1 // + the final manifest write below
    manifest.status = finalEdge.to
    manifest.last_run = run
    await withRetry(() => writeBackfillManifest(manifest))
    meter.recordBookkeeping(1)

    console.log(
      `${LOG} ${finalEdge.id}: ${finalEdge.to} — upserted ${run.chunks_upserted}, ` +
        `deleted ${run.chunks_deleted}, spent ${meter.spent}/${budget.write_budget}, ` +
        `cursor ${run.cursor_before} → ${run.cursor_after}`
    )
    return 0
  } catch (err) {
    // BF05: batch_error → batch_failed (compensation: retry next run via BF06).
    const message = err instanceof Error ? err.message : String(err)
    run.state = 'batch_failed'
    run.finished_at = new Date().toISOString()
    run.cursor_after = committedArchiveVectors(manifest)
    run.budget_spent = meter.spent
    run.error_stage = stage
    run.error_message = message
    manifest.status = 'batch_failed'
    manifest.last_run = run
    writeBackfillManifestLocal(manifest)
    try {
      await writeBackfillManifest(manifest)
    } catch (writeErr) {
      // Quota exhaustion can reject this write too — never let it escape,
      // or the remote manifest freezes at batch_running.
      console.error(
        `${LOG} could not record batch_failed manifest:`,
        writeErr instanceof Error ? writeErr.message : String(writeErr)
      )
    }
    console.error(`${LOG} BF05 failed at stage=${stage}:`, message)
    return 1
  }
}

let args: CliArgs
try {
  args = parseArgs(process.argv.slice(2))
} catch (err) {
  console.error(`${LOG}`, err instanceof Error ? err.message : err)
  process.exit(1)
}

runBackfill(args)
  .then((code) => process.exit(code))
  .catch((err) => {
    console.error(`${LOG} fatal:`, err instanceof Error ? err.message : err)
    process.exit(1)
  })
