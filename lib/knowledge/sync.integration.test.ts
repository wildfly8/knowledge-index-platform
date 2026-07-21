import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { chunkMdxFile } from '../../scripts/embed-posts/chunk-mdx'
import {
  computeCorpusDigest,
  isCorpusStale,
  listCorpusFiles
} from '@/lib/knowledge/corpus'
import { contentHash } from '@/lib/knowledge/embed'
import { defaultManifest } from '@/lib/knowledge/manifest'

const PROBE_SOURCE =
  '---\ntitle: probe\n---\n\n## Probe\n\nUnique phrase xyzzy-embed-probe-12345.'

describe('knowledge corpus digest', () => {
  it('changes when examined post content changes', () => {
    const corpus = listCorpusFiles()
    const before = computeCorpusDigest(corpus)
    const probePath = 'content/posts/examined/_digest-probe.mdx'
    const after = computeCorpusDigest([
      ...corpus,
      { essay_path: probePath, content_hash: contentHash(PROBE_SOURCE) }
    ])
    assert.notEqual(before, after)

    const chunks = chunkMdxFile(probePath, PROBE_SOURCE)
    assert.ok(chunks.length >= 1)
    assert.ok(chunks[0].text.includes('xyzzy-embed-probe-12345'))
  })

  it('isCorpusStale is false when posts tree is unavailable (serverless)', () => {
    const manifest = {
      ...defaultManifest(),
      manifest_digest: 'sha256:deadbeef',
      files: { 'content/posts/examined/foo.mdx': { content_hash: 'sha256:x' } }
    }
    assert.equal(isCorpusStale(manifest, []), false)
  })

  it('isCorpusStale detects new files not in manifest', () => {
    const corpus = listCorpusFiles()
    if (corpus.length === 0) return
    const manifest = {
      ...defaultManifest(),
      manifest_digest: computeCorpusDigest(corpus.slice(0, -1)),
      files: Object.fromEntries(
        corpus.slice(0, -1).map((f) => [f.essay_path, { content_hash: f.content_hash }])
      )
    }
    assert.equal(isCorpusStale(manifest, corpus), true)
  })
})
