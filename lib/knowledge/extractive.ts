import type { RetrievalChunk } from '@/lib/knowledge/retrieval-types'
import { matchTermsForQuery, termMatchesText } from '@/lib/knowledge/retrieve-query'
import { isIndexEssay } from '@/lib/knowledge/paths'

export function queryTerms(query: string): string[] {
  return matchTermsForQuery(query)
}

function termInText(term: string, text: string): boolean {
  return termMatchesText(term, text)
}

export function chunkRelevanceScore(
  query: string,
  terms: string[],
  chunk: Pick<RetrievalChunk, 'text' | 'heading' | 'score' | 'essay_slug' | 'essay_path'>
): number {
  const text = `${chunk.heading ?? ''} ${chunk.text}`
  let overlap = 0
  for (const term of terms) {
    if (termInText(term, text)) overlap += 1
  }
  let score = overlap * 10 + chunk.score
  if (isIndexEssay(chunk)) score -= 8
  return score
}

export function rankChunksForQuery<
  T extends Pick<RetrievalChunk, 'text' | 'heading' | 'score' | 'essay_slug' | 'essay_path'>
>(query: string, chunks: T[]): T[] {
  const terms = queryTerms(query)
  return [...chunks].sort(
    (a, b) => chunkRelevanceScore(query, terms, b) - chunkRelevanceScore(query, terms, a)
  )
}

