import type { IncomingMessage } from 'node:http'

/** Cloud Run / reverse proxies terminate TLS; the app enforces HTTPS semantics only. */
export function httpsRequired(): boolean {
  const raw = process.env.KNOWLEDGE_REQUIRE_HTTPS?.trim().toLowerCase()
  if (raw === 'true' || raw === '1') return true
  if (raw === 'false' || raw === '0') return false
  return process.env.NODE_ENV === 'production'
}

export function requestIsSecure(req: IncomingMessage): boolean {
  const forwarded = req.headers['x-forwarded-proto']
  const proto = (Array.isArray(forwarded) ? forwarded[0] : forwarded ?? '')
    .split(',')[0]
    .trim()
    .toLowerCase()
  if (proto === 'https') return true
  if (proto === 'http') return false
  // Direct local bind (no proxy) — treat as secure only in non-production.
  return process.env.NODE_ENV !== 'production'
}

/** Liveness probes (Cloud Run, k8s) may hit HTTP without X-Forwarded-Proto. */
export function shouldRedirectToHttps(
  req: IncomingMessage,
  path: string
): boolean {
  if (!httpsRequired()) return false
  if (req.method === 'GET' && path === '/health') return false
  return !requestIsSecure(req)
}

export function httpsRedirectLocation(
  req: IncomingMessage,
  url: URL
): string {
  const hostHeader = req.headers['x-forwarded-host'] ?? req.headers.host ?? url.host
  const host = (Array.isArray(hostHeader) ? hostHeader[0] : hostHeader)
    .split(',')[0]
    .trim()
  return `https://${host}${url.pathname}${url.search}`
}

export function transportSecurityHeaders(
  isSecure: boolean
): Record<string, string> {
  if (!isSecure) return {}
  const maxAge = process.env.KNOWLEDGE_HSTS_MAX_AGE?.trim() || '31536000'
  return {
    'Strict-Transport-Security': `max-age=${maxAge}; includeSubDomains`
  }
}

export function resolveListenPort(): number {
  const raw = process.env.PORT ?? process.env.KNOWLEDGE_PLATFORM_PORT ?? '3921'
  const port = Number(raw)
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`Invalid listen port: ${raw}`)
  }
  return port
}

export function resolveListenHost(): string {
  if (process.env.KNOWLEDGE_PLATFORM_HOST?.trim()) {
    return process.env.KNOWLEDGE_PLATFORM_HOST.trim()
  }
  return process.env.NODE_ENV === 'production' ? '0.0.0.0' : '127.0.0.1'
}
