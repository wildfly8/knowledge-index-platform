import fs from 'node:fs'
import path from 'node:path'
import { randomUUID } from 'node:crypto'
import { embedDimension, embedModelName } from '@/lib/knowledge/embed'
import { getVectorIndex, isVectorConfigured } from '@/lib/knowledge/vector-client'

export const MANIFEST_VECTOR_ID = '__manifest__'

export const INDEX_STATUSES = [
  'no_index',
  'stale',
  'sync_pending',
  'sync_running',
  'index_current',
  'sync_failed'
] as const

export type IndexStatus = (typeof INDEX_STATUSES)[number]

export type EmbeddingSyncJobRecord = {
  job_id: string
  trigger: 'deploy_postbuild' | 'manual' | 'ci'
  started_at: string
  finished_at: string | null
  state: IndexStatus
  files_scanned: number
  chunks_written: number
  chunks_deleted: number
  error_stage: 'scan' | 'chunk' | 'embed' | 'upsert' | null
}

export type SyncManifest = {
  provider: 'upstash' | 'neon_pgvector'
  index_name: string
  manifest_digest: string | null
  vector_count: number
  dimension: number
  status: IndexStatus
  last_sync_at: string | null
  last_error: string | null
  model: string
  files: Record<string, { content_hash: string; chunk_count: number }>
  last_job: EmbeddingSyncJobRecord | null
}

const MANIFEST_PATH = path.join(process.cwd(), 'lib/knowledge/sync-manifest.json')

let placeholderVector: number[] | null = null

function manifestPlaceholderVector(): number[] {
  if (!placeholderVector) {
    const dim = embedDimension()
    placeholderVector = Array(dim).fill(0)
    placeholderVector[0] = 1
  }
  return placeholderVector
}

export function defaultManifest(): SyncManifest {
  return {
    provider: 'upstash',
    index_name: 'posts-knowledge-v1',
    manifest_digest: null,
    vector_count: 0,
    dimension: embedDimension(),
    status: 'no_index',
    last_sync_at: null,
    last_error: null,
    model: embedModelName(),
    files: {},
    last_job: null
  }
}

export function parseManifestPayload(data: string): SyncManifest | null {
  try {
    const raw = JSON.parse(data) as SyncManifest
    return { ...defaultManifest(), ...raw }
  } catch {
    return null
  }
}

async function fetchManifestFromUpstash(): Promise<SyncManifest | null> {
  if (!isVectorConfigured()) return null
  try {
    const index = getVectorIndex()
    const rows = await index.fetch([MANIFEST_VECTOR_ID], {
      includeData: true,
      includeMetadata: true
    })
    const row = rows[0]
    if (!row?.data || typeof row.data !== 'string') return null
    return parseManifestPayload(row.data)
  } catch {
    return null
  }
}

async function upsertManifestToUpstash(manifest: SyncManifest): Promise<void> {
  if (!isVectorConfigured()) return
  const index = getVectorIndex()
  await index.upsert({
    id: MANIFEST_VECTOR_ID,
    vector: manifestPlaceholderVector(),
    data: JSON.stringify(manifest),
    metadata: {
      kind: 'manifest',
      status: manifest.status,
      manifest_digest: manifest.manifest_digest ?? '',
      vector_count: manifest.vector_count,
      last_sync_at: manifest.last_sync_at ?? ''
    }
  })
}

export function readManifestLocal(): SyncManifest {
  if (!fs.existsSync(MANIFEST_PATH)) {
    return defaultManifest()
  }
  try {
    const raw = JSON.parse(fs.readFileSync(MANIFEST_PATH, 'utf8')) as SyncManifest
    return { ...defaultManifest(), ...raw }
  } catch {
    return defaultManifest()
  }
}

function writeManifestLocal(manifest: SyncManifest): void {
  fs.mkdirSync(path.dirname(MANIFEST_PATH), { recursive: true })
  fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`, 'utf8')
}

/** Upstash `__manifest__` vector is SSOT when configured; local file is a dev cache. */
export async function readManifest(): Promise<SyncManifest> {
  const remote = await fetchManifestFromUpstash()
  if (remote) return remote
  return readManifestLocal()
}

export async function writeManifest(manifest: SyncManifest): Promise<void> {
  writeManifestLocal(manifest)
  await upsertManifestToUpstash(manifest)
}

export function beginJob(
  trigger: EmbeddingSyncJobRecord['trigger'],
  filesScanned: number
): EmbeddingSyncJobRecord {
  return {
    job_id: randomUUID(),
    trigger,
    started_at: new Date().toISOString(),
    finished_at: null,
    state: 'sync_running',
    files_scanned: filesScanned,
    chunks_written: 0,
    chunks_deleted: 0,
    error_stage: null
  }
}
