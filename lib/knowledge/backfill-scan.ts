/**
 * Archive scan + backlog diff for Feature 002 (FR-001, FR-008, FR-009, FR-010).
 *
 * Backfill scope = ChatGPT / Gemini *year* archives only
 * (`content/posts/unfolding/{chatgpt,gemini}-YYYY.mdx`, content sourced from
 * `data/` via the corpus resolver). Index stubs (`chatgpt.mdx`) and ISR part
 * stubs (`chatgpt-YYYY-pN.mdx`) render slices of the same year archive and are
 * never embedded. Deploy sync (Feature 001) excludes this entire scope, so the
 * two pipelines write disjoint vector-id sets (INV-BACKFILL-003).
 */
import fs from 'node:fs'
import path from 'node:path'
import { contentHash } from '@/lib/knowledge/embed-meta'
import {
  REPO_ROOT,
  essayPathToSlug,
  isConversationArchivePath,
  isInScopePostPath,
  vectorIdForChunk
} from '@/lib/knowledge/paths'
import { readCorpusFile } from '@/lib/knowledge/corpus'
import type {
  BackfillFileEntry,
  BackfillManifest
} from '@/lib/knowledge/backfill-manifest'

const BACKFILL_ARCHIVE_RE =
  /^content\/posts\/unfolding\/(chatgpt|gemini)-20\d{2}\.mdx$/i

export function isBackfillArchivePath(relativePath: string): boolean {
  return BACKFILL_ARCHIVE_RE.test(relativePath.replace(/\\/g, '/'))
}

export type ArchiveFile = {
  essay_path: string
  essay_slug: string
  content_hash: string
}

/** Live year archives in backfill scope (hashes from the resolved data/ source). */
export function listBackfillArchiveFiles(): ArchiveFile[] {
  const dir = path.join(REPO_ROOT, 'content/posts/unfolding')
  if (!fs.existsSync(dir)) return []
  const files: ArchiveFile[] = []
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const rel = `content/posts/unfolding/${entry.name}`
    if (!isBackfillArchivePath(rel)) continue
    files.push({
      essay_path: rel,
      essay_slug: essayPathToSlug(rel),
      content_hash: contentHash(readCorpusFile(rel))
    })
  }
  files.sort((a, b) => a.essay_path.localeCompare(b.essay_path))
  return files
}

export type BackfillAction =
  /** New archive (or first run): embed from chunk 0. */
  | { kind: 'embed_new'; essay_path: string; content_hash: string }
  /** Same hash, cursor short of total: continue from next_chunk_index. */
  | { kind: 'embed_resume'; essay_path: string; content_hash: string }
  /** Hash changed (BF07/BF08): re-chunk, re-embed from 0, delete tail overhang. */
  | {
      kind: 'reembed_changed'
      essay_path: string
      content_hash: string
      old_total_chunks: number
    }
  /** Archive removed from scope: delete all committed vector ids. */
  | {
      kind: 'delete_removed'
      essay_path: string
      total_chunks: number
    }

export type BacklogDiff = {
  actions: BackfillAction[]
  /** True when any live archive hash differs from the manifest (BF07/BF08). */
  archiveContentChanged: boolean
  /** True when nothing needs embedding or deleting (no-op day). */
  drained: boolean
}

/**
 * Pure diff: manifest file entries vs live archives. No chunking here —
 * callers chunk lazily, only for files that actually need work.
 */
export function diffBacklog(
  manifestFiles: Record<string, BackfillFileEntry>,
  liveFiles: ArchiveFile[]
): BacklogDiff {
  const actions: BackfillAction[] = []
  let archiveContentChanged = false
  const livePaths = new Set(liveFiles.map((f) => f.essay_path))

  for (const live of liveFiles) {
    const entry = manifestFiles[live.essay_path]
    if (!entry) {
      actions.push({
        kind: 'embed_new',
        essay_path: live.essay_path,
        content_hash: live.content_hash
      })
      continue
    }
    if (entry.content_hash !== live.content_hash) {
      archiveContentChanged = true
      actions.push({
        kind: 'reembed_changed',
        essay_path: live.essay_path,
        content_hash: live.content_hash,
        old_total_chunks: entry.total_chunks
      })
      continue
    }
    if (entry.next_chunk_index < entry.total_chunks) {
      actions.push({
        kind: 'embed_resume',
        essay_path: live.essay_path,
        content_hash: live.content_hash
      })
    }
  }

  for (const [essayPath, entry] of Object.entries(manifestFiles)) {
    if (livePaths.has(essayPath)) continue
    archiveContentChanged = true
    actions.push({
      kind: 'delete_removed',
      essay_path: essayPath,
      total_chunks: entry.total_chunks
    })
  }

  return { actions, archiveContentChanged, drained: actions.length === 0 }
}

export function scanBacklog(
  manifest: BackfillManifest,
  essayPathsFilter: string[] | null = null
): BacklogDiff {
  let live = listBackfillArchiveFiles()
  let manifestFiles = manifest.files
  if (essayPathsFilter && essayPathsFilter.length > 0) {
    const allow = new Set(essayPathsFilter.map((p) => p.replace(/\\/g, '/')))
    live = live.filter((f) => allow.has(f.essay_path))
    manifestFiles = Object.fromEntries(
      Object.entries(manifestFiles).filter(([p]) => allow.has(p))
    )
  }
  return diffBacklog(manifestFiles, live)
}

/** Vector ids for a file's chunk range [from, to) — deletion + verification. */
export function vectorIdsForRange(
  essayPath: string,
  from: number,
  to: number
): string[] {
  const slug = essayPathToSlug(essayPath)
  const ids: string[] = []
  for (let i = from; i < to; i++) ids.push(vectorIdForChunk(slug, i))
  return ids
}

/**
 * INV-BACKFILL-003 sanity: every backfill archive path must be excluded from
 * deploy-sync scope (unless the EMBED_CONVERSATION_ARCHIVES override is set).
 */
export function assertDisjointFromDeploySync(paths: string[]): void {
  if (process.env.EMBED_CONVERSATION_ARCHIVES === 'true') {
    throw new Error(
      'EMBED_CONVERSATION_ARCHIVES=true hands archives to deploy sync — ' +
        'refusing to backfill the same scope from two writers (INV-BACKFILL-003)'
    )
  }
  for (const p of paths) {
    if (!isConversationArchivePath(p) || isInScopePostPath(p)) {
      throw new Error(
        `Backfill scope leak: ${p} is visible to deploy sync (INV-BACKFILL-003)`
      )
    }
  }
}
