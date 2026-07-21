import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  RETRIEVE_SAGA_EDGE_IDS,
  RETRIEVE_SAGA_TRANSITIONS,
  getRetrieveTransitionById,
  retrieveTransition,
  sessionToRetrieveState
} from './retrieve-saga'

describe('retrieve-saga contract edges', () => {
  for (const edgeId of RETRIEVE_SAGA_EDGE_IDS) {
    it(`${edgeId} is defined and matches lookup`, () => {
      const byId = getRetrieveTransitionById(edgeId)
      assert.ok(byId, `missing transition ${edgeId}`)
      const byEvent = retrieveTransition(byId.from, byId.event)
      assert.equal(byEvent?.id, edgeId)
      assert.equal(byEvent?.to, byId.to)
    })
  }

  it('documents one row per edge id (no duplicates)', () => {
    assert.equal(RETRIEVE_SAGA_TRANSITIONS.length, RETRIEVE_SAGA_EDGE_IDS.length)
  })
})

describe('retrieve-saga session mapping', () => {
  it('maps session presence to process states', () => {
    assert.equal(sessionToRetrieveState(false), 'anonymous')
    assert.equal(sessionToRetrieveState(true), 'session_active')
  })
})
