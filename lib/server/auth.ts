export function retrieveApiSecret(): string | undefined {
  return (
    process.env.KNOWLEDGE_RETRIEVE_API_SECRET?.trim() ||
    process.env.KNOWLEDGE_PLATFORM_API_SECRET?.trim()
  )
}

export function authorizeBearer(authHeader: string | undefined): boolean {
  const secret = retrieveApiSecret()
  if (!secret) {
    return process.env.NODE_ENV !== 'production'
  }
  if (!authHeader?.startsWith('Bearer ')) return false
  const token = authHeader.slice('Bearer '.length).trim()
  return token.length > 0 && token === secret
}
