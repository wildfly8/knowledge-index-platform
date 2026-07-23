import type { IncomingMessage, ServerResponse } from 'node:http'
import { warmEmbedRuntime } from '@/lib/knowledge/embed-runtime'
import {
  answerWithRag,
  type ChatAnswerResult
} from '@/lib/knowledge/chat-core'
import {
  getManifestSummary,
  retrieveKnowledge,
  type RetrievalResult
} from '@/lib/knowledge/retrieve'
import { DEFAULT_MIN_ANN_SCORE } from '@/lib/knowledge/retrieve-query'
import { warmRerankRuntime } from '@/lib/knowledge/rerank-runtime'
import { defaultRerankEnabled } from '@/lib/knowledge/rerank-meta'
import { warmGenerator } from '@/lib/knowledge/generate'
import { useGeneratorSynthesis } from '@/lib/knowledge/extractive'
import { authorizeBearer } from '@/lib/server/auth'
import {
  httpsRedirectLocation,
  requestIsSecure,
  shouldRedirectToHttps,
  transportSecurityHeaders
} from '@/lib/server/transport-security'

function sendJson(
  res: ServerResponse,
  req: IncomingMessage,
  status: number,
  body: unknown
): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(payload),
    ...transportSecurityHeaders(requestIsSecure(req))
  })
  res.end(payload)
}

async function readJsonBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  }
  const raw = Buffer.concat(chunks).toString('utf8').trim()
  if (!raw) return {}
  return JSON.parse(raw) as unknown
}

export async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse
): Promise<void> {
  const url = new URL(req.url ?? '/', 'http://localhost')
  const path = url.pathname.replace(/\/+$/, '') || '/'
  const method = req.method ?? 'GET'

  if (shouldRedirectToHttps(req, path)) {
    res.writeHead(308, {
      Location: httpsRedirectLocation(req, url),
      ...transportSecurityHeaders(false)
    })
    res.end()
    return
  }

  if (path === '/health' && method === 'GET') {
    sendJson(res, req, 200, { ok: true })
    return
  }

  if (!authorizeBearer(req.headers.authorization)) {
    sendJson(res, req, 401, { error: 'Unauthorized' })
    return
  }

  try {
    if (path === '/v1/status' && method === 'GET') {
      const summary = await getManifestSummary()
      sendJson(res, req, 200, {
        index_status: summary.status,
        manifest_digest: summary.manifest_digest,
        vector_count: summary.vector_count,
        dimension: summary.dimension,
        model: summary.model,
        last_sync_at: summary.last_sync_at,
        stale: summary.stale,
        last_error: summary.last_error
      })
      return
    }

    if (path === '/v1/warm' && method === 'POST') {
      const started = Date.now()
      const wantRerank = defaultRerankEnabled()
      await warmEmbedRuntime()
      if (wantRerank) await warmRerankRuntime()
      let generator: Record<string, unknown> = {
        skipped: true,
        reason: 'extractive-only (GENERATOR_SYNTHESIZE not true)'
      }
      if (useGeneratorSynthesis()) {
        await warmGenerator()
        generator = { warmed: true }
      }
      sendJson(res, req, 200, {
        embed_rerank_warmed: true,
        rerank_warmed: wantRerank,
        warm_ms: Date.now() - started,
        ready: true,
        ...generator
      })
      return
    }

    if (path === '/v1/retrieve' && method === 'POST') {
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, req, 400, { error: 'Invalid JSON body' })
        return
      }

      const query = (body as { query?: unknown }).query
      const top_k = (body as { top_k?: unknown }).top_k
      const min_score = (body as { min_score?: unknown }).min_score
      const rerank = (body as { rerank?: unknown }).rerank
      const candidate_pool = (body as { candidate_pool?: unknown }).candidate_pool

      if (typeof query !== 'string' || query.length < 1 || query.length > 2000) {
        sendJson(res, req, 400, { error: 'query must be 1–2000 characters' })
        return
      }

      const topK = typeof top_k === 'number' ? top_k : 5
      const minScore = typeof min_score === 'number' ? min_score : DEFAULT_MIN_ANN_SCORE
      const useRerank = typeof rerank === 'boolean' ? rerank : defaultRerankEnabled()
      const candidatePool =
        typeof candidate_pool === 'number' ? candidate_pool : undefined

      const result: RetrievalResult = await retrieveKnowledge({
        query,
        topK,
        minScore,
        rerank: useRerank,
        candidatePool
      })

      if (
        result.meta.index_status === 'no_index' ||
        result.meta.index_status === 'sync_failed'
      ) {
        sendJson(res, req, 503, { error: 'Index unavailable', meta: result.meta })
        return
      }

      sendJson(res, req, 200, {
        chunks: result.chunks,
        ann_chunks: result.annChunks,
        meta: result.meta
      })
      return
    }

    if (path === '/v1/chat' && method === 'POST') {
      let body: unknown
      try {
        body = await readJsonBody(req)
      } catch {
        sendJson(res, req, 400, { error: 'Invalid JSON body' })
        return
      }

      const query = (body as { query?: unknown }).query
      const top_k = (body as { top_k?: unknown }).top_k
      const min_score = (body as { min_score?: unknown }).min_score
      const rerank = (body as { rerank?: unknown }).rerank
      const candidate_pool = (body as { candidate_pool?: unknown }).candidate_pool
      const synthesize = (body as { synthesize?: unknown }).synthesize

      if (typeof query !== 'string' || query.length < 1 || query.length > 2000) {
        sendJson(res, req, 400, { error: 'query must be 1–2000 characters' })
        return
      }

      const topK = typeof top_k === 'number' ? top_k : 5
      const minScore = typeof min_score === 'number' ? min_score : DEFAULT_MIN_ANN_SCORE
      const useRerank = typeof rerank === 'boolean' ? rerank : defaultRerankEnabled()
      const candidatePool =
        typeof candidate_pool === 'number' ? candidate_pool : undefined
      const useSynthesize =
        typeof synthesize === 'boolean' ? synthesize : true

      const result: ChatAnswerResult = await answerWithRag({
        query,
        topK,
        minScore,
        rerank: useRerank,
        candidatePool,
        synthesize: useSynthesize
      })

      if (
        result.meta.index_status === 'no_index' ||
        result.meta.index_status === 'sync_failed'
      ) {
        sendJson(res, req, 503, { error: 'Index unavailable', meta: result.meta })
        return
      }

      sendJson(res, req, 200, {
        answer: result.answer,
        chunks: result.chunks,
        ann_chunks: result.annChunks,
        meta: result.meta,
        synthesis_fallback: result.synthesis_fallback ?? false
      })
      return
    }

    sendJson(res, req, 404, { error: 'Not found' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[knowledge-index-platform]', message)
    sendJson(res, req, 500, { error: message })
  }
}
