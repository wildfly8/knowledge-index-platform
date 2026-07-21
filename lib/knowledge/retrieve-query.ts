import type { RetrievalChunk } from '@/lib/knowledge/retrieve-core'

const STOP_WORDS = new Set([
  'what',
  'whats',
  'that',
  'this',
  'with',
  'from',
  'about',
  'your',
  'have',
  'does',
  'the',
  'and',
  'for',
  'are',
  'how',
  'not',
  'any',
  'can',
  'may',
  'via',
  'per'
])

/**
 * Site domain vocabulary. Aliases are **derived** (see `deriveShortAliases`) —
 * add a canonical term here; short forms are generated automatically when unique.
 */
export const DOMAIN_GLOSSARY = [
  'catamorphism',
  'anamorphism',
  'hylomorphism',
  'coalgebra',
  'bisimulation',
  'endofunctor',
  'essayism',
  'semiosis',
  'concrescence',
  'operad',
  'prehension',
  'topos',
  'sheaf',
  'logicism',
  'physicalism',
  'idealism'
] as const

/** Morphological / synonym expansions for ANN query rewrite (optional richness). */
const GLOSSARY_EXPANSIONS: Record<string, string> = {
  catamorphism: 'catamorphism fold F-algebra initial algebra μF',
  anamorphism: 'anamorphism unfold coalgebra νF',
  coalgebra: 'coalgebra anamorphism unfold νF',
  hylomorphism: 'hylomorphism catamorphism anamorphism fold unfold',
  bisimulation: 'bisimulation final coalgebra νF observational equivalence',
  endofunctor: 'endofunctor F-algebra F-coalgebra functor',
  essayism: 'essayism dialectic dialogue method',
  semiosis: 'semiosis sign process Peirce',
  concrescence: 'concrescence Whitehead prehension process',
  operad: 'operad operations composition',
  prehension: 'prehension Whitehead concrescence',
  topos: 'topos local truth sheaf',
  sheaf: 'sheaf topos local sections gluing',
  logicism: 'logicism Frege analytic membership',
  physicalism: 'physicalism quotient matter',
  idealism: 'idealism quotient mind'
}

const MORPHOLOGY_SUFFIXES = [
  'morphism',
  'algebra',
  'omorphism',
  'ification',
  'escence',
  'ulation',
  'unction',
  'osis',
  'ism',
  'ogy',
  'ion'
] as const

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Build short-form → canonical map from a glossary.
 * Keeps an alias only when **exactly one** glossary term claims it (no collisions).
 *
 * Candidates per term:
 * - unique prefixes of length 3–4
 * - stem after stripping morphology suffixes (*morphism, *algebra, *ism, …)
 * - prefixes of those stems (so `ana` ← anamorph ← anamorphism)
 */
export function deriveShortAliases(
  glossary: readonly string[]
): Record<string, string> {
  const unique = [...new Set(glossary.map((t) => t.toLowerCase()))]
  const proposals = new Map<string, Set<string>>()

  function propose(alias: string, term: string) {
    const a = alias.toLowerCase()
    if (a.length < 3 || a.length >= term.length) return
    if (STOP_WORDS.has(a)) return
    if (!/^[a-z][a-z0-9-]*$/.test(a)) return
    let set = proposals.get(a)
    if (!set) {
      set = new Set()
      proposals.set(a, set)
    }
    set.add(term)
  }

  for (const term of unique) {
    propose(term.slice(0, 3), term)
    propose(term.slice(0, 4), term)

    for (const suffix of MORPHOLOGY_SUFFIXES) {
      if (!term.endsWith(suffix)) continue
      const stem = term.slice(0, -suffix.length)
      if (stem.length < 3) continue
      propose(stem, term)
      propose(stem.slice(0, 3), term)
      propose(stem.slice(0, 4), term)
      // progressive prefixes of stem (length 3..stem.length-1)
      for (let n = 3; n < stem.length; n++) {
        propose(stem.slice(0, n), term)
      }
    }
  }

  const out: Record<string, string> = {}
  for (const [alias, terms] of proposals) {
    if (terms.size === 1) {
      out[alias] = [...terms][0]!
    }
  }
  return out
}

/** Lazily derived; regenerated if glossary list changes at module load. */
export const SHORT_ALIASES: Record<string, string> = deriveShortAliases(DOMAIN_GLOSSARY)

/**
 * Term match for ranking/extractive. Short terms (≤4) use word boundaries so
 * `ana` does not hit `anatta` / `analysis`.
 */
export function termMatchesText(term: string, text: string): boolean {
  const lower = text.toLowerCase()
  const t = term.toLowerCase()
  if (t.length <= 4) {
    return new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i').test(lower)
  }
  if (lower.includes(t)) return true
  if (t.endsWith('ism')) {
    const stem = t.slice(0, -3)
    return lower.includes(stem) || lower.includes(`${stem}ic`)
  }
  return false
}

function levenshtein(a: string, b: string): number {
  const m = a.length
  const n = b.length
  if (m === 0) return n
  if (n === 0) return m
  const row = Array.from({ length: n + 1 }, (_, i) => i)
  for (let i = 1; i <= m; i++) {
    let prev = row[0]!
    row[0] = i
    for (let j = 1; j <= n; j++) {
      const tmp = row[j]!
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      row[j] = Math.min(row[j - 1]! + 1, row[j]! + 1, prev + cost)
      prev = tmp
    }
  }
  return row[n]!
}

