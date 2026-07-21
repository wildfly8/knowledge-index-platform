/**
 * Write Budget for Feature 002 archive backfill (INV-BACKFILL-001, FR-002/FR-012).
 * SSOT: contracts/public/knowledge-index/api-contract.md § Environment.
 */

export const DEFAULT_PROVIDER_DAILY_CAP = 10_000
export const DEFAULT_WRITE_BUDGET = 9_500
/** Manifest + run-record upserts reserved out of the day's budget. */
export const BOOKKEEPING_RESERVE = 5

export type WriteBudget = {
  provider_daily_cap: number
  write_budget: number
  bookkeeping_reserve: number
  chunk_write_budget: number
}

function parsePositiveInt(
  raw: string | undefined,
  fallback: number,
  name: string
): number {
  if (raw === undefined || raw.trim() === '') return fallback
  const n = Number(raw)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer (got: ${raw})`)
  }
  return n
}

export function resolveWriteBudget(
  env: NodeJS.ProcessEnv = process.env
): WriteBudget {
  const provider_daily_cap = parsePositiveInt(
    env.UPSTASH_DAILY_WRITE_CAP,
    DEFAULT_PROVIDER_DAILY_CAP,
    'UPSTASH_DAILY_WRITE_CAP'
  )
  const write_budget = parsePositiveInt(
    env.EMBED_BACKFILL_WRITE_BUDGET,
    DEFAULT_WRITE_BUDGET,
    'EMBED_BACKFILL_WRITE_BUDGET'
  )
  return {
    provider_daily_cap,
    write_budget,
    bookkeeping_reserve: BOOKKEEPING_RESERVE,
    chunk_write_budget: write_budget - BOOKKEEPING_RESERVE
  }
}

/** FR-012 fail-closed validation — throw rather than risk a quota failure. */
export function assertBudgetValid(budget: WriteBudget): void {
  if (budget.write_budget >= budget.provider_daily_cap) {
    throw new Error(
      `EMBED_BACKFILL_WRITE_BUDGET (${budget.write_budget}) must be < ` +
        `UPSTASH_DAILY_WRITE_CAP (${budget.provider_daily_cap}) — refusing to run (FR-012)`
    )
  }
  if (budget.chunk_write_budget < 1) {
    throw new Error(
      `Write budget ${budget.write_budget} leaves no chunk capacity after ` +
        `bookkeeping reserve ${budget.bookkeeping_reserve} — refusing to run`
    )
  }
}

/**
 * Running spend counter for one Backfill Batch Run. Upserts, deletes, and
 * bookkeeping (manifest) writes all count against the same daily budget.
 */
export class BudgetMeter {
  readonly budget: WriteBudget
  private upserts = 0
  private deletes = 0
  private bookkeeping = 0

  constructor(budget: WriteBudget) {
    this.budget = budget
  }

  get spentUpserts(): number {
    return this.upserts
  }

  get spentDeletes(): number {
    return this.deletes
  }

  get spentBookkeeping(): number {
    return this.bookkeeping
  }

  get spent(): number {
    return this.upserts + this.deletes + this.bookkeeping
  }

  /** Capacity left for chunk-level writes (upserts + deletes). */
  get remainingChunkCapacity(): number {
    return Math.max(
      0,
      this.budget.chunk_write_budget - this.upserts - this.deletes
    )
  }

  canSpendChunks(n: number): boolean {
    return n <= this.remainingChunkCapacity
  }

  recordUpserts(n: number): void {
    this.assertChunkSpend(n)
    this.upserts += n
  }

  recordDeletes(n: number): void {
    this.assertChunkSpend(n)
    this.deletes += n
  }

  recordBookkeeping(n = 1): void {
    this.bookkeeping += n
    if (this.spent > this.budget.write_budget) {
      throw new Error(
        `Write budget exceeded by bookkeeping: spent ${this.spent} > ` +
          `budget ${this.budget.write_budget}`
      )
    }
  }

  private assertChunkSpend(n: number): void {
    if (!this.canSpendChunks(n)) {
      throw new Error(
        `Chunk write budget exceeded: requested ${n}, remaining ` +
          `${this.remainingChunkCapacity} (INV-BACKFILL-001)`
      )
    }
  }
}
