import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  defaultManifest,
  parseManifestPayload,
  type SyncManifest
} from '@/lib/knowledge/manifest'

describe('manifest payload', () => {
  it('round-trips sync manifest JSON', () => {
    const sample: SyncManifest = {
      ...defaultManifest(),
      status: 'index_current',
      manifest_digest: 'sha256:abc',
      vector_count: 42,
      last_sync_at: '2026-07-12T00:00:00.000Z',
      files: {
        'content/posts/examined/foo.mdx': {
          content_hash: 'sha256:def',
          chunk_count: 3
        }
      }
    }
    const parsed = parseManifestPayload(JSON.stringify(sample))
    assert.equal(parsed?.status, 'index_current')
    assert.equal(parsed?.manifest_digest, 'sha256:abc')
    assert.equal(parsed?.vector_count, 42)
    assert.equal(parsed?.files['content/posts/examined/foo.mdx']?.chunk_count, 3)
  })

  it('returns null for invalid JSON', () => {
    assert.equal(parseManifestPayload('{not json'), null)
  })
})
