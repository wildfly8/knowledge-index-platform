/**
 * Process state machine for Feature 001 embedding sync saga.
 * SSOT: specs/001-posts-vector-index/spec.md § SAGA-EMBED-001.
 */

export const EMBED_PROCESS_STATES = [
  'no_index',
  'stale',
  'sync_pending',
  'sync_running',
  'index_current',
  'sync_failed'
] as const

export type EmbedProcessState = (typeof EMBED_PROCESS_STATES)[number]

export const EMBED_SAGA_EDGE_IDS = [
  'EM01',
  'EM02',
  'EM03',
  'EM04',
  'EM05',
  'EM06',
  'EM07',
  'EM08',
  'EM09'
] as const

export type EmbedSagaEdgeId = (typeof EMBED_SAGA_EDGE_IDS)[number]

export type EmbedSagaEvent =
  | 'deploy_build_ok'
  | 'posts_digest_changed'
  | 'sync_start'
  | 'schedule_sync'
  | 'sync_complete'
  | 'sync_error'
  | 'sync_retry'
  | 'posts_digest_unchanged'

export type EmbedSagaTransition = {
  id: EmbedSagaEdgeId
  from: EmbedProcessState
  event: EmbedSagaEvent
  to: EmbedProcessState
  compensation?: string
}

export const EMBED_SAGA_TRANSITIONS: readonly EmbedSagaTransition[] = [
  { id: 'EM01', from: 'no_index', event: 'deploy_build_ok', to: 'sync_running' },
  {
    id: 'EM02',
    from: 'index_current',
    event: 'posts_digest_changed',
    to: 'stale'
  },
  { id: 'EM03', from: 'stale', event: 'sync_start', to: 'sync_running' },
  {
    id: 'EM04',
    from: 'stale',
    event: 'schedule_sync',
    to: 'sync_pending',
    compensation: 'Queue job for next deploy hook'
  },
  { id: 'EM05', from: 'sync_pending', event: 'sync_start', to: 'sync_running' },
  {
    id: 'EM06',
    from: 'sync_running',
    event: 'sync_complete',
    to: 'index_current'
  },
  {
    id: 'EM07',
    from: 'sync_running',
    event: 'sync_error',
    to: 'sync_failed',
    compensation: 'Operator sync_retry'
  },
  { id: 'EM08', from: 'sync_failed', event: 'sync_retry', to: 'sync_running' },
  {
    id: 'EM09',
    from: 'index_current',
    event: 'posts_digest_unchanged',
    to: 'index_current',
    compensation: 'Skip sync (idempotent deploy)'
  }
] as const

const transitionKey = (from: EmbedProcessState, event: EmbedSagaEvent) =>
  `${from}:${event}`

const TRANSITION_LOOKUP = new Map<string, EmbedSagaTransition>(
  EMBED_SAGA_TRANSITIONS.map((t) => [transitionKey(t.from, t.event), t])
)

export function embedTransition(
  from: EmbedProcessState,
  event: EmbedSagaEvent
): EmbedSagaTransition | undefined {
  return TRANSITION_LOOKUP.get(transitionKey(from, event))
}

export function getEmbedTransitionById(
  id: EmbedSagaEdgeId
): EmbedSagaTransition | undefined {
  return EMBED_SAGA_TRANSITIONS.find((t) => t.id === id)
}

export function resolveEmbedEventForSync(args: {
  priorStatus: EmbedProcessState
  digestChanged: boolean
  digestUnchanged: boolean
  syncFailed?: boolean
  syncComplete?: boolean
}): EmbedSagaEvent | null {
  if (args.syncFailed) return 'sync_error'
  if (args.syncComplete) return 'sync_complete'
  if (args.digestUnchanged && args.priorStatus === 'index_current') {
    return 'posts_digest_unchanged'
  }
  if (args.digestChanged && args.priorStatus === 'index_current') {
    return 'posts_digest_changed'
  }
  if (args.priorStatus === 'no_index') return 'deploy_build_ok'
  if (args.priorStatus === 'stale' || args.priorStatus === 'sync_pending') {
    return 'sync_start'
  }
  if (args.priorStatus === 'sync_failed') return 'sync_retry'
  return 'sync_start'
}
