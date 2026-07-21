import { contentHash, estimateTokens } from '@/lib/knowledge/embed'
import { essayPathToSlug } from '@/lib/knowledge/paths'

export type TextChunk = {
  essay_path: string
  essay_slug: string
  heading: string | null
  chunk_index: number
  text: string
  content_hash: string
  token_estimate: number
}

const TARGET_TOKENS = 500
const OVERLAP_TOKENS = 80

function stripFrontmatter(source: string): string {
  if (!source.startsWith('---')) return source
  const end = source.indexOf('\n---', 3)
  if (end === -1) return source
  return source.slice(end + 4)
}

function mdxToPlainLine(line: string): string {
  return line
    .replace(/<[^>]+>/g, ' ')
    .replace(/\{[^}]+\}/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]+\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^import\s+.+$/, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type Section = { heading: string | null; lines: string[] }

function isCommentSection(heading: string | null): boolean {
  if (!heading) return false
  if (/\bcomment\b/i.test(heading)) return true
  if (/^\d+\.\s+\d{4}-\d{2}-\d{2}/.test(heading)) return true
  return false
}

function splitSections(source: string): Section[] {
  const body = stripFrontmatter(source)
  const sections: Section[] = []
  let current: Section = { heading: null, lines: [] }

  const flush = () => {
    if (current.lines.some((l) => l.trim()) && !isCommentSection(current.heading)) {
      sections.push(current)
    }
    current = { heading: null, lines: [] }
  }

  for (const rawLine of body.split('\n')) {
    const line = rawLine.trim()
    if (!line || line.startsWith('import ')) continue
    const heading = line.match(/^#{1,6}\s+(.+)/)
    if (heading) {
      flush()
      current = { heading: heading[1].trim(), lines: [] }
      continue
    }
    if (line.startsWith('```')) continue
    const plain = mdxToPlainLine(line)
    if (plain) current.lines.push(plain)
  }
  flush()
  return sections
}

function chunkLines(lines: string[], heading: string | null): { heading: string | null; text: string }[] {
  const body = lines.join(' ').replace(/\s+/g, ' ').trim()
  if (!body) return []

  const words = body.split(/\s+/).filter(Boolean)
  const chunks: { heading: string | null; text: string }[] = []
  let start = 0
  while (start < words.length) {
    const slice = words.slice(start, start + TARGET_TOKENS)
    chunks.push({ heading, text: slice.join(' ') })
    if (start + TARGET_TOKENS >= words.length) break
    start += Math.max(1, TARGET_TOKENS - OVERLAP_TOKENS)
  }
  return chunks
}

export function chunkMdxSource(essayPath: string, source: string): TextChunk[] {
  const essay_slug = essayPathToSlug(essayPath)
  const sections = splitSections(source)
  const rawChunks = sections.flatMap((s) => chunkLines(s.lines, s.heading))

  return rawChunks.map((c, chunk_index) => ({
    essay_path: essayPath,
    essay_slug,
    heading: c.heading,
    chunk_index,
    text: c.text,
    content_hash: contentHash(c.text),
    token_estimate: estimateTokens(c.text)
  }))
}

export function chunkMdxFile(essayPath: string, source: string): TextChunk[] {
  return chunkMdxSource(essayPath, source)
}
