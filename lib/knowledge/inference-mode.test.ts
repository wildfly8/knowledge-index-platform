import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { useKnowledgeInferenceWorker } from './inference-mode'

describe('useKnowledgeInferenceWorker', () => {
  it('defaults to worker off on Vercel', () => {
    const prevV = process.env.VERCEL
    const prevF = process.env.KNOWLEDGE_INFERENCE_WORKER
    process.env.VERCEL = '1'
    delete process.env.KNOWLEDGE_INFERENCE_WORKER
    assert.equal(useKnowledgeInferenceWorker(), false)
    if (prevV === undefined) delete process.env.VERCEL
    else process.env.VERCEL = prevV
    if (prevF === undefined) delete process.env.KNOWLEDGE_INFERENCE_WORKER
    else process.env.KNOWLEDGE_INFERENCE_WORKER = prevF
  })

  it('honors explicit off/on', () => {
    const prev = process.env.KNOWLEDGE_INFERENCE_WORKER
    process.env.KNOWLEDGE_INFERENCE_WORKER = '0'
    assert.equal(useKnowledgeInferenceWorker(), false)
    process.env.KNOWLEDGE_INFERENCE_WORKER = '1'
    assert.equal(useKnowledgeInferenceWorker(), true)
    if (prev === undefined) delete process.env.KNOWLEDGE_INFERENCE_WORKER
    else process.env.KNOWLEDGE_INFERENCE_WORKER = prev
  })
})
