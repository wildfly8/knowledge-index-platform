import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildExtractiveAnswer,
  isAnswerAcceptable,
  rankChunksForQuery,
  splitSentences,
  useGeneratorSynthesis
} from './extractive'

describe('buildExtractiveAnswer', () => {
  it('prefers sentences mentioning the query topic', () => {
    const answer = buildExtractiveAnswer("what's catamorphism", [
      {
        essay_slug: '/posts/examined/index',
        essay_path: 'content/posts/examined/index.mdx',
        heading: 'Index',
        score: 1.9,
        text: 'Category theory essays. F-Algebras and F-Coalgebras.'
      },
      {
        essay_slug: '/posts/examined/f-algebras',
        essay_path: 'content/posts/examined/f-algebras.mdx',
        heading: 'Algebras feel native',
        score: 1.4,
        text:
          'As a catamorphism (fold): foldList f e Nil = e. Folding is essentially forced — you are not inventing a destructor.'
      }
    ])
    assert.match(answer, /catamorphism/i)
    assert.match(answer, /fold/i)
  })

  it('extracts hyle from activity comment after a ? title with no trailing period', () => {
    const answer = buildExtractiveAnswer('hyle', [
      {
        essay_slug: '/posts/unfolding/activity-2026',
        essay_path: 'content/posts/unfolding/activity-2026.mdx',
        heading: '2893 · comment',
        score: 2.6,
        text:
          '**How does realism handle "impossible" properties (part 2)?** The Aristotelian hyle could be said to be the hidden lemegaton in realism to attain the impossible via algebraic cata after coalgebraic ana… ---'
      },
      {
        essay_slug: '/posts/unfolding/activity-2022',
        essay_path: 'content/posts/unfolding/activity-2022.mdx',
        heading: '680 · awarded',
        score: 0.67,
        text: 'Yearling ---'
      }
    ])
    assert.match(answer, /hyle/i)
    assert.doesNotMatch(answer, /Yearling/i)
  })

  it('for what\'s ana prefers anamorphism footnote over anatta comment', () => {
    const answer = buildExtractiveAnswer("what's ana?", [
      {
        essay_slug: '/posts/unfolding/activity-2023',
        essay_path: 'content/posts/unfolding/activity-2023.mdx',
        heading: '1764 · comment',
        score: 0.666,
        text:
          "Plato on lyric. We both specifically referenced 'anatta' above which is a major thesis of Buddhism."
      },
      {
        essay_slug: '/posts/examined/analytic-synthetic-muF-nuF',
        essay_path: 'content/posts/examined/analytic-synthetic-muF-nuF.mdx',
        heading: 'Naming footnote: ana, analysis, Kant',
        score: 0.662,
        text:
          'So ana in anamorphism is not a false friend of analytic in every sense: both can mean bring structure into view.'
      },
      {
        essay_slug: '/posts/unfolding/activity-2026',
        essay_path: 'content/posts/unfolding/activity-2026.mdx',
        heading: '2893 · comment',
        score: 0.593,
        text:
          'The Aristotelian hyle could be said to be the hidden lemegaton via algebraic cata after coalgebraic ana.'
      }
    ])
    assert.doesNotMatch(answer, /anatta/i)
    assert.match(answer, /anamorphism|coalgebraic ana|algebraic cata/i)
  })
})

describe('isAnswerAcceptable', () => {
  it('rejects heading-only generative echo', () => {
    assert.equal(
      isAnswerAcceptable(
        "what's catamorphism",
        'The first axis: Kant-local (relative to F).'
      ),
      false
    )
  })

  it('accepts extractive passage about the topic', () => {
    assert.equal(
      isAnswerAcceptable(
        "what's catamorphism",
        'As a catamorphism (fold), folding is essentially forced from the initial algebra.'
      ),
      true
    )
  })
})

describe('rankChunksForQuery', () => {
  it('ranks catamorphism chunk above index list', () => {
    const ranked = rankChunksForQuery("what's catamorphism", [
      {
        essay_slug: '/posts/examined/index',
        essay_path: 'content/posts/examined/index.mdx',
        heading: 'Index',
        score: 1.9,
        text: 'essay list'
      },
      {
        essay_slug: '/posts/examined/f-algebras',
        essay_path: 'content/posts/examined/f-algebras.mdx',
        heading: 'Fold',
        score: 1.4,
        text: 'catamorphism folds an F-algebra.'
      }
    ])
    assert.match(ranked[0].text, /catamorphism/)
  })
})

