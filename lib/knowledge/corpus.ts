import fs from 'node:fs'
import path from 'node:path'
import { createHash } from 'node:crypto'
import { REPO_ROOT, isInScopePostPath } from '@/lib/knowledge/paths'
import { contentHash } from '@/lib/knowledge/embed'

export type CorpusFile = {
  essay_path: string
  content_hash: string
}

/** LF-normalize so Windows (dev) and Linux Vercel builds share the same digest. */
export function normalizeCorpusText(text: string): string {
  return text.replace(/\r\n/g, '\n')
}

/**
 * Activity / ChatGPT / Gemini year dumps live under data/ (thin Nextra stubs in content/).
 * Keep essay_path as the content/ stub path for stable vector IDs.
 */
export function resolveCorpusSourcePath(essayPath: string): string {
  const activity = essayPath.match(
    /^content\/posts\/unfolding\/(activity-20\d{2})\.mdx$/
  )
  if (activity) {
    const archive = path.join(
      REPO_ROOT,
      'data/unfolding-activity',
      `${activity[1]}.mdx`
    )
    if (fs.existsSync(archive)) return archive
  }
  const chatgpt = essayPath.match(
    /^content\/posts\/unfolding\/(chatgpt-20\d{2})\.mdx$/
  )
  if (chatgpt) {
    const archive = path.join(
      REPO_ROOT,
      'data/unfolding-chatgpt',
      `${chatgpt[1]}.mdx`
    )
    if (fs.existsSync(archive)) return archive
  }
  const gemini = essayPath.match(
    /^content\/posts\/unfolding\/(gemini-20\d{2})\.mdx$/
  )
  if (gemini) {
    const archive = path.join(
      REPO_ROOT,
      'data/unfolding-gemini',
      `${gemini[1]}.mdx`
    )
    if (fs.existsSync(archive)) return archive
  }
  return path.join(REPO_ROOT, essayPath)
}

function walkDir(dir: string, acc: CorpusFile[]): void {
  if (!fs.existsSync(dir)) return
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walkDir(full, acc)
      continue
    }
    const rel = path.relative(REPO_ROOT, full).replace(/\\/g, '/')
    if (!isInScopePostPath(rel)) continue
    const text = normalizeCorpusText(
      fs.readFileSync(resolveCorpusSourcePath(rel), 'utf8')
    )
    acc.push({ essay_path: rel, content_hash: contentHash(text) })
  }
}

let cachedCorpus: CorpusFile[] | null = null
let cachedDigest: string | null = null

export function listCorpusFiles(): CorpusFile[] {
  if (cachedCorpus) return cachedCorpus
  const files: CorpusFile[] = []
  walkDir(path.join(REPO_ROOT, 'content/posts/examined'), files)
  walkDir(path.join(REPO_ROOT, 'content/posts/unfolding'), files)
  files.sort((a, b) => a.essay_path.localeCompare(b.essay_path))
  cachedCorpus = files
  return files
}

export function computeCorpusDigest(files?: CorpusFile[]): string {
  if (!files && cachedDigest) return cachedDigest
  const list = files ?? listCorpusFiles()
  const lines = list.map((f) => `${f.essay_path}:${f.content_hash}`)
  const payload = lines.join('\n')
  const digest = `sha256:${createHash('sha256').update(payload, 'utf8').digest('hex')}`
  if (!files) cachedDigest = digest
  return digest
}

/** VR03 / INV-RAG-002 — false when corpus is unavailable at runtime (Vercel serverless). */
export function isCorpusStale(
  manifest: {
    manifest_digest: string | null
    files: Record<string, { content_hash: string }>
  },
  corpus: CorpusFile[] = listCorpusFiles()
): boolean {
  if (!manifest.manifest_digest) return true
  if (corpus.length === 0) return false

  const liveByPath = new Map(corpus.map((f) => [f.essay_path, f.content_hash]))
  for (const [essayPath, meta] of Object.entries(manifest.files)) {
    const liveHash = liveByPath.get(essayPath)
    if (!liveHash || liveHash !== meta.content_hash) return true
  }
  for (const file of corpus) {
    if (!manifest.files[file.essay_path]) return true
  }
  return false
}

export function readCorpusFile(essayPath: string): string {
  return normalizeCorpusText(
    fs.readFileSync(resolveCorpusSourcePath(essayPath), 'utf8')
  )
}
