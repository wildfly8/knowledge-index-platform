/** Cloud Run E2E / deploy config resolution (Feature 005). */

export type CloudE2EConfig = {
  cloudRunUri: string
  retrieveApiSecret: string
}

export type TfvarsSeed = {
  projectId: string | null
  region: string | null
}

const PLACEHOLDER = /^(REPLACE_|your-|replace-with|$)/i

export function parseTfvarLine(content: string, name: string): string | null {
  const pattern = new RegExp(`^\\s*${name}\\s*=\\s*(.+)$`, 'm')
  const match = content.match(pattern)
  if (!match) return null
  return match[1].trim().replace(/^"/, '').replace(/"$/, '')
}

export function parseTfvarsSeed(content: string): TfvarsSeed {
  return {
    projectId: parseTfvarLine(content, 'project_id'),
    region: parseTfvarLine(content, 'region')
  }
}

export function isPlaceholder(value: string | null | undefined): boolean {
  if (!value?.trim()) return true
  return PLACEHOLDER.test(value.trim())
}

export function resolveCloudE2EConfig(
  env: NodeJS.ProcessEnv = process.env
): CloudE2EConfig {
  return {
    cloudRunUri: (env.CLOUD_RUN_URI ?? '').trim(),
    retrieveApiSecret: (
      env.KNOWLEDGE_RETRIEVE_API_SECRET ??
      env.RETRIEVE_API_SECRET ??
      ''
    ).trim()
  }
}

export function missingCloudE2EFields(config: CloudE2EConfig): string[] {
  const missing: string[] = []
  if (!config.cloudRunUri) missing.push('cloudRunUri')
  if (!config.retrieveApiSecret) missing.push('retrieveApiSecret')
  if (config.retrieveApiSecret && config.retrieveApiSecret.length < 32) {
    missing.push('retrieveApiSecret(minLength32)')
  }
  return missing
}

export function validateCloudE2EConfig(config: CloudE2EConfig): void {
  const missing = missingCloudE2EFields(config)
  if (missing.length > 0) {
    throw new Error(
      `Missing cloud E2E configuration: ${missing.join(', ')}. ` +
        'Apply infra/gcp runtime or set CLOUD_RUN_URI and KNOWLEDGE_RETRIEVE_API_SECRET.'
    )
  }
}

export function normalizeCloudRunUri(uri: string): string {
  return uri.trim().replace(/\/+$/, '')
}