describe('splitSentences', () => {
  it('keeps trailing unpunctuated body after a ? title', () => {
    const parts = splitSentences(
      '**How does realism handle "impossible" properties (part 2)?** The Aristotelian hyle could be said to be the hidden lemegaton via algebraic cata after coalgebraic ana… ---'
    )
    assert.ok(parts.some((p) => /hyle/i.test(p)))
  })

  it('does not split on abbreviations', () => {
    const parts = splitSentences(
      'Dr. Smith cites e.g. Kant vs. Hume, etc. Then the fold proceeds.'
    )
    assert.equal(parts.length, 2)
    assert.match(parts[0]!, /Dr\. Smith/)
    assert.match(parts[0]!, /e\.g\./)
    assert.match(parts[1]!, /fold proceeds/)
  })

  it('does not split on decimals or versions', () => {
    const parts = splitSentences(
      'The score is 0.674 and μF is 1.0 in v2.3.4. Next we unfold γ.'
    )
    assert.equal(parts.length, 2)
    assert.match(parts[0]!, /0\.674/)
    assert.match(parts[0]!, /v2\.3\.4/)
    assert.match(parts[1]!, /unfold/)
  })

  it('does not split URLs or emails', () => {
    const parts = splitSentences(
      'See https://example.com/a.b/c?x=1 and a@b.co.uk for refs. Then fold φ.'
    )
    assert.equal(parts.length, 2)
    assert.match(parts[0]!, /https:\/\/example\.com/)
    assert.match(parts[0]!, /a@b\.co\.uk/)
  })

  it('strips markdown links and bold without losing sentence ends', () => {
    const parts = splitSentences(
      '**Claim.** See [the essay](https://x.test/posts/a.mdx) for proof. Hyle remains.'
    )
    assert.ok(parts.length >= 2)
    assert.match(parts.join(' '), /Claim/)
    assert.match(parts.join(' '), /Hyle remains/)
  })

  it('handles ellipsis and bare trailing clause', () => {
    const parts = splitSentences('First idea… second idea without a stop')
    assert.ok(parts.some((p) => /First idea/.test(p)))
    assert.ok(parts.some((p) => /second idea without a stop/.test(p)))
  })

  it('keeps initials and degrees glued', () => {
    const parts = splitSentences(
      'A. N. Whitehead (Ph.D.) wrote on process. The coalgebra unfolds next.'
    )
    assert.equal(parts.length, 2)
    assert.match(parts[0]!, /A\. N\. Whitehead/)
    assert.match(parts[0]!, /Ph\.D/)
  })

  it('handles quotes and closing parentheses after terminators', () => {
    const parts = splitSentences('He said "Fold it." (See note.) Then we move on.')
    assert.ok(parts.length >= 2)
    assert.match(parts[parts.length - 1]!, /move on/)
  })

  it('does not split on lowercase after mid-sentence period remnant', () => {
    const parts = splitSentences('Use μF. as the carrier when needed for the fold.')
    // "as" is lowercase — should stay one unit (or at most not invent a junk split)
    assert.ok(parts.some((p) => /μF/i.test(p) && /carrier/i.test(p)))
  })
})

describe('buildExtractiveAnswer typo tolerance', () => {
  it('matches catamorphism passages when user types catmorphism', () => {
    const answer = buildExtractiveAnswer("what's catmorphism", [
      {
        essay_slug: '/posts/examined/f-algebras',
        essay_path: 'content/posts/examined/f-algebras.mdx',
        heading: 'Algebras feel native',
        score: 1.4,
        text:
          'As a catamorphism (fold): foldList f e Nil = e. Folding is essentially forced — you are not inventing a destructor.'
      }
    ])
    assert.match(answer, /catamorphism/i)
  })
})

describe('useGeneratorSynthesis', () => {
  it('is opt-in via GENERATOR_SYNTHESIZE=true', () => {
    const prev = process.env.GENERATOR_SYNTHESIZE
    delete process.env.GENERATOR_SYNTHESIZE
    assert.equal(useGeneratorSynthesis(), false)
    process.env.GENERATOR_SYNTHESIZE = 'true'
    assert.equal(useGeneratorSynthesis(), true)
    if (prev === undefined) delete process.env.GENERATOR_SYNTHESIZE
    else process.env.GENERATOR_SYNTHESIZE = prev
  })
})
