/**
 * Process state machine for Feature 002 archive embedding backfill saga.
 * SSOT: specs/002-archive-embed-backfill/spec.md § SAGA-BACKFILL-001.
 */

export const BACKFILL_PROCESS_STATES = [
  'backlog_pending',
  'batch_running',
  'batch_committed',
  'backlog_complete',
  'batch_failed'
] as const

export type BackfillProcessState = (typeof BACKFILL_PROCESS_STATES)[number]

export const BACKFILL_SAGA_EDGE_IDS = [
  'BF01',
  'BF02',
  'BF03',
  'BF04',
  'BF05',
  'BF06',
  'BF07',
  'BF08'
] as const

export type BackfillSagaEdgeId = (typeof BACKFILL_SAGA_EDGE_IDS)[number]

export type BackfillSagaEvent =
  | 'daily_schedule'
  | 'batch_upsert_ok'
  | 'backlog_remaining'
  | 'backlog_drained'
  | 'batch_error'
  | 'batch_retry'
  | 'archive_content_changed'

export type BackfillSagaTransition = {
  id: BackfillSagaEdgeId
  from: BackfillProcessState
  event: BackfillSagaEvent
  to: BackfillProcessState
  compensation?: string
}

export const BACKFILL_SAGA_TRANSITIONS: readonly BackfillSagaTransition[] = [
  {
    id: 'BF01',
    from: 'backlog_pending',
    event: 'daily_schedule',
    to: 'batch_running'
  },
  {
    id: 'BF02',
    from: 'batch_running',
    event: 'batch_upsert_ok',
    to: 'batch_committed'
  },
  {
    id: 'BF03',
    from: 'batch_committed',
    event: 'backlog_remaining',
    to: 'backlog_pending'
  },
  {
    id: 'BF04',
    from: 'batch_committed',
    event: 'backlog_drained',
    to: 'backlog_complete'
  },
  {
    id: 'BF05',
    from: 'batch_running',
    event: 'batch_error',
    to: 'batch_failed',
    compensation: 'Automatic retry with backoff'
  },
  {
    id: 'BF06',
    from: 'batch_failed',
    event: 'batch_retry',
    to: 'batch_running'
  },
  {
    id: 'BF07',
    from: 'backlog_pending',
    event: 'archive_content_changed',
    to: 'backlog_pending'
  },
  {
    id: 'BF08',
    from: 'backlog_complete',
    event: 'archive_content_changed',
    to: 'backlog_pending'
  }
] as const

const transitionKey = (from: BackfillProcessState, event: BackfillSagaEvent) =>
  `${from}:${event}`

const TRANSITION_LOOKUP = new Map<string, BackfillSagaTransition>(
  BACKFILL_SAGA_TRANSITIONS.map((t) => [transitionKey(t.from, t.event), t])
)

export function backfillTransition(
  from: BackfillProcessState,
  event: BackfillSagaEvent
): BackfillSagaTransition | undefined {
  return TRANSITION_LOOKUP.get(transitionKey(from, event))
}

export function getBackfillTransitionById(
  id: BackfillSagaEdgeId
): BackfillSagaTransition | undefined {
  return BACKFILL_SAGA_TRANSITIONS.find((t) => t.id === id)
}

/**
 * Transient run states that must not survive across process boundaries.
 * A durable plan left in one of these (crash, or BF05 status write rejected by
 * provider quota) is recovered as `batch_failed` so BF06 can resume.
 */
export function isStuckBackfillRunStatus(
  status: BackfillProcessState
): status is 'batch_running' | 'batch_committed' {
  return status === 'batch_running' || status === 'batch_committed'
}

/**
 * Normalize a durable plan status before starting a new run.
 * Stuck `batch_running` / `batch_committed` become `batch_failed` so the
 * existing BF06 (`batch_retry` → `batch_running`) edge applies — no new saga
 * edges required; FR-005 already mandates resume from the last committed cursor.
 */
export function normalizeBackfillStatusForStart(
  priorStatus: BackfillProcessState
): BackfillProcessState {
  return isStuckBackfillRunStatus(priorStatus) ? 'batch_failed' : priorStatus
}

/**
 * Resolve the event that starts a run given the durable plan status.
 * `batch_running` / `batch_committed` are transient run states; a plan left in
 * one of them (crash before finalize) is treated as a retry (after
 * {@link normalizeBackfillStatusForStart}).
 */
export function resolveBackfillStartEvent(
  priorStatus: BackfillProcessState,
  args: { archiveContentChanged: boolean }
): BackfillSagaEvent {
  const status = normalizeBackfillStatusForStart(priorStatus)
  if (status === 'backlog_complete') {
    // Only new content re-opens a completed plan (BF08).
    return 'archive_content_changed'
  }
  if (status === 'batch_failed') return 'batch_retry'
  if (args.archiveContentChanged) return 'archive_content_changed'
  return 'daily_schedule'
}
