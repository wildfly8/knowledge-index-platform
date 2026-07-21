import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  EMBED_SAGA_EDGE_IDS,
  EMBED_SAGA_TRANSITIONS,
  embedTransition,
  getEmbedTransitionById
} from './embed-saga'

describe('embed-saga contract edges', () => {
  for (const edgeId of EMBED_SAGA_EDGE_IDS) {
    it(`${edgeId} is defined and matches lookup`, () => {
      const byId = getEmbedTransitionById(edgeId)
      assert.ok(byId, `missing transition ${edgeId}`)
      const byEvent = embedTransition(byId.from, byId.event)
      assert.equal(byEvent?.id, edgeId)
      assert.equal(byEvent?.to, byId.to)
    })
  }

  it('documents one row per edge id (no duplicates)', () => {
    assert.equal(EMBED_SAGA_TRANSITIONS.length, EMBED_SAGA_EDGE_IDS.length)
    const ids = EMBED_SAGA_TRANSITIONS.map((t) => t.id)
    assert.equal(new Set(ids).size, ids.length)
  })
})
