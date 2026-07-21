import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { authorizeBearer } from '@/lib/server/auth'

describe('authorizeBearer', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.KNOWLEDGE_RETRIEVE_API_SECRET
    delete process.env.KNOWLEDGE_PLATFORM_API_SECRET
    delete process.env.NODE_ENV
  })

  afterEach(() => {
    process.env = env
  })

  it('allows any bearer in non-production when secret unset', () => {
    process.env.NODE_ENV = 'development'
    assert.equal(authorizeBearer('Bearer anything'), true)
    assert.equal(authorizeBearer(undefined), true)
  })

  it('requires matching bearer when secret is set', () => {
    process.env.KNOWLEDGE_RETRIEVE_API_SECRET = 'test-secret'
    assert.equal(authorizeBearer('Bearer test-secret'), true)
    assert.equal(authorizeBearer('Bearer wrong'), false)
    assert.equal(authorizeBearer(undefined), false)
  })
})
