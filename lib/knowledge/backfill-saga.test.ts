import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  BACKFILL_SAGA_EDGE_IDS,
  BACKFILL_SAGA_TRANSITIONS,
  backfillTransition,
  getBackfillTransitionById,
  normalizeBackfillStatusForStart,
  resolveBackfillStartEvent
} from './backfill-saga'

describe('backfill-saga contract edges (SAGA-BACKFILL-001)', () => {
  for (const edgeId of BACKFILL_SAGA_EDGE_IDS) {
    it(`${edgeId} is defined and matches lookup`, () => {
      const byId = getBackfillTransitionById(edgeId)
      assert.ok(byId, `missing transition ${edgeId}`)
      const byEvent = backfillTransition(byId.from, byId.event)
      assert.equal(byEvent?.id, edgeId)
      assert.equal(byEvent?.to, byId.to)
    })
  }

  it('documents one row per edge id (no duplicates)', () => {
    assert.equal(BACKFILL_SAGA_TRANSITIONS.length, BACKFILL_SAGA_EDGE_IDS.length)
    const ids = BACKFILL_SAGA_TRANSITIONS.map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  it('BF05 failure edge carries a compensation (retry with backoff)', () => {
    const bf05 = getBackfillTransitionById('BF05')
    assert.ok(bf05?.compensation && /retry/i.test(bf05.compensation))
  })

  it('rejects undefined transitions (backlog_complete + daily_schedule)', () => {
    assert.equal(backfillTransition('backlog_complete', 'daily_schedule'), undefined)
  })
})

describe('resolveBackfillStartEvent', () => {
  it('backlog_pending starts via daily_schedule (BF01)', () => {
    const event = resolveBackfillStartEvent('backlog_pending', {
      archiveContentChanged: false
    })
    assert.equal(event, 'daily_schedule')
    assert.equal(backfillTransition('backlog_pending', event)?.id, 'BF01')
  })

  it('batch_failed resumes via batch_retry (BF06)', () => {
    const event = resolveBackfillStartEvent('batch_failed', {
      archiveContentChanged: false
    })
    assert.equal(event, 'batch_retry')
    assert.equal(backfillTransition('batch_failed', event)?.id, 'BF06')
  })

  it('stuck batch_running recovers as batch_retry (BF06 after normalize)', () => {
    assert.equal(normalizeBackfillStatusForStart('batch_running'), 'batch_failed')
    const event = resolveBackfillStartEvent('batch_running', {
      archiveContentChanged: false
    })
    assert.equal(event, 'batch_retry')
    const status = normalizeBackfillStatusForStart('batch_running')
    assert.equal(backfillTransition(status, event)?.id, 'BF06')
  })

  it('stuck batch_committed recovers as batch_retry (BF06 after normalize)', () => {
    assert.equal(normalizeBackfillStatusForStart('batch_committed'), 'batch_failed')
    const event = resolveBackfillStartEvent('batch_committed', {
      archiveContentChanged: false
    })
    assert.equal(event, 'batch_retry')
    const status = normalizeBackfillStatusForStart('batch_committed')
    assert.equal(backfillTransition(status, event)?.id, 'BF06')
  })

  it('changed content re-enqueues pending backlog (BF07)', () => {
    const event = resolveBackfillStartEvent('backlog_pending', {
      archiveContentChanged: true
    })
    assert.equal(event, 'archive_content_changed')
    assert.equal(backfillTransition('backlog_pending', event)?.id, 'BF07')
  })

  it('changed content re-opens a completed backlog (BF08)', () => {
    const event = resolveBackfillStartEvent('backlog_complete', {
      archiveContentChanged: true
    })
    assert.equal(event, 'archive_content_changed')
    assert.equal(backfillTransition('backlog_complete', event)?.id, 'BF08')
  })
})

describe('backfill-saga run-state transitions (BF02/BF03/BF04)', () => {
  it('BF02 commits a successful batch', () => {
    assert.equal(backfillTransition('batch_running', 'batch_upsert_ok')?.id, 'BF02')
  })

  it('BF03 returns to backlog_pending when chunks remain', () => {
    assert.equal(
      backfillTransition('batch_committed', 'backlog_remaining')?.id,
      'BF03'
    )
  })

  it('BF04 completes the backlog when drained', () => {
    assert.equal(
      backfillTransition('batch_committed', 'backlog_drained')?.id,
      'BF04'
    )
  })
})
