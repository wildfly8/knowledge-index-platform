import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildConversationalSystemPrompt,
  buildRetrievalContext,
  historyToLlmMessages
} from '@/lib/chat/prompt'

describe('chat prompt', () => {
  it('builds numbered retrieval context', () => {
    const context = buildRetrievalContext([
      {
        essay_slug: '/posts/examined/f-algebras',
        essay_path: 'content/posts/examined/f-algebras.mdx',
        heading: 'Intro',
        text: 'Initial algebras classify folds.',
        score: 1.2
      }
    ])
    assert.match(context, /\[1\]/)
    assert.match(context, /Initial algebras classify folds/)
  })

  it('includes system instructions and context', () => {
    const prompt = buildConversationalSystemPrompt('ctx')
    assert.match(prompt, /retrieved essay passages/i)
    assert.match(prompt, /ctx/)
  })

  it('limits history to recent turns', () => {
    const history = Array.from({ length: 20 }, (_, i) => ({
      role: i % 2 === 0 ? ('user' as const) : ('assistant' as const),
      content: `m${i}`
    }))
    const messages = historyToLlmMessages(history, 4)
    assert.equal(messages.length, 4)
    assert.equal(messages[0].content, 'm16')
  })
})
