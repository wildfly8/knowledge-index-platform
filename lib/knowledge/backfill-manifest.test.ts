import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import {
  BACKFILL_MANIFEST_VECTOR_ID,
  beginBackfillRun,
  committedArchiveVectors,
  defaultBackfillManifest,
  mergeCursors,
  type BackfillManifest
} from '@/lib/knowledge/backfill-manifest'
import { MANIFEST_VECTOR_ID } from '@/lib/knowledge/manifest'

test('backfill manifest is a separate control record from deploy-sync manifest (INV-BACKFILL-003)', () => {
  assert.equal(BACKFILL_MANIFEST_VECTOR_ID, '__backfill_manifest__')
  assert.notEqual(BACKFILL_MANIFEST_VECTOR_ID, MANIFEST_VECTOR_ID)
})

test('backfill modules never touch the Feature 001 manifest module', () => {
  const repo = process.cwd()
  const sources = [
    'lib/knowledge/backfill-manifest.ts',
    'lib/knowledge/backfill-scan.ts',
    'lib/knowledge/backfill-budget.ts',
    'lib/knowledge/backfill-saga.ts',
    'scripts/embed-posts/backfill.ts'
  ]
  for (const rel of sources) {
    const src = fs.readFileSync(path.join(repo, rel), 'utf8')
    assert.equal(
      /from '@\/lib\/knowledge\/manifest'/.test(src),
      false,
      `${rel} must not import the deploy-sync manifest module`
    )
    assert.equal(
      src.includes("'__manifest__'"),
      false,
      `${rel} must not reference the deploy-sync manifest vector id`
    )
  }
})

test('default manifest starts as backlog_pending with empty files', () => {
  const m = defaultBackfillManifest()
  assert.equal(m.status, 'backlog_pending')
  assert.deepEqual(m.files, {})
  assert.equal(m.committed_archive_vectors, 0)
  assert.equal(m.last_run, null)
})

test('committedArchiveVectors sums per-file committed cursors', () => {
  const m = defaultBackfillManifest()
  m.files['content/posts/unfolding/chatgpt-2023.mdx'] = {
    content_hash: 'sha256:a',
    total_chunks: 100,
    next_chunk_index: 40,
    committed_chunks: 40
  }
  m.files['content/posts/unfolding/gemini-2026.mdx'] = {
    content_hash: 'sha256:b',
    total_chunks: 10,
    next_chunk_index: 10,
    committed_chunks: 10
  }
  assert.equal(committedArchiveVectors(m), 50)
})

test('mergeCursors prefers the further-ahead local cursor when hashes match', () => {
  const essay = 'content/posts/unfolding/chatgpt-2024.mdx'
  const remote: BackfillManifest = {
    ...defaultBackfillManifest(),
    files: {
      [essay]: {
        content_hash: 'sha256:same',
        total_chunks: 500,
        next_chunk_index: 100,
        committed_chunks: 100
      }
    }
  }
  const local: BackfillManifest = {
    ...defaultBackfillManifest(),
    files: {
      [essay]: {
        content_hash: 'sha256:same',
        total_chunks: 500,
        next_chunk_index: 180,
        committed_chunks: 180
      }
    }
  }
  const merged = mergeCursors(remote, local)
  assert.equal(merged.files[essay].committed_chunks, 180)
  assert.equal(merged.committed_archive_vectors, 180)
})

test('mergeCursors ignores local cursor when content hash differs', () => {
  const essay = 'content/posts/unfolding/chatgpt-2024.mdx'
  const remote: BackfillManifest = {
    ...defaultBackfillManifest(),
    files: {
      [essay]: {
        content_hash: 'sha256:new',
        total_chunks: 500,
        next_chunk_index: 100,
        committed_chunks: 100
      }
    }
  }
  const local: BackfillManifest = {
    ...defaultBackfillManifest(),
    files: {
      [essay]: {
        content_hash: 'sha256:stale',
        total_chunks: 480,
        next_chunk_index: 300,
        committed_chunks: 300
      }
    }
  }
  const merged = mergeCursors(remote, local)
  assert.equal(merged.files[essay].committed_chunks, 100)
  assert.equal(merged.files[essay].content_hash, 'sha256:new')
})

test('mergeCursors recovers batch_failed when remote is stuck at batch_running', () => {
  const remote: BackfillManifest = {
    ...defaultBackfillManifest(),
    status: 'batch_running',
    last_run: beginBackfillRun('daily_schedule', defaultBackfillManifest(), 9500, null)
  }
  const local: BackfillManifest = {
    ...defaultBackfillManifest(),
    status: 'batch_failed',
    last_run: {
      ...beginBackfillRun('daily_schedule', defaultBackfillManifest(), 9500, null),
      state: 'batch_failed',
      finished_at: new Date().toISOString(),
      error_stage: 'upsert',
      error_message: 'Exceeded daily write limit: 10000'
    }
  }
  const merged = mergeCursors(remote, local)
  assert.equal(merged.status, 'batch_failed')
  assert.equal(merged.last_run?.error_stage, 'upsert')
})

test('beginBackfillRun snapshots cursor and budget', () => {
  const m = defaultBackfillManifest()
  m.files['content/posts/unfolding/chatgpt-2023.mdx'] = {
    content_hash: 'sha256:a',
    total_chunks: 100,
    next_chunk_index: 25,
    committed_chunks: 25
  }
  const run = beginBackfillRun('daily_schedule', m, 9500, null)
  assert.equal(run.state, 'batch_running')
  assert.equal(run.cursor_before, 25)
  assert.equal(run.budget_limit, 9500)
  assert.equal(run.error_stage, null)
  assert.match(run.run_date_utc, /^\d{4}-\d{2}-\d{2}$/)
})
