/** Embed constants / helpers with no Xenova import (safe for Next heap). */
import { createHash } from 'node:crypto'

export const DEFAULT_EMBED_PROVIDER = 'xenova' as const
export const XENOVA_MODEL = 'Xenova/all-MiniLM-L6-v2'
export const XENOVA_DIMENSION = 384

export function contentHash(text: string): string {
  return `sha256:${createHash('sha256').update(text, 'utf8').digest('hex')}`
}

export function estimateTokens(text: string): number {
  return Math.max(1, Math.ceil(text.length / 4))
}

export function embedProvider(): typeof DEFAULT_EMBED_PROVIDER {
  const raw = (process.env.EMBED_PROVIDER ?? DEFAULT_EMBED_PROVIDER).toLowerCase()
  if (raw !== 'xenova') {
    throw new Error(
      `EMBED_PROVIDER=${raw} is not supported. This project uses xenova only (no OpenAI API).`
    )
  }
  return 'xenova'
}

export function embedModelName(): string {
  embedProvider()
  return process.env.EMBED_MODEL ?? XENOVA_MODEL
}

export function embedDimension(): number {
  return XENOVA_DIMENSION
}
