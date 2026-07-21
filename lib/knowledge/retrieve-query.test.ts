import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  expandRetrievalQuery,
  fuzzyGlossaryTerms,
  isCommentChunk,
  isRetrievalConfident,
  coerceRerankScore,
  matchTermsForQuery,
  termMatchesText,
  termOverlapBoost,
  deriveShortAliases,
  resolveGlossaryToken,
  SHORT_ALIASES,
  DOMAIN_GLOSSARY
} from './retrieve-query'

describe('expandRetrievalQuery', () => {
  it('expands casual catamorphism questions', () => {
    const q = expandRetrievalQuery("what's catamorphism")
    assert.match(q, /catamorphism fold F-algebra/)
    assert.match(q, /what's catamorphism/)
  })

  it('expands common catamorphism typo (catmorphism)', () => {
    const q = expandRetrievalQuery("what's catmorphism")
    assert.match(q, /catamorphism fold F-algebra/)
    assert.match(q, /catmorphism/)
  })

  it('fuzzyGlossaryTerms maps catmorphism to catamorphism', () => {
    assert.deepEqual(fuzzyGlossaryTerms("what's catmorphism"), ['catamorphism'])
  })

  it('leaves unrelated queries unchanged', () => {
    assert.equal(expandRetrievalQuery('privacy policy'), 'privacy policy')
  })

  it('expands bare ana to anamorphism glossary', () => {
    const q = expandRetrievalQuery("what's ana")
    assert.match(q, /anamorphism unfold/)
  })
})

describe('deriveShortAliases', () => {
  it('derives ana/cata/hylo from *morphism stems without hand aliases', () => {
    const aliases = deriveShortAliases([
      'catamorphism',
      'anamorphism',
      'hylomorphism',
      'coalgebra'
    ])
    assert.equal(aliases.ana, 'anamorphism')
    assert.equal(aliases.cata, 'catamorphism')
    assert.equal(aliases.hylo, 'hylomorphism')
    assert.equal(aliases.coa, 'coalgebra')
  })

  it('drops colliding short prefixes', () => {
    const aliases = deriveShortAliases(['analysis', 'anamorphism'])
    // both would claim "ana" → omit ambiguous alias
    assert.equal(aliases.ana, undefined)
  })

  it('module SHORT_ALIASES includes ana from live DOMAIN_GLOSSARY', () => {
    assert.equal(SHORT_ALIASES.ana, 'anamorphism')
    assert.equal(SHORT_ALIASES.cata, 'catamorphism')
  })

  it('resolveGlossaryToken uses unique prefix without explicit alias', () => {
    const hits = resolveGlossaryToken('concres', DOMAIN_GLOSSARY, {})
    assert.deepEqual(hits, ['concres', 'concrescence'])
  })
})

describe('matchTermsForQuery / termMatchesText', () => {
  it('includes short alias ana → anamorphism', () => {
    const terms = matchTermsForQuery("what's ana?")
    assert.ok(terms.includes('ana'))
    assert.ok(terms.includes('anamorphism'))
  })

  it('ana does not match anatta', () => {
    assert.equal(termMatchesText('ana', 'referenced anatta above'), false)
    assert.equal(termMatchesText('ana', 'coalgebraic ana after fold'), true)
    assert.equal(termMatchesText('anamorphism', 'So ana in anamorphism'), true)
  })

  it('boosts term-true passages over loose anatta neighbors', () => {
    const query = "what's ana?"
    const anatta = termOverlapBoost(query, {
      heading: 'lyric',
      text: 'we referenced anatta above which is Buddhism'
    })
    const hyle = termOverlapBoost(query, {
      heading: 'comment',
      text: 'algebraic cata after coalgebraic ana…'
    })
    assert.equal(anatta, 0)
    assert.ok(hyle >= 0.2)
  })
})

describe('isCommentChunk', () => {
  it('flags activity comment headings', () => {
    assert.equal(
      isCommentChunk({
        heading: '2521. 2025-01-28 05:05 · comment',
        essay_path: 'content/posts/unfolding/activity-2025.mdx'
      }),
      true
    )
  })

  it('allows essay sections', () => {
    assert.equal(
      isCommentChunk({
        heading: 'Analytic/Synthetic as μF/νF',
        essay_path: 'content/posts/examined/analytic-synthetic-muF-nuF.mdx'
      }),
      false
    )
  })
})

describe('coerceRerankScore', () => {
  it('keeps positive CE scores', () => {
    assert.equal(coerceRerankScore(0.59, 1.2), 1.2)
  })

  it('promotes ANN>0.5 past negative CE by returning ANN score', () => {
    assert.equal(coerceRerankScore(0.593, -3.1), 0.593)
  })

  it('does not promote ANN at or below 0.5', () => {
    assert.equal(coerceRerankScore(0.5, -1), -1)
    assert.equal(coerceRerankScore(0.49, -1), -1)
  })
})

describe('isRetrievalConfident', () => {
  it('requires non-negative rerank logit', () => {
    assert.equal(
      isRetrievalConfident(
        [{ score: -2, essay_slug: '/x', essay_path: 'x', heading: null, chunk_index: 0, text: 't' }],
        true
      ),
      false
    )
    assert.equal(
      isRetrievalConfident(
        [{ score: 2, essay_slug: '/x', essay_path: 'x', heading: null, chunk_index: 0, text: 't' }],
        true
      ),
      true
    )
  })
})
