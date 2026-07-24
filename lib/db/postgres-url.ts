/** Resolve Neon / Postgres connection URL (Feature 006). */

export function postgresUrl(env: NodeJS.ProcessEnv = process.env): string | undefined {
  const url = (env.POSTGRES_URL ?? env.DATABASE_URL ?? '').trim()
  return url || undefined
}

export function persistenceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(postgresUrl(env))
}
