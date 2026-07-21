import path from 'node:path'

/** Producer checkout that holds `content/` + `data/` (never authored here). */
export const REPO_ROOT = (
  process.env.CORPUS_ROOT?.trim() ||
  process.env.AGENTIC_FOUNDATION_REPO?.trim() ||
  process.cwd()
).replace(/[/\\]+$/, '')

export const POSTS_EXAMINED_GLOB_PREFIX = 'content/posts/examined'
export const POSTS_UNFOLDING_GLOB_PREFIX = 'content/posts/unfolding'
export const POSTS_PRE_EXAMINED_PREFIX = 'content/posts/pre-examined'

const IN_SCOPE_EXTENSIONS = new Set(['.mdx', '.md', '.txt'])

/**
 * ChatGPT / Gemini conversation year archives (~100k+ chunks) blow the
 * Upstash free-tier daily write limit in a single sync. They are excluded
 * from deploy-time sync by default; Feature 002's budgeted daily backfill
 * pipeline owns them (INV-BACKFILL-003 single-writer split).
 */
const CONVERSATION_ARCHIVE_RE =
  /^content\/posts\/unfolding\/(chatgpt|gemini)(-20\d{2})?(-p\d+)?\.mdx$/i

export function embedConversationArchives(): boolean {
  return process.env.EMBED_CONVERSATION_ARCHIVES === 'true'
}

export function isConversationArchivePath(relativePath: string): boolean {
  return CONVERSATION_ARCHIVE_RE.test(relativePath.replace(/\\/g, '/'))
}

export function isInScopePostPath(relativePath: string): boolean {
  const norm = relativePath.replace(/\\/g, '/')
  if (norm.includes('/_meta.') || norm.endsWith('_meta.ts')) return false
  if (norm.startsWith(POSTS_PRE_EXAMINED_PREFIX)) return false
  if (isConversationArchivePath(norm) && !embedConversationArchives()) {
    return false
  }
  const ext = path.extname(norm)
  if (!IN_SCOPE_EXTENSIONS.has(ext)) return false
  return (
    norm.startsWith(`${POSTS_EXAMINED_GLOB_PREFIX}/`) ||
    norm.startsWith(`${POSTS_UNFOLDING_GLOB_PREFIX}/`)
  )
}

/** `content/posts/examined/foo.mdx` → `/posts/examined/foo`
 *  `content/posts/examined/index.mdx` → `/posts/examined` (Nextra asIndexPage URL)
 */
export function essayPathToSlug(essayPath: string): string {
  const norm = essayPath.replace(/\\/g, '/')
  const withoutContent = norm.replace(/^content\//, '')
  const withoutExt = withoutContent.replace(/\.(mdx|md|txt)$/, '')
  let slug = `/${withoutExt}`
  if (slug.endsWith('/index')) {
    slug = slug.slice(0, -'/index'.length) || '/'
  }
  return slug
}

/** Index/folder pages: path ends with index.mdx, or legacy slug `/…/index`. */
export function isIndexEssay(
  chunk: { essay_slug?: string | null; essay_path?: string | null }
): boolean {
  const path = chunk.essay_path?.replace(/\\/g, '/') ?? ''
  if (/\/index\.(mdx|md|txt)$/i.test(path)) return true
  return Boolean(chunk.essay_slug?.endsWith('/index'))
}

export function vectorIdForChunk(essaySlug: string, chunkIndex: number): string {
  const safe = essaySlug.replace(/^\//, '').replace(/\//g, '--')
  return `${safe}#${chunkIndex}`
}