export function cleanPassageText(text: string): string {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/\|[-\s|:]+\|/g, ' ')
    .replace(/\|[^|\n]{1,120}\|/g, ' ')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`([^`]+)`/g, '$1')
    .replace(/!\[[^\]]*]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)]\([^)]+\)/g, '$1')
    .replace(/\[([^\]]+)]\[[^\]]*]/g, '$1')
    .replace(/<#?[a-zA-Z0-9_-]+>/g, ' ')
    .replace(/<\/?[a-zA-Z][^>]*>/g, ' ')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/^>\s+/gm, '')
    .replace(/^[-*+]\s+/gm, '')
    .replace(/^\d+\.\s+/gm, '')
    .replace(/\[\^[^\]]+]/g, ' ')
    .replace(/^\[[^\]]+]:\s+\S+.*$/gm, ' ')
    .replace(/\s*---+?\s*/g, ' — ')
    .replace(/\n+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Title / mid-phrase abbreviations: period is never a sentence end.
 * Deliberately excludes etc./al. — those often end sentences ("etc. Then…").
 */
const TITLE_ABBREVIATIONS = [
  'mr',
  'mrs',
  'ms',
  'dr',
  'prof',
  'sr',
  'jr',
  'st',
  'vs',
  'eg',
  'e.g',
  'ie',
  'i.e',
  'cf',
  'approx',
  'dept',
  'est',
  'fig',
  'nos',
  'vol',
  'pp',
  'eds',
  'gov',
  'inc',
  'ltd',
  'corp',
  'univ',
  'assn',
  'bros',
  'ph.d',
  'm.d',
  'b.a',
  'm.a',
  'b.s',
  'm.s',
  'll.b',
  'll.d',
  'a.m',
  'p.m',
  'u.s',
  'u.k',
  'u.n',
  'e.u',
  'n.b',
  'p.s',
  'q.e.d',
  'viz',
  'ibid',
  'eqn',
  'eqns',
  'resp',
  'avg'
] as const

const TITLE_ABBREV_SET = new Set(TITLE_ABBREVIATIONS.map((a) => a.toLowerCase()))

const SENTENCE_START =
  /^(?:[A-ZÀ-ÖØ-ÞΑ-ΩА-ЯЁ]|\p{Lu})/u

function isProtectedPeriod(text: string, dotIndex: number): boolean {
  const prev = text[dotIndex - 1] ?? ''
  const next = text[dotIndex + 1] ?? ''

  // Decimal / version / IP-ish: digit.digit
  if (/\d/.test(prev) && /\d/.test(next)) return true

  // Ellipsis already normalized to …; leftover ".." mid-token
  if (prev === '.' || next === '.') return true

  // Single-letter initial before a Name: "A. Whitehead" (not "e.g.")
  const before = text.slice(Math.max(0, dotIndex - 3), dotIndex)
  if (
    /(?:^|[\s("'])\p{L}$/u.test(before) &&
    /^\s*\p{Lu}/u.test(text.slice(dotIndex + 1, dotIndex + 4)) &&
    !/[a-z]/i.test(next)
  ) {
    return true
  }

  // Title abbreviation immediately before the period
  const wordMatch = text.slice(0, dotIndex).match(/([a-z][a-z.]{0,8})$/i)
  if (wordMatch) {
    const raw = wordMatch[1]!.toLowerCase()
    const token = raw.replace(/\.$/, '')
    if (TITLE_ABBREV_SET.has(token) || TITLE_ABBREV_SET.has(raw)) return true
  }

  // Domain / file extension / dotted id with no space after the dot
  if (/[a-z0-9]/i.test(prev) && /[a-z]/i.test(next)) return true

  return false
}

function protectNonSentenceDots(text: string): { text: string; restore: (s: string) => string } {
  const slots: string[] = []
  const stash = (value: string) => {
    const id = `\uE000${slots.length}\uE001`
    slots.push(value)
    return id
  }

  let work = text
  work = work.replace(/\b(?:https?:\/\/|ftp:\/\/|www\.)[^\s<>)"']+/gi, (m) => stash(m))
  work = work.replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, (m) => stash(m))

  let out = ''
  for (let i = 0; i < work.length; i++) {
    const ch = work[i]!
    if (ch === '.' && isProtectedPeriod(work, i)) {
      out += stash('.')
      continue
    }
    out += ch
  }

  return {
    text: out,
    restore: (s) => {
      let restored = s
      for (let i = slots.length - 1; i >= 0; i--) {
        restored = restored.split(`\uE000${i}\uE001`).join(slots[i]!)
      }
      return restored
    }
  }
}

function isSentenceBoundary(text: string, termIndex: number, termEnd: number): boolean {
  const term = text[termIndex]!
  const after = text.slice(termEnd)

  if (!after || /^\s*$/.test(after)) return true

  // Ellipsis: any following clause is a new unit (capital not required)
  if (term === '…' && /^\s+\S/.test(after)) return true

  // !? : new sentence on whitespace + non-space (handles "? The" and mid-thread "? —")
  if ((term === '!' || term === '?') && /^\s+\S/.test(after)) return true

  // Plain `.` requires a capital (or open-quote) start after whitespace
  if (term === '.') {
    const m = after.match(/^\s+/)
    if (!m) return false
    const rest = after.slice(m[0].length)
    if (SENTENCE_START.test(rest)) return true
    if (/^["«]/.test(rest)) return true
  }

  return false
}

/**
 * Extractive sentence/clause split with protection for common false boundaries
 * (abbreviations, decimals, URLs, emails, initials). Explicit scan — a single
 * global regex can skip unmatchable spans (e.g. text ending in "… —") and drop
 * clauses. Still heuristic; term-window fallback remains for leftovers.
 */
export function splitSentences(text: string): string[] {
  const clean = cleanPassageText(text)
  if (!clean) return []

  const normalized = clean
    .replace(/\u2026/g, '…')
    .replace(/\.{3,}/g, '…')
    .replace(/[!?]+/g, (m) => m[0]!)

  const { text: work, restore } = protectNonSentenceDots(normalized)
  const rawParts: string[] = []
  let start = 0

  for (let i = 0; i < work.length; i++) {
    const ch = work[i]!
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== '…') continue

    let end = i + 1
    while (/["')\]]/.test(work[end] ?? '')) end++

    if (!isSentenceBoundary(work, i, end)) continue

    const piece = work.slice(start, end).trim()
    if (piece) rawParts.push(piece)
    while (/\s/.test(work[end] ?? '')) end++
    start = end
    i = end - 1
  }

  const tail = work.slice(start).trim()
  if (tail) rawParts.push(tail)
  if (rawParts.length === 0 && work.trim()) rawParts.push(work.trim())

  const merged: string[] = []
  let pending = ''
  for (const part of rawParts) {
    let piece = restore(part).trim()
    if (!piece) continue
    if (pending) {
      piece = `${pending} ${piece}`.trim()
      pending = ''
    }
    // Glue tiny fragments / orphan closers onto the previous sentence.
    if (merged.length > 0 && (piece.length < 8 || /^(?:[)\]"'»—–-]+)$/.test(piece))) {
      merged[merged.length - 1] = `${merged[merged.length - 1]} ${piece}`.trim()
      continue
    }
    // Short heads ("Claim.") attach forward so they are not dropped.
    if (piece.length < 12) {
      pending = piece
      continue
    }
    merged.push(piece)
  }
  if (pending) {
    if (merged.length > 0) merged[merged.length - 1] = `${merged[merged.length - 1]} ${pending}`.trim()
    else merged.push(pending)
  }

  return merged.filter((s) => s.length >= 8)
}

/** Slice cleaned passage centered on the first query-term hit. */
export function passageWindowAroundTerm(
  text: string,
  terms: string[],
  maxLen = 420
): string | null {
  const clean = cleanPassageText(text)
  if (clean.length <= 20) return null

  let hitAt = -1
  let hitLen = 0
  for (const term of terms) {
    const t = term.toLowerCase()
    if (t.length <= 4) {
      const m = clean.match(new RegExp(`\\b${escapeRegExp(t)}\\b`, 'i'))
      if (m?.index != null && (hitAt < 0 || m.index < hitAt)) {
        hitAt = m.index
        hitLen = m[0].length
      }
    } else {
      const idx = clean.toLowerCase().indexOf(t)
      if (idx >= 0 && (hitAt < 0 || idx < hitAt)) {
        hitAt = idx
        hitLen = t.length
      }
    }
  }
  if (hitAt < 0) return null

  const padLeft = Math.min(100, hitAt)
  let start = hitAt - padLeft
  let end = Math.min(clean.length, hitAt + hitLen + (maxLen - (hitAt - start)))
  // Prefer cutting on whitespace when shrinking.
  if (start > 0) {
    const sp = clean.lastIndexOf(' ', start + 20)
    if (sp > start) start = sp + 1
  }
  if (end < clean.length) {
    const sp = clean.indexOf(' ', Math.max(start, end - 20))
    if (sp > 0) end = sp
  }
  const slice = clean.slice(start, end).trim()
  return slice.length > 20 ? slice : clean.slice(0, maxLen)
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Grounded answer: readable sentences from the best-matching chunk(s). */
export function buildExtractiveAnswer(
  query: string,
  chunks: Pick<
    RetrievalChunk,
    'text' | 'heading' | 'score' | 'essay_slug' | 'essay_path'
  >[]
): string {
  if (chunks.length === 0) return EMPTY_ANSWER

  const terms = queryTerms(query)
  const pool = chunks.filter((c) => !isIndexEssay(c))
  const ranked = rankChunksForQuery(query, pool.length > 0 ? pool : chunks)
  const sentences: string[] = []

  for (const chunk of ranked) {
    const haystack = `${chunk.heading ?? ''} ${chunk.text}`
    if (terms.length > 0 && !terms.some((t) => termInText(t, haystack))) continue

    const all = splitSentences(chunk.text)
    let withTerm = all.filter((s) => terms.some((t) => termInText(t, s)))
    // Regex split can miss the clause that holds the term — use a local window.
    if (terms.length > 0 && withTerm.length === 0) {
      const window = passageWindowAroundTerm(chunk.text, terms)
      if (!window) continue
      withTerm = [window]
    }
    const picks = (terms.length > 0 ? withTerm : all).slice(0, 2)

    for (const sentence of picks) {
      if (!sentences.includes(sentence)) sentences.push(sentence)
      if (sentences.length >= 3) break
    }
    if (sentences.length >= 2) break
  }

  return sentences.join('\n\n') || EMPTY_ANSWER
}

export const EMPTY_ANSWER =
  'I could not find relevant passages in the essay corpus to answer that question.'

export function answerMentionsQuery(query: string, answer: string): boolean {
  const terms = queryTerms(query)
  if (terms.length === 0) return answer.length >= 40
  return terms.some((t) => termInText(t, answer))
}

/** Reject heading echoes and other low-quality generative output. */
export function isAnswerAcceptable(query: string, answer: string): boolean {
  const trimmed = answer.trim()
  if (!trimmed || trimmed.length < 40) return false
  if (/^The [^.]{5,90}\.$/.test(trimmed) && !answerMentionsQuery(query, trimmed)) {
    return false
  }
  if (/^F\s+[-/:]/.test(trimmed)) return false
  return answerMentionsQuery(query, trimmed)
}

export function useGeneratorSynthesis(): boolean {
  return process.env.GENERATOR_SYNTHESIZE === 'true'
}
