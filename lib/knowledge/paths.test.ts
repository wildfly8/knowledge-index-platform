import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  isConversationArchivePath,
  isInScopePostPath
} from '@/lib/knowledge/paths'
import { isBackfillArchivePath } from '@/lib/knowledge/backfill-scan'

function withArchivesFlag(value: string | undefined, fn: () => void) {
  const prev = process.env.EMBED_CONVERSATION_ARCHIVES
  if (value === undefined) delete process.env.EMBED_CONVERSATION_ARCHIVES
  else process.env.EMBED_CONVERSATION_ARCHIVES = value
  try {
    fn()
  } finally {
    if (prev === undefined) delete process.env.EMBED_CONVERSATION_ARCHIVES
    else process.env.EMBED_CONVERSATION_ARCHIVES = prev
  }
}

test('examined and unfolding posts are in scope', () => {
  assert.equal(isInScopePostPath('content/posts/examined/f-algebras-and-coalgebras.mdx'), true)
  assert.equal(isInScopePostPath('content/posts/unfolding/index.mdx'), true)
  assert.equal(isInScopePostPath('content/posts/unfolding/activity-2025.mdx'), true)
})

test('pre-examined, _meta, and non-text files are out of scope', () => {
  assert.equal(isInScopePostPath('content/posts/pre-examined/essay.mdx'), false)
  assert.equal(isInScopePostPath('content/posts/unfolding/_meta.ts'), false)
  assert.equal(isInScopePostPath('content/posts/examined/diagram.png'), false)
  assert.equal(isInScopePostPath('content/privacy.mdx'), false)
})

test('conversation archives are detected including year and part variants', () => {
  assert.equal(isConversationArchivePath('content/posts/unfolding/chatgpt-2025.mdx'), true)
  assert.equal(isConversationArchivePath('content/posts/unfolding/chatgpt.mdx'), true)
  assert.equal(isConversationArchivePath('content/posts/unfolding/gemini-2026.mdx'), true)
  assert.equal(isConversationArchivePath('content\\posts\\unfolding\\chatgpt-2024.mdx'), true)
  assert.equal(isConversationArchivePath('content/posts/unfolding/chatgpt-2025-p3.mdx'), true)
  assert.equal(isConversationArchivePath('content/posts/unfolding/chatgpt-2026-p12.mdx'), true)
  assert.equal(isConversationArchivePath('content/posts/unfolding/activity-2025.mdx'), false)
  assert.equal(isConversationArchivePath('content/posts/examined/chatgpt-2025.mdx'), false)
})

test('conversation archives excluded from deploy sync by default (INV-BACKFILL-003)', () => {
  withArchivesFlag(undefined, () => {
    assert.equal(isInScopePostPath('content/posts/unfolding/chatgpt-2025.mdx'), false)
    assert.equal(isInScopePostPath('content/posts/unfolding/gemini-2026.mdx'), false)
  })
  withArchivesFlag('false', () => {
    assert.equal(isInScopePostPath('content/posts/unfolding/chatgpt-2023.mdx'), false)
  })
})

test('EMBED_CONVERSATION_ARCHIVES=true opts archives back in', () => {
  withArchivesFlag('true', () => {
    assert.equal(isInScopePostPath('content/posts/unfolding/chatgpt-2025.mdx'), true)
    assert.equal(isInScopePostPath('content/posts/unfolding/gemini-2026.mdx'), true)
  })
})

test('backfill scope = year archives only (no index or part stubs)', () => {
  assert.equal(isBackfillArchivePath('content/posts/unfolding/chatgpt-2025.mdx'), true)
  assert.equal(isBackfillArchivePath('content/posts/unfolding/gemini-2026.mdx'), true)
  assert.equal(isBackfillArchivePath('content\\posts\\unfolding\\chatgpt-2023.mdx'), true)
  assert.equal(isBackfillArchivePath('content/posts/unfolding/chatgpt.mdx'), false)
  assert.equal(isBackfillArchivePath('content/posts/unfolding/chatgpt-2025-p3.mdx'), false)
  assert.equal(isBackfillArchivePath('content/posts/unfolding/activity-2025.mdx'), false)
  assert.equal(isBackfillArchivePath('content/posts/examined/chatgpt-2025.mdx'), false)
})

test('backfill scope is disjoint from deploy-sync scope (INV-BACKFILL-003)', () => {
  const samples = [
    'content/posts/unfolding/chatgpt-2022.mdx',
    'content/posts/unfolding/chatgpt-2023.mdx',
    'content/posts/unfolding/chatgpt-2024.mdx',
    'content/posts/unfolding/chatgpt-2025.mdx',
    'content/posts/unfolding/chatgpt-2026.mdx',
    'content/posts/unfolding/gemini-2026.mdx'
  ]
  withArchivesFlag(undefined, () => {
    for (const p of samples) {
      assert.equal(isBackfillArchivePath(p), true)
      assert.equal(isConversationArchivePath(p), true)
      assert.equal(
        isInScopePostPath(p),
        false,
        `${p} must not be visible to deploy sync`
      )
    }
  })
})
