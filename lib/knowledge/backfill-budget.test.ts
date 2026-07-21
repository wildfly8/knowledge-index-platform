import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BOOKKEEPING_RESERVE,
  BudgetMeter,
  DEFAULT_PROVIDER_DAILY_CAP,
  DEFAULT_WRITE_BUDGET,
  assertBudgetValid,
  resolveWriteBudget
} from './backfill-budget'

describe('resolveWriteBudget', () => {
  it('defaults to 9500 budget under a 10000 cap', () => {
    const budget = resolveWriteBudget({})
    assert.equal(budget.provider_daily_cap, DEFAULT_PROVIDER_DAILY_CAP)
    assert.equal(budget.write_budget, DEFAULT_WRITE_BUDGET)
    assert.equal(budget.chunk_write_budget, DEFAULT_WRITE_BUDGET - BOOKKEEPING_RESERVE)
    assert.doesNotThrow(() => assertBudgetValid(budget))
  })

  it('honors env overrides', () => {
    const budget = resolveWriteBudget({
      UPSTASH_DAILY_WRITE_CAP: '2000',
      EMBED_BACKFILL_WRITE_BUDGET: '100'
    })
    assert.equal(budget.provider_daily_cap, 2000)
    assert.equal(budget.write_budget, 100)
    assert.equal(budget.chunk_write_budget, 100 - BOOKKEEPING_RESERVE)
  })

  it('rejects non-integer values', () => {
    assert.throws(() =>
      resolveWriteBudget({ EMBED_BACKFILL_WRITE_BUDGET: 'lots' })
    )
    assert.throws(() => resolveWriteBudget({ UPSTASH_DAILY_WRITE_CAP: '-5' }))
  })
})

describe('assertBudgetValid (FR-012 fail-closed)', () => {
  it('refuses budget >= provider cap', () => {
    const budget = resolveWriteBudget({
      UPSTASH_DAILY_WRITE_CAP: '10000',
      EMBED_BACKFILL_WRITE_BUDGET: '10000'
    })
    assert.throws(() => assertBudgetValid(budget), /must be < /)
  })

  it('refuses budget that leaves no chunk capacity', () => {
    const budget = resolveWriteBudget({
      UPSTASH_DAILY_WRITE_CAP: '10000',
      EMBED_BACKFILL_WRITE_BUDGET: String(BOOKKEEPING_RESERVE)
    })
    assert.throws(() => assertBudgetValid(budget), /no chunk capacity/)
  })
})

describe('BudgetMeter (INV-BACKFILL-001)', () => {
  const smallBudget = () =>
    resolveWriteBudget({
      UPSTASH_DAILY_WRITE_CAP: '1000',
      EMBED_BACKFILL_WRITE_BUDGET: '105'
    })

  it('counts upserts, deletes, and bookkeeping against one budget', () => {
    const meter = new BudgetMeter(smallBudget())
    meter.recordUpserts(60)
    meter.recordDeletes(40)
    meter.recordBookkeeping(2)
    assert.equal(meter.spent, 102)
    assert.equal(meter.remainingChunkCapacity, 0)
  })

  it('never allows chunk writes past chunk_write_budget', () => {
    const meter = new BudgetMeter(smallBudget())
    assert.equal(meter.remainingChunkCapacity, 100)
    meter.recordUpserts(100)
    assert.equal(meter.canSpendChunks(1), false)
    assert.throws(() => meter.recordUpserts(1), /INV-BACKFILL-001/)
    assert.throws(() => meter.recordDeletes(1), /INV-BACKFILL-001/)
  })

  it('total spend stays strictly under the provider cap by construction', () => {
    const budget = resolveWriteBudget({})
    const meter = new BudgetMeter(budget)
    meter.recordUpserts(budget.chunk_write_budget)
    meter.recordBookkeeping(BOOKKEEPING_RESERVE)
    assert.equal(meter.spent, budget.write_budget)
    assert.ok(meter.spent < budget.provider_daily_cap)
  })
})