/** Map typo'd query words to canonical glossary terms (edit distance ≤ 2). */
export function fuzzyGlossaryTerms(query: string): string[] {
  const words =
    query
      .toLowerCase()
      .replace(/['']/g, '')
      .match(/\b[a-z][a-z0-9-]{3,}\b/g) ?? []
  const hits = new Set<string>()
  for (const word of words) {
    if (STOP_WORDS.has(word)) continue
    for (const term of DOMAIN_GLOSSARY) {
      if (word === term) {
        hits.add(term)
        continue
      }
      if (Math.abs(word.length - term.length) > 2) continue
      if (levenshtein(word, term) <= 2) hits.add(term)
    }
  }
  return [...hits]
}

/**
 * Resolve a query token against derived aliases + unique glossary prefixes.
 * Ambiguous prefixes (multiple glossary hits) resolve to nothing.
 */
export function resolveGlossaryToken(
  token: string,
  glossary: readonly string[] = DOMAIN_GLOSSARY,
  aliases: Record<string, string> = SHORT_ALIASES
): string[] {
  const t = token.toLowerCase()
  if (t.length < 3 || STOP_WORDS.has(t)) return []

  const fromAlias = aliases[t]
  if (fromAlias) return [t, fromAlias]

  const unique = [...new Set(glossary.map((g) => g.toLowerCase()))]
  if (unique.includes(t)) return [t]

  const prefixHits = unique.filter(
    (term) => term.startsWith(t) && term.length > t.length
  )
  if (prefixHits.length === 1) return [t, prefixHits[0]!]

  return []
}

function glossaryExpansion(term: string): string | null {
  return GLOSSARY_EXPANSIONS[term] ?? term
}

/** Terms for overlap scoring — literal query words, resolved aliases, fuzzy hits. */
export function matchTermsForQuery(query: string): string[] {
  const normalized = query.toLowerCase().replace(/['']/g, '')
  const literal =
    normalized.match(/\b[a-z][a-z0-9-]{3,}\b/g)?.filter((t) => !STOP_WORDS.has(t)) ??
    []
  const resolved: string[] = []
  for (const word of normalized.match(/\b[a-z]{3,}\b/g) ?? []) {
    resolved.push(...resolveGlossaryToken(word))
  }
  return [...new Set([...literal, ...resolved, ...fuzzyGlossaryTerms(query)])]
}

/** Soft score bump before top-k so term-true hits outrank loose neighbors. */
export function termOverlapBoost(
  query: string,
  chunk: Pick<RetrievalChunk, 'text' | 'heading'>
): number {
  const terms = matchTermsForQuery(query)
  if (terms.length === 0) return 0
  const haystack = `${chunk.heading ?? ''} ${chunk.text}`
  let hits = 0
  for (const term of terms) {
    if (termMatchesText(term, haystack)) hits += 1
  }
  return hits * 0.2
}

/** Expand casual chat queries so bi-encoder ANN finds technical essay passages. */
export function expandRetrievalQuery(query: string): string {
  const trimmed = query.trim()
  const lower = trimmed.toLowerCase().replace(/['']/g, '')
  const parts = [trimmed]

  const resolvedTerms = new Set<string>([
    ...fuzzyGlossaryTerms(query),
    ...matchTermsForQuery(query).filter((t) =>
      (DOMAIN_GLOSSARY as readonly string[]).includes(t)
    )
  ])

  for (const term of resolvedTerms) {
    const expansion = glossaryExpansion(term)
    if (expansion) parts.push(expansion)
  }

  if (/\b(?:muf|μf|initial algebra)\b/.test(lower)) {
    parts.push('initial algebra catamorphism fold F-algebra μF')
  }
  if (/\b(?:nuf|νf|final coalgebra)\b/.test(lower)) {
    parts.push('final coalgebra anamorphism unfold νF')
  }

  return [...new Set(parts)].join(' ')
}

/** Activity-log comment sections (detector retained; pipeline no longer drops them). */
export function isCommentChunk(
  chunk: Pick<RetrievalChunk, 'heading' | 'essay_path'>
): boolean {
  const heading = chunk.heading ?? ''
  if (/\bcomment\b/i.test(heading)) return true
  if (/^\d+\.\s+\d{4}-\d{2}-\d{2}/.test(heading)) return true
  return false
}

/** Cross-encoder logits below this are treated as non-relevant (ms-marco). */
export const DEFAULT_MIN_RERANK_SCORE = 0

/** Default bi-encoder cosine floor (stage 1). */
export const DEFAULT_MIN_ANN_SCORE = 0.5

/**
 * If ANN cosine exceeds this, a negative cross-encoder logit is coerced
 * to the positive ANN score so stage-1 hits are not wiped by CE.
 */
export const ANN_GUARANTEE_POSITIVE_CE = 0.5

/**
 * Combine raw CE logit with ANN cosine. When ANN > 0.5 and CE &lt; 0,
 * return the ANN score so the candidate stays positive past the CE floor.
 */
export function coerceRerankScore(annScore: number, ceScore: number): number {
  if (annScore > ANN_GUARANTEE_POSITIVE_CE && ceScore < 0) {
    return annScore
  }
  return ceScore
}

export function isRetrievalConfident(
  chunks: RetrievalChunk[],
  rerank: boolean,
  minRerankScore = DEFAULT_MIN_RERANK_SCORE
): boolean {
  if (chunks.length === 0) return false
  if (!rerank) return chunks[0].score >= DEFAULT_MIN_ANN_SCORE
  return chunks[0].score >= minRerankScore
}
