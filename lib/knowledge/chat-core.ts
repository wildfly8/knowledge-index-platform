import {
  synthesizeAnswer,
  generatorModelName,
  buildExtractiveAnswer,
  useGeneratorSynthesis
} from '@/lib/knowledge/generate'
import { cleanPassageText, EMPTY_ANSWER } from '@/lib/knowledge/extractive'
import type {
  RetrievalChunk,
  RetrievalMeta,
  RetrievalResult
} from '@/lib/knowledge/retrieval-types'
import {
  DEFAULT_MIN_ANN_SCORE,
  isRetrievalConfident
} from '@/lib/knowledge/retrieve-query'
import { retrieveKnowledge } from '@/lib/knowledge/retrieve'

export type AnswerMode = 'extractive' | 'generative'

export type ChatAnswerMeta = RetrievalMeta & {
  generator_model: string | null
  synthesized: boolean
  answer_mode: AnswerMode
}

export type ChatAnswerResult = {
  answer: string
  chunks: RetrievalChunk[]
  annChunks: RetrievalChunk[]
  meta: ChatAnswerMeta
  synthesis_fallback?: boolean
}

export type ChatAnswerOptions = {
  query: string
  topK?: number
  minScore?: number
  rerank?: boolean
  candidatePool?: number
  synthesize?: boolean
}

const EMPTY_CORPUS_ANSWER =
  'No relevant passages matched your question in the indexed essay corpus.'

function formatCitationOnlyAnswer(count: number): string {
  if (count === 0) {
    return EMPTY_CORPUS_ANSWER
  }
  return `Found ${count} relevant passage${count === 1 ? '' : 's'} (synthesis unavailable — see citations below).`
}

function isEmptyExtractiveAnswer(answer: string): boolean {
  return (
    answer === EMPTY_CORPUS_ANSWER ||
    answer === EMPTY_ANSWER ||
    answer.trim().length === 0
  )
}

export function formatAnnCandidatesSection(annChunks: RetrievalChunk[]): string {
  if (annChunks.length === 0) return ''

  const lines = annChunks.map((c, i) => {
    const title = c.heading
      ? `${c.essay_slug} — ${c.heading}`
      : c.essay_slug || c.essay_path || '(unknown)'
    const excerpt = cleanPassageText(c.text).slice(0, 280)
    const ellipsis = cleanPassageText(c.text).length > 280 ? '…' : ''
    return `${i + 1}. ${title} (ANN score ${c.score.toFixed(3)})\n   ${excerpt}${ellipsis}`
  })

  return [
    '',
    '',
    'ANN bi-encoder candidates (stage 1 — nearest neighbors from similarity search; not used as the final extractive answer):',
    '',
    ...lines
  ].join('\n')
}

function assembleAnswer(
  answer: string,
  annChunks: RetrievalChunk[],
  appendAnnSection = true
): string {
  if (!appendAnnSection || !isEmptyExtractiveAnswer(answer)) return answer
  return answer + formatAnnCandidatesSection(annChunks)
}

export async function answerWithRag(
  options: ChatAnswerOptions
): Promise<ChatAnswerResult> {
  const {
    query,
    topK = 5,
    minScore = DEFAULT_MIN_ANN_SCORE,
    rerank = true,
    candidatePool,
    synthesize = true
  } = options

  const retrieval: RetrievalResult = await retrieveKnowledge({
    query,
    topK,
    minScore,
    rerank,
    candidatePool
  })

  const baseMeta: ChatAnswerMeta = {
    ...retrieval.meta,
    generator_model: null,
    synthesized: false,
    answer_mode: 'extractive'
  }

  if (!synthesize) {
    return {
      answer: assembleAnswer(
        formatCitationOnlyAnswer(retrieval.chunks.length),
        retrieval.annChunks
      ),
      chunks: retrieval.chunks,
      annChunks: retrieval.annChunks,
      meta: baseMeta
    }
  }

  if (retrieval.chunks.length === 0) {
    return {
      answer: assembleAnswer(EMPTY_CORPUS_ANSWER, retrieval.annChunks),
      chunks: [],
      annChunks: retrieval.annChunks,
      meta: baseMeta
    }
  }

  const extractiveAnswer = buildExtractiveAnswer(query, retrieval.chunks)
  const confident = isRetrievalConfident(
    retrieval.chunks,
    retrieval.meta.rerank
  )

  const tryGenerative = useGeneratorSynthesis() && confident

  if (!tryGenerative) {
    return {
      answer: assembleAnswer(extractiveAnswer, retrieval.annChunks),
      chunks: retrieval.chunks,
      annChunks: retrieval.annChunks,
      meta: baseMeta
    }
  }

  try {
    const { answer, usedExtractiveFallback } = await synthesizeAnswer(
      query,
      retrieval.chunks
    )
    if (usedExtractiveFallback) {
      return {
        answer: assembleAnswer(answer, retrieval.annChunks),
        chunks: retrieval.chunks,
        annChunks: retrieval.annChunks,
        meta: baseMeta,
        synthesis_fallback: true
      }
    }
    return {
      answer: assembleAnswer(answer, retrieval.annChunks, false),
      chunks: retrieval.chunks,
      annChunks: retrieval.annChunks,
      meta: {
        ...retrieval.meta,
        generator_model: generatorModelName(),
        synthesized: true,
        answer_mode: 'generative'
      }
    }
  } catch {
    return {
      answer: assembleAnswer(extractiveAnswer, retrieval.annChunks),
      chunks: retrieval.chunks,
      annChunks: retrieval.annChunks,
      meta: baseMeta,
      synthesis_fallback: true
    }
  }
}
