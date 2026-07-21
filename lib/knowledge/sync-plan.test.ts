import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { computeCorpusDigest } from '@/lib/knowledge/corpus'
import { defaultManifest } from '@/lib/knowledge/manifest'
import { computeSyncPlan } from '@/lib/knowledge/sync-plan'

describe('computeSyncPlan', () => {
  it('EM09 skip when digest unchanged and index_current', () => {
    const corpus = [
      {
        essay_path: 'content/posts/examined/a.mdx',
        content_hash: 'sha256:aaa'
      }
    ]
    const digest = computeCorpusDigest(corpus)
    const prior = {
      ...defaultManifest(),
      status: 'index_current' as const,
      manifest_digest: digest,
      files: { 'content/posts/examined/a.mdx': { content_hash: 'sha256:aaa' } }
    }
    const plan = computeSyncPlan(prior, corpus, true)
    assert.equal(plan.wouldSkip, true)
    assert.equal(plan.skipEdgeId, 'EM09')
    assert.equal(plan.event, 'posts_digest_unchanged')
    assert.deepEqual(plan.toProcess, [])
    assert.deepEqual(plan.removed, [])
  })

  it('lists new and removed paths when digest changes', () => {
    const corpus = [
      {
        essay_path: 'content/posts/examined/b.mdx',
        content_hash: 'sha256:bbb'
      }
    ]
    const prior = {
      ...defaultManifest(),
      status: 'index_current' as const,
      manifest_digest: 'sha256:old',
      files: {
        'content/posts/examined/a.mdx': {
          content_hash: 'sha256:aaa',
          chunk_count: 3
        }
      }
    }
    const plan = computeSyncPlan(prior, corpus, false)
    assert.equal(plan.wouldSkip, false)
    assert.deepEqual(plan.toProcess, ['content/posts/examined/b.mdx'])
    assert.deepEqual(plan.removed, ['content/posts/examined/a.mdx'])
    assert.equal(plan.vectorConfigured, false)
  })
})
