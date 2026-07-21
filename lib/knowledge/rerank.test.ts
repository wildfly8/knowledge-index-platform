import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { loadEnvFiles } from '@/lib/env/load-env'
import {
  clampCandidatePool,
  defaultCandidatePoolSize,
  scoreQueryPassagePairs
} from '@/lib/knowledge/rerank'

loadEnvFiles()

const runIntegration = process.env.KNOWLEDGE_INTEGRATION === '1'

describe('rerank pool sizing', () => {
  it('defaultCandidatePoolSize scales with top_k capped at 60', () => {
    assert.equal(defaultCandidatePoolSize(1), 6)
    assert.equal(defaultCandidatePoolSize(5), 30)
    assert.equal(defaultCandidatePoolSize(10), 60)
    assert.equal(defaultCandidatePoolSize(20), 60)
  })

  it('clampCandidatePool enforces floor and ceiling', () => {
    assert.equal(clampCandidatePool(5, 5), 5)
    assert.equal(clampCandidatePool(100, 5), 60)
    assert.equal(clampCandidatePool(2, 5), 5)
  })
})

describe('rerank xenova scoring', { skip: !runIntegration }, () => {
  it('scores relevant passage higher than irrelevant (raw logits)', async () => {
    const query = 'catamorphism fold F-algebra'
    const [relevant, irrelevant] = await scoreQueryPassagePairs(query, [
      'A catamorphism is the unique morphism from the initial algebra to another algebra.',
      'Privacy policy cookies and GDPR compliance for website visitors.'
    ])

    assert.ok(relevant > irrelevant, `expected relevant > irrelevant, got ${relevant} vs ${irrelevant}`)
    assert.ok(relevant > 0)
    assert.ok(irrelevant < 0)
  })
})
