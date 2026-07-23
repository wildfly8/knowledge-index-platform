import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import {
  isPlaceholder,
  missingCloudE2EFields,
  normalizeCloudRunUri,
  parseTfvarsSeed,
  resolveCloudE2EConfig,
  validateCloudE2EConfig
} from '@/lib/deploy/cloud-config'

describe('cloud-config', () => {
  it('parses project_id and region from tfvars', () => {
    const seed = parseTfvarsSeed(`
project_id = "project-abc"
region     = "us-central1"
`)
    assert.equal(seed.projectId, 'project-abc')
    assert.equal(seed.region, 'us-central1')
  })

  it('detects placeholder values', () => {
    assert.equal(isPlaceholder('your-gcp-project-id'), true)
    assert.equal(isPlaceholder('project-84207120-95a7-43ac-95e'), false)
    assert.equal(isPlaceholder(''), true)
  })

  it('resolves env overrides', () => {
    const cfg = resolveCloudE2EConfig({
      CLOUD_RUN_URI: 'https://svc.run.app/',
      KNOWLEDGE_RETRIEVE_API_SECRET: 'a'.repeat(32)
    })
    assert.equal(cfg.cloudRunUri, 'https://svc.run.app/')
    assert.equal(cfg.retrieveApiSecret.length, 32)
  })

  it('requires 32+ char retrieve secret', () => {
    const missing = missingCloudE2EFields({
      cloudRunUri: 'https://x.run.app',
      retrieveApiSecret: 'short'
    })
    assert.ok(missing.includes('retrieveApiSecret(minLength32)'))
  })

  it('validate throws when incomplete', () => {
    assert.throws(() => validateCloudE2EConfig({ cloudRunUri: '', retrieveApiSecret: '' }))
  })

  it('normalizes trailing slash on URI', () => {
    assert.equal(normalizeCloudRunUri('https://x.run.app/'), 'https://x.run.app')
  })
})
