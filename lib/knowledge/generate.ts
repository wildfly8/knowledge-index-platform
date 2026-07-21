import type { RetrievalChunk } from '@/lib/knowledge/retrieval-types'
import { rankChunksForQuery, cleanPassageText, buildExtractiveAnswer, isAnswerAcceptable } from '@/lib/knowledge/extractive'

/**
 * Local Xenova text2text generator — default LaMini (research spike 2026-07-13).
 * Enable with GENERATOR_SYNTHESIZE=true; override model with GENERATOR_MODEL.
 */
export const XENOVA_GENERATOR_MODEL = 'Xenova/LaMini-Flan-T5-783M'

type Text2TextResult = Array<{ generated_text: string }>

type GenerationOptions = {
  max_new_tokens?: number
  do_sample?: boolean
  repetition_penalty?: number
  no_repeat_ngram_size?: number
}

type Text2TextPipeline = (
  prompt: string,
  options?: GenerationOptions
) => Promise<Text2TextResult>

let generatorPipeline: Text2TextPipeline | null = null
let warmPromise: Promise<void> | null = null

export function generatorModelName(): string {
  return process.env.GENERATOR_MODEL ?? XENOVA_GENERATOR_MODEL
}

export function isGeneratorReady(): boolean {
  return generatorPipeline !== null
}

/** Load generator ONNX in background (only needed when GENERATOR_SYNTHESIZE=true). */
export function warmGenerator(): Promise<void> {
  if (generatorPipeline) return Promise.resolve()
  if (!warmPromise) {
    warmPromise = getGenerator()
      .then(() => undefined)
      .catch((err) => {
        warmPromise = null
        throw err
      })
  }
  return warmPromise
}

async function getGenerator(): Promise<Text2TextPipeline> {
  if (!generatorPipeline) {
    const { pipeline, env } = await import('@xenova/transformers')
    const { configureXenovaEnv } = await import('@/lib/knowledge/xenova-env')
    configureXenovaEnv(env)
    generatorPipeline = (await pipeline(
      'text2text-generation',
      generatorModelName()
    )) as Text2TextPipeline
  }
  return generatorPipeline
}

export function buildRagPrompt(
  query: string,
  chunks: Pick<
    RetrievalChunk,
    'heading' | 'text' | 'score' | 'essay_slug' | 'essay_path'
  >[],
  maxContextChars = 1800
): string {
  const ranked = rankChunksForQuery(query, chunks).slice(0, 3)
  const passages = ranked.map((c) => {
    const body = cleanPassageText(c.text)
    return c.heading ? `${c.heading}: ${body}` : body
  })
  let context = passages.join('\n\n')
  if (context.length > maxContextChars) {
    context = context.slice(0, maxContextChars).replace(/\s+\S*$/, '') + '…'
  }

  return `You are a helpful assistant. Using only the context below, write a clear 2-4 sentence answer to the question. Use plain English. Do not copy section headings alone.

Context:
${context}

Question: ${query}

Answer:`
}

export function cleanGeneratedText(text: string): string {
  return text.trim().replace(/^\[\d+\]\s*/, '')
}

export function isMalformedGeneration(text: string): boolean {
  const t = cleanGeneratedText(text)
  if (!t || t.length < 8) return true
  if (/^\[\d+\]/.test(text.trim())) return true
  if (/([\s\S]{12,}?)\1{2,}/.test(t)) return true

  const lower = t.toLowerCase()
  for (let len = 18; len <= 48; len += 2) {
    for (let i = 0; i <= lower.length - len; i++) {
      const sub = lower.slice(i, i + len)
      let count = 0
      let pos = 0
      while ((pos = lower.indexOf(sub, pos)) !== -1) {
        count++
        if (count >= 3) return true
        pos += 1
      }
    }
  }

  const words = t.split(/\s+/)
  if (words.length >= 10) {
    const unique = new Set(words.map((w) => w.toLowerCase()))
    if (unique.size / words.length < 0.4) return true
  }

  return false
}

export type SynthesisResult = {
  answer: string
  usedExtractiveFallback: boolean
}

const GENERATION_OPTS: GenerationOptions = {
  max_new_tokens: 160,
  do_sample: false,
  repetition_penalty: 1.2,
  no_repeat_ngram_size: 3
}

export async function synthesizeAnswer(
  query: string,
  chunks: RetrievalChunk[]
): Promise<SynthesisResult> {
  if (chunks.length === 0) {
    return { answer: buildExtractiveAnswer(query, []), usedExtractiveFallback: false }
  }

  const prompt = buildRagPrompt(query, chunks)
  const gen = await getGenerator()
  const result = await gen(prompt, GENERATION_OPTS)
  const raw = result[0]?.generated_text?.trim() ?? ''
  const text = cleanGeneratedText(raw)

  if (
    !text ||
    isMalformedGeneration(text) ||
    !isAnswerAcceptable(query, text)
  ) {
    return {
      answer: buildExtractiveAnswer(query, chunks),
      usedExtractiveFallback: true
    }
  }

  return { answer: text, usedExtractiveFallback: false }
}

export { buildExtractiveAnswer, isAnswerAcceptable, useGeneratorSynthesis } from '@/lib/knowledge/extractive'
