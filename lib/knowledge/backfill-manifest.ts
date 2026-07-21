/**
 * Embedding Backfill Plan persistence (Feature 002).
 * SSOT: Upstash control vector `__backfill_manifest__`; local JSON is a dev
 * cache that also carries the cursor across a hard-killed run (crash-ahead).
 *
 * Single-writer split (INV-BACKFILL-003): this module MUST NOT touch Feature
 * 005's `__manifest__` — deploy sync and archive backfill share the Upstash
 * index but own disjoint control records and disjoint file scopes.
 */
import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { XENOVA_DIMENSION } from '@/lib/knowledge/embed-meta'
import {
  isStuckBackfillRunStatus,
  type BackfillProcessState
} from '@/lib/knowledge/backfill-saga'
import {
  DEFAULT_PROVIDER_DAILY_CAP,
  DEFAULT_WRITE_BUDGET
} from '@/lib/knowledge/backfill-budget'
import { getVectorIndex, isVectorConfigured } from '@/lib/knowledge/vector-client'

export const BACKFILL_MANIFEST_VECTOR_ID = '__backfill_manifest__'

export type BackfillFileEntry = {
  content_hash: string
  total_chunks: number
  next_chunk_index: number
  committed_chunks: number
}

export type BackfillBatchRun = {
  run_id: string
  trigger: 'daily_schedule' | 'manual' | 'retry'
  run_date_utc: string
  started_at: string
  finished_at: string | null
  state: BackfillProcessState
  cursor_before: number
  cursor_after: number
  chunks_upserted: number
  chunks_deleted: number
  budget_spent: number
  budget_limit: number
  error_stage: 'validate' | 'scan' | 'chunk' | 'embed' | 'upsert' | 'commit' | null
  error_message: string | null
  essay_paths_filter: string[] | null
}

export type BackfillManifest = {
  status: BackfillProcessState
  provider_daily_cap: number
  write_budget: number
  files: Record<string, BackfillFileEntry>
  committed_archive_vectors: number
  last_run: BackfillBatchRun | null
  updated_at: string | null
}

const LOCAL_PATH = path.join(process.cwd(), 'lib/knowledge/backfill-manifest.json')

let placeholderVector: number[] | null = null

function manifestPlaceholderVector(): number[] {
  if (!placeholderVector) {
    placeholderVector = Array(XENOVA_DIMENSION).fill(0)
    placeholderVector[0] = 1
  }
  return placeholderVector
}

export function defaultBackfillManifest(): BackfillManifest {
  return {
    status: 'backlog_pending',
    provider_daily_cap: DEFAULT_PROVIDER_DAILY_CAP,
    write_budget: DEFAULT_WRITE_BUDGET,
    files: {},
    committed_archive_vectors: 0,
    last_run: null,
    updated_at: null
  }
}

export function committedArchiveVectors(manifest: BackfillManifest): number {
  return Object.values(manifest.files).reduce(
    (n, f) => n + f.committed_chunks,
    0
  )
}

function parsePayload(data: string): BackfillManifest | null {
  try {
    const raw = JSON.parse(data) as BackfillManifest
    return { ...defaultBackfillManifest(), ...raw }
  } catch {
    return null
  }
}

async function fetchFromUpstash(): Promise<BackfillManifest | null> {
  if (!isVectorConfigured()) return null
  try {
    const index = getVectorIndex()
    const rows = await index.fetch([BACKFILL_MANIFEST_VECTOR_ID], {
      includeData: true,
      includeMetadata: true
    })
    const row = rows[0]
    if (!row?.data || typeof row.data !== 'string') return null
    return parsePayload(row.data)
  } catch {
    return null
  }
}

async function upsertToUpstash(manifest: BackfillManifest): Promise<void> {
  if (!isVectorConfigured()) return
  const index = getVectorIndex()
  await index.upsert({
    id: BACKFILL_MANIFEST_VECTOR_ID,
    vector: manifestPlaceholderVector(),
    data: JSON.stringify(manifest),
    metadata: {
      kind: 'backfill_manifest',
      status: manifest.status,
      committed_archive_vectors: manifest.committed_archive_vectors,
      updated_at: manifest.updated_at ?? ''
    }
  })
}

export function readBackfillManifestLocal(): BackfillManifest {
  if (!fs.existsSync(LOCAL_PATH)) return defaultBackfillManifest()
  const parsed = parsePayload(fs.readFileSync(LOCAL_PATH, 'utf8'))
  return parsed ?? defaultBackfillManifest()
}

export function writeBackfillManifestLocal(manifest: BackfillManifest): void {
  fs.mkdirSync(path.dirname(LOCAL_PATH), { recursive: true })
  fs.writeFileSync(LOCAL_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/**
 * Prefer whichever cursor is further ahead per file (same content hash).
 * A hard-killed run persists local micro-batch commits that never reached the
 * remote manifest; replaying them is idempotent but wastes budget (SC-003).
 *
 * When the remote status is stuck in a transient run state and the local cache
 * already recorded `batch_failed` (BF05 status write rejected by quota), keep
 * the local status so the next schedule can take BF06 instead of refusing.
 */
export function mergeCursors(
  remote: BackfillManifest,
  local: BackfillManifest
): BackfillManifest {
  const merged: BackfillManifest = {
    ...remote,
    files: { ...remote.files }
  }
  for (const [essayPath, localEntry] of Object.entries(local.files)) {
    const remoteEntry = merged.files[essayPath]
    if (
      remoteEntry &&
      remoteEntry.content_hash === localEntry.content_hash &&
      localEntry.committed_chunks > remoteEntry.committed_chunks
    ) {
      merged.files[essayPath] = { ...localEntry }
    }
  }
  if (
    isStuckBackfillRunStatus(remote.status) &&
    local.status === 'batch_failed'
  ) {
    merged.status = 'batch_failed'
    if (local.last_run) merged.last_run = local.last_run
  }
  merged.committed_archive_vectors = committedArchiveVectors(merged)
  return merged
}

/** Remote `__backfill_manifest__` is SSOT; local cache may be ahead after a crash. */
export async function readBackfillManifest(): Promise<BackfillManifest> {
  const local = readBackfillManifestLocal()
  const remote = await fetchFromUpstash()
  if (!remote) return local
  return mergeCursors(remote, local)
}

/** Costs one provider write when Upstash is configured — meter as bookkeeping. */
export async function writeBackfillManifest(
  manifest: BackfillManifest
): Promise<void> {
  manifest.committed_archive_vectors = committedArchiveVectors(manifest)
  manifest.updated_at = new Date().toISOString()
  writeBackfillManifestLocal(manifest)
  await upsertToUpstash(manifest)
}

export function beginBackfillRun(
  trigger: BackfillBatchRun['trigger'],
  manifest: BackfillManifest,
  budgetLimit: number,
  essayPathsFilter: string[] | null
): BackfillBatchRun {
  const now = new Date()
  return {
    run_id: randomUUID(),
    trigger,
    run_date_utc: now.toISOString().slice(0, 10),
    started_at: now.toISOString(),
    finished_at: null,
    state: 'batch_running',
    cursor_before: committedArchiveVectors(manifest),
    cursor_after: committedArchiveVectors(manifest),
    chunks_upserted: 0,
    chunks_deleted: 0,
    budget_spent: 0,
    budget_limit: budgetLimit,
    error_stage: null,
    error_message: null,
    essay_paths_filter: essayPathsFilter
  }
}
