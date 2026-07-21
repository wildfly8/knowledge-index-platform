import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  assertDisjointFromDeploySync,
  diffBacklog,
  vectorIdsForRange,
  type ArchiveFile
} from '@/lib/knowledge/backfill-scan'
import type { BackfillFileEntry } from '@/lib/knowledge/backfill-manifest'

const live = (essayPath: string, hash: string): ArchiveFile => ({
  essay_path: essayPath,
  essay_slug: `/${essayPath.replace(/^content\//, '').replace(/\.mdx$/, '')}`,
  content_hash: hash
})

const entry = (
  hash: string,
  total: number,
  next: number
): BackfillFileEntry => ({
  content_hash: hash,
  total_chunks: total,
  next_chunk_index: next,
  committed_chunks: next
})

const CHATGPT_23 = 'content/posts/unfolding/chatgpt-2023.mdx'
const CHATGPT_24 = 'content/posts/unfolding/chatgpt-2024.mdx'

test('unknown archive → embed_new from chunk 0', () => {
  const diff = diffBacklog({}, [live(CHATGPT_23, 'sha256:a')])
  assert.deepEqual(diff.actions, [
    { kind: 'embed_new', essay_path: CHATGPT_23, content_hash: 'sha256:a' }
  ])
  assert.equal(diff.archiveContentChanged, false)
  assert.equal(diff.drained, false)
})

test('same hash with cursor short of total → embed_resume (FR-004/FR-008)', () => {
  const diff = diffBacklog(
    { [CHATGPT_23]: entry('sha256:a', 100, 40) },
    [live(CHATGPT_23, 'sha256:a')]
  )
  assert.deepEqual(diff.actions, [
    { kind: 'embed_resume', essay_path: CHATGPT_23, content_hash: 'sha256:a' }
  ])
})

test('same hash fully committed → drained no-op day (FR-010)', () => {
  const diff = diffBacklog(
    { [CHATGPT_23]: entry('sha256:a', 100, 100) },
    [live(CHATGPT_23, 'sha256:a')]
  )
  assert.deepEqual(diff.actions, [])
  assert.equal(diff.drained, true)
  assert.equal(diff.archiveContentChanged, false)
})

test('changed hash → reembed_changed and BF07/BF08 signal (FR-009)', () => {
  const diff = diffBacklog(
    { [CHATGPT_23]: entry('sha256:old', 120, 120) },
    [live(CHATGPT_23, 'sha256:new')]
  )
  assert.deepEqual(diff.actions, [
    {
      kind: 'reembed_changed',
      essay_path: CHATGPT_23,
      content_hash: 'sha256:new',
      old_total_chunks: 120
    }
  ])
  assert.equal(diff.archiveContentChanged, true)
})

test('archive removed from scope → delete_removed for committed vectors', () => {
  const diff = diffBacklog(
    { [CHATGPT_23]: entry('sha256:a', 80, 80) },
    []
  )
  assert.deepEqual(diff.actions, [
    { kind: 'delete_removed', essay_path: CHATGPT_23, total_chunks: 80 }
  ])
  assert.equal(diff.archiveContentChanged, true)
})

test('mixed backlog keeps per-file actions independent', () => {
  const diff = diffBacklog(
    {
      [CHATGPT_23]: entry('sha256:a', 100, 100),
      [CHATGPT_24]: entry('sha256:b', 200, 50)
    },
    [live(CHATGPT_23, 'sha256:a'), live(CHATGPT_24, 'sha256:b')]
  )
  assert.deepEqual(diff.actions, [
    { kind: 'embed_resume', essay_path: CHATGPT_24, content_hash: 'sha256:b' }
  ])
})

test('vectorIdsForRange matches Feature 001 vector id scheme', () => {
  const ids = vectorIdsForRange(CHATGPT_23, 3, 6)
  assert.deepEqual(ids, [
    'posts--unfolding--chatgpt-2023#3',
    'posts--unfolding--chatgpt-2023#4',
    'posts--unfolding--chatgpt-2023#5'
  ])
})

test('assertDisjointFromDeploySync refuses dual-writer configuration', () => {
  const prev = process.env.EMBED_CONVERSATION_ARCHIVES
  try {
    delete process.env.EMBED_CONVERSATION_ARCHIVES
    assert.doesNotThrow(() => assertDisjointFromDeploySync([CHATGPT_23, CHATGPT_24]))
    assert.throws(
      () => assertDisjointFromDeploySync(['content/posts/examined/essay.mdx']),
      /scope leak/
    )
    process.env.EMBED_CONVERSATION_ARCHIVES = 'true'
    assert.throws(() => assertDisjointFromDeploySync([CHATGPT_23]), /INV-BACKFILL-003/)
  } finally {
    if (prev === undefined) delete process.env.EMBED_CONVERSATION_ARCHIVES
    else process.env.EMBED_CONVERSATION_ARCHIVES = prev
  }
})
