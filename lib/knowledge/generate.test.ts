import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildRagPrompt,
  cleanGeneratedText,
  isMalformedGeneration
} from './generate'

describe('buildRagPrompt', () => {
  it('uses flan-t5 context/question format without numbered chunk labels', () => {
    const prompt = buildRagPrompt('What is muF?', [
      {
        heading: 'Intro',
        text: 'Initial algebras classify folds.',
        score: 1,
        essay_slug: '/posts/examined/f-algebras-and-coalgebras',
        essay_path: 'content/posts/examined/f-algebras-and-coalgebras.mdx'
      }
    ])
    assert.match(prompt, /Question: What is muF\?/)
    assert.match(prompt, /Context:[\s\S]*Intro: Initial algebras classify folds/)
    assert.doesNotMatch(prompt, /\[1\]/)
  })

  it('truncates very long context', () => {
    const prompt = buildRagPrompt(
      'q',
      [{ heading: null, text: 'x'.repeat(5000), score: 1, essay_slug: '/posts/examined/x', essay_path: 'content/posts/examined/x.mdx' }],
      100
    )
    assert.ok(prompt.length < 5000)
    assert.match(prompt, /…/)
  })
})

describe('cleanGeneratedText', () => {
  it('strips leading citation-style prefix', () => {
    assert.equal(
      cleanGeneratedText('[1] Hylomorphism: analyze, then synthesize'),
      'Hylomorphism: analyze, then synthesize'
    )
  })
})

describe('isMalformedGeneration', () => {
  it('flags repetition loops', () => {
    const bad =
      'hylomorphism: analyze, then synthesize: hylomorphism: analyze, then synthesize: hylomorphism: analyze, then synthesize'
    assert.equal(isMalformedGeneration(bad), true)
  })

  it('accepts normal prose', () => {
    assert.equal(
      isMalformedGeneration(
        'A catamorphism is a fold over an F-algebra, the universal morphism from the initial algebra.'
      ),
      false
    )
  })
})
