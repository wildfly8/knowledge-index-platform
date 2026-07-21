/**
 * Process state machine for Feature 003 platform retrieve saga.
 * SSOT: specs/003-knowledge-query-api/spec.md § SAGA-RETRIEVE-001.
 */

export const RETRIEVE_PROCESS_STATES = ['anonymous', 'session_active'] as const

export type RetrieveProcessState = (typeof RETRIEVE_PROCESS_STATES)[number]

export const RETRIEVE_SAGA_EDGE_IDS = ['VR01', 'VR02', 'VR03'] as const

export type RetrieveSagaEdgeId = (typeof RETRIEVE_SAGA_EDGE_IDS)[number]

export type RetrieveSagaEvent =
  | 'retrieval_request'
  | 'index_stale'

export type RetrieveSagaTransition = {
  id: RetrieveSagaEdgeId
  from: RetrieveProcessState
  event: RetrieveSagaEvent
  to: RetrieveProcessState
  compensation?: string
}

export const RETRIEVE_SAGA_TRANSITIONS: readonly RetrieveSagaTransition[] = [
  {
    id: 'VR01',
    from: 'anonymous',
    event: 'retrieval_request',
    to: 'anonymous',
    compensation: 'Redirect sign-in per 003 G01'
  },
  {
    id: 'VR02',
    from: 'session_active',
    event: 'retrieval_request',
    to: 'session_active'
  },
  {
    id: 'VR03',
    from: 'session_active',
    event: 'index_stale',
    to: 'session_active',
    compensation: 'Return chunks with stale=true in metadata'
  }
] as const

const transitionKey = (from: RetrieveProcessState, event: RetrieveSagaEvent) =>
  `${from}:${event}`

const TRANSITION_LOOKUP = new Map<string, RetrieveSagaTransition>(
  RETRIEVE_SAGA_TRANSITIONS.map((t) => [transitionKey(t.from, t.event), t])
)

export function retrieveTransition(
  from: RetrieveProcessState,
  event: RetrieveSagaEvent
): RetrieveSagaTransition | undefined {
  return TRANSITION_LOOKUP.get(transitionKey(from, event))
}

export function getRetrieveTransitionById(
  id: RetrieveSagaEdgeId
): RetrieveSagaTransition | undefined {
  return RETRIEVE_SAGA_TRANSITIONS.find((t) => t.id === id)
}

export function sessionToRetrieveState(
  hasSession: boolean
): RetrieveProcessState {
  return hasSession ? 'session_active' : 'anonymous'
}
