/**
 * Live Upstash + Xenova retrieval smoke test.
 *
 * Run (bash):  KNOWLEDGE_INTEGRATION=1 npm run test:knowledge
 * Run (pwsh):  $env:KNOWLEDGE_INTEGRATION='1'; npm run test:knowledge
 *
 * Requires UPSTASH_VECTOR_* in .env.local and a synced index
 * (sibling knowledge-index-platform: `npm run embed:sync` with CORPUS_ROOT set).
 */
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadEnvFiles } from '@/lib/env/load-env'
import { embedModelName } from '@/lib/knowledge/embed'
import { rerankModelName } from '@/lib/knowledge/rerank'
import { isVectorConfigured } from '@/lib/knowledge/vector-client'
import { retrieveKnowledge } from '@/lib/knowledge/retrieve-core'

loadEnvFiles()

const runIntegration = process.env.KNOWLEDGE_INTEGRATION === '1'

function logTopK(
  query: string,
  chunks: Awaited<ReturnType<typeof retrieveKnowledge>>['chunks']
) {
  console.log(`\n[retrieve] query: ${JSON.stringify(query)}`)
  for (const [i, c] of chunks.entries()) {
    const preview = c.text.replace(/\s+/g, ' ').slice(0, 120)
    console.log(
      `  ${i + 1}. score=${c.score.toFixed(3)} ${c.essay_slug}` +
        (c.heading ? ` (${c.heading})` : '') +
        `\n     ${preview}…`
    )
  }
}

describe('knowledge retrieval integration', { skip: !runIntegration }, () => {
  it('returns top-k chunks with cross-encoder rerank (SC-006)', async () => {
    assert.equal(
      isVectorConfigured(),
      true,
      'UPSTASH_VECTOR_* required — set in .env.local'
    )

    const query = 'catamorphism fold F-algebra'
    const result = await retrieveKnowledge({ query, topK: 3, minScore: 0.5 })

    assert.notEqual(result.meta.index_status, 'no_index', 'index not synced')
    assert.equal(result.meta.rerank, true)
    assert.equal(result.meta.bi_encoder_model, embedModelName())
    assert.equal(result.meta.rerank_model, rerankModelName())
    assert.equal(result.meta.model, rerankModelName())
    assert.ok(result.chunks.length >= 1, 'expected at least one chunk')

    for (const chunk of result.chunks) {
      assert.ok(chunk.essay_path.startsWith('content/posts/examined/'))
      assert.ok(chunk.text.length > 0)
      assert.match(chunk.essay_slug, /^\/posts\//)
    }

    logTopK(query, result.chunks)

    const slugs = result.chunks.map((c) => c.essay_slug)
    assert.ok(
      slugs.some((s) => s.includes('f-algebras') || s.includes('analytic-synthetic')),
      `expected F-algebra related essay in top-k, got: ${slugs.join(', ')}`
    )
  })

  it('casual catamorphism query returns grounded essay chunks (006)', async () => {
    assert.equal(isVectorConfigured(), true)

    const result = await retrieveKnowledge({
      query: "what's catamorphism",
      topK: 5,
      rerank: true
    })

    assert.ok(result.chunks.length >= 1)
    for (const chunk of result.chunks) {
      assert.ok(chunk.score >= 0, `expected non-negative score, got ${chunk.score}`)
    }

    const slugs = result.chunks.map((c) => c.essay_slug)
    assert.ok(
      slugs.some((s) => s.includes('f-algebras')),
      `expected f-algebras essay, got: ${slugs.join(', ')}`
    )
  })

  it('rerank: false returns cosine scores in [0, 1]', async () => {
    assert.equal(isVectorConfigured(), true)

    const result = await retrieveKnowledge({
      query: 'catamorphism fold F-algebra',
      topK: 3,
      minScore: 0.5,
      rerank: false
    })

    assert.equal(result.meta.rerank, false)
    assert.equal(result.meta.rerank_model, null)
    assert.equal(result.meta.model, embedModelName())
    assert.ok(result.chunks.length >= 1)

    for (const chunk of result.chunks) {
      assert.ok(chunk.score >= 0.5 && chunk.score <= 1)
    }
  })
})
