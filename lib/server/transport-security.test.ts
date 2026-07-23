import { describe, it, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import type { IncomingMessage } from 'node:http'
import {
  httpsRedirectLocation,
  httpsRequired,
  requestIsSecure,
  shouldRedirectToHttps,
  transportSecurityHeaders
} from '@/lib/server/transport-security'

function req(
  headers: Record<string, string | undefined> = {},
  method = 'GET'
): IncomingMessage {
  return { headers, method } as IncomingMessage
}

describe('transport-security', () => {
  const env = process.env

  beforeEach(() => {
    process.env = { ...env }
    delete process.env.KNOWLEDGE_REQUIRE_HTTPS
    delete process.env.NODE_ENV
    delete process.env.KNOWLEDGE_HSTS_MAX_AGE
  })

  afterEach(() => {
    process.env = env
  })

  it('defaults httpsRequired to false in development', () => {
    process.env.NODE_ENV = 'development'
    assert.equal(httpsRequired(), false)
  })

  it('defaults httpsRequired to true in production', () => {
    process.env.NODE_ENV = 'production'
    assert.equal(httpsRequired(), true)
  })

  it('honors KNOWLEDGE_REQUIRE_HTTPS override', () => {
    process.env.NODE_ENV = 'production'
    process.env.KNOWLEDGE_REQUIRE_HTTPS = 'false'
    assert.equal(httpsRequired(), false)
  })

  it('treats X-Forwarded-Proto https as secure', () => {
    process.env.NODE_ENV = 'production'
    assert.equal(requestIsSecure(req({ 'x-forwarded-proto': 'https' })), true)
  })

  it('treats X-Forwarded-Proto http as insecure in production', () => {
    process.env.NODE_ENV = 'production'
    assert.equal(requestIsSecure(req({ 'x-forwarded-proto': 'http' })), false)
  })

  it('redirects insecure API calls but not /health', () => {
    process.env.NODE_ENV = 'production'
    assert.equal(shouldRedirectToHttps(req({ 'x-forwarded-proto': 'http' }), '/v1/status'), true)
    assert.equal(
      shouldRedirectToHttps(req({ 'x-forwarded-proto': 'http', method: 'GET' }), '/health'),
      false
    )
  })

  it('builds redirect URL from forwarded host', () => {
    const url = new URL('http://ignored/v1/status?x=1')
    const location = httpsRedirectLocation(
      req({ host: 'svc.example', 'x-forwarded-proto': 'http' }),
      url
    )
    assert.equal(location, 'https://svc.example/v1/status?x=1')
  })

  it('adds HSTS only on secure responses', () => {
    assert.deepEqual(transportSecurityHeaders(false), {})
    assert.match(
      transportSecurityHeaders(true)['Strict-Transport-Security'] ?? '',
      /max-age=31536000/
    )
  })
})
