import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { completeWithGemini } from '@/lib/chat/llm/gemini'

describe('completeWithGemini', () => {
  it('maps Gemini response to completion result', async () => {
    const fetchFn = async () =>
      new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'A catamorphism folds an F-algebra.' }] } }]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )

    const result = await completeWithGemini(
      {
        system: 'Use passages only.',
        messages: [{ role: 'user', content: 'what is catamorphism' }]
      },
      { apiKey: 'test-key', fetchFn }
    )

    assert.equal(result.provider, 'gemini')
    assert.match(result.text, /catamorphism/i)
  })

  it('throws on API error', async () => {
    const fetchFn = async () => new Response('bad request', { status: 400 })

    await assert.rejects(
      () =>
        completeWithGemini(
          { messages: [{ role: 'user', content: 'q' }] },
          { apiKey: 'test-key', fetchFn }
        ),
      /Gemini API 400/
    )
  })
})
