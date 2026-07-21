/** Rerank helpers with no Xenova import (safe for Next heap). */
export const XENOVA_RERANK_MODEL = 'Xenova/ms-marco-MiniLM-L-6-v2'

const MAX_CANDIDATE_POOL = 60
/** Peak RAM on Vercel: keep ANN candidate set small when cross-encoder is on. */
const VERCEL_MAX_CANDIDATE_POOL = 24

export function rerankModelName(): string {
  return process.env.RERANK_MODEL ?? XENOVA_RERANK_MODEL
}

/**
 * Cross-encoder + embed in one Fluid instance OOMs Hobby/default memory.
 * Vercel defaults to ANN-only unless KNOWLEDGE_RERANK=true (and enough RAM).
 */
export function defaultRerankEnabled(): boolean {
  const flag = (process.env.KNOWLEDGE_RERANK ?? '').toLowerCase()
  if (flag === '1' || flag === 'true' || flag === 'yes') return true
  if (flag === '0' || flag === 'false' || flag === 'no') return false
  if (process.env.VERCEL) return false
  return true
}

export function defaultCandidatePoolSize(topK: number): number {
  const k = Math.min(20, Math.max(1, topK))
  const cap = process.env.VERCEL ? VERCEL_MAX_CANDIDATE_POOL : MAX_CANDIDATE_POOL
  return Math.min(cap, Math.max(k * 6, k + 5))
}

export function clampCandidatePool(candidatePool: number, topK: number): number {
  const k = Math.min(20, Math.max(1, topK))
  const floor = Math.max(k, 1)
  const cap = process.env.VERCEL ? VERCEL_MAX_CANDIDATE_POOL : MAX_CANDIDATE_POOL
  return Math.min(cap, Math.max(floor, Math.floor(candidatePool)))
}
