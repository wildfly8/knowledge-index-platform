import type { IncomingMessage, ServerResponse } from 'node:http'
import { ConversationRepo } from '@/lib/chat/conversation-repo'
import {
  conversationalAnswer,
  persistenceRequired,
  shouldPersistConversation
} from '@/lib/chat/conversational-rag'
import { persistenceEnabled } from '@/lib/db/postgres-url'
import { warmEmbedRuntime } from '@/lib/knowledge/embed-runtime'
import { answerWithRag } from '@/lib/knowledge/chat-core'
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

    const conversationMessagesMatch = path.match(
      /^\/v1\/conversations\/([^/]+)\/messages$/
    )
    if (conversationMessagesMatch && method === 'GET') {
      if (!persistenceEnabled()) {
        sendJson(res, req, 503, { error: 'Persistence unavailable' })
        return
      }

      const conversationId = decodeURIComponent(conversationMessagesMatch[1])
      const limitRaw = url.searchParams.get('limit')
      const before = url.searchParams.get('before') ?? undefined
      const limit = limitRaw ? Number(limitRaw) : 50
      if (limitRaw && (!Number.isFinite(limit) || limit < 1 || limit > 200)) {
        sendJson(res, req, 400, { error: 'limit must be 1–200' })
        return
      }

      const repo = ConversationRepo.fromEnv()
      const conversation = await repo.getConversation(conversationId)
      if (!conversation) {
        sendJson(res, req, 404, { error: 'Conversation not found' })
        return
      }

      const messages = await repo.listMessages(conversationId, { limit, before })
      sendJson(res, req, 200, {
        conversation_id: conversationId,
        messages: messages.map((row) => ({
          id: row.id,
          role: row.role,
          content: row.content,
          created_at: row.created_at
        }))
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
      const conversation_id = (body as { conversation_id?: unknown }).conversation_id
      const title = (body as { title?: unknown }).title
      const use_external_llm = (body as { use_external_llm?: unknown }).use_external_llm

      if (typeof query !== 'string' || query.length < 1 || query.length > 2000) {
        sendJson(res, req, 400, { error: 'query must be 1–2000 characters' })
        return
      }
      if (conversation_id !== undefined && typeof conversation_id !== 'string') {
        sendJson(res, req, 400, { error: 'conversation_id must be a string' })
        return
      }
      if (title !== undefined && typeof title !== 'string') {
        sendJson(res, req, 400, { error: 'title must be a string' })
        return
      }
      if (
        use_external_llm !== undefined &&
        typeof use_external_llm !== 'boolean'
      ) {
        sendJson(res, req, 400, { error: 'use_external_llm must be a boolean' })
        return
      }

      const topK = typeof top_k === 'number' ? top_k : 5
      const minScore = typeof min_score === 'number' ? min_score : DEFAULT_MIN_ANN_SCORE
      const useRerank = typeof rerank === 'boolean' ? rerank : defaultRerankEnabled()
      const candidatePool =
        typeof candidate_pool === 'number' ? candidate_pool : undefined
      const useSynthesize =
        typeof synthesize === 'boolean' ? synthesize : true

      const chatOptions = {
        query,
        topK,
        minScore,
        rerank: useRerank,
        candidatePool,
        synthesize: useSynthesize,
        conversationId:
          typeof conversation_id === 'string' ? conversation_id : undefined,
        title: typeof title === 'string' ? title : undefined,
        useExternalLlm:
          typeof use_external_llm === 'boolean' ? use_external_llm : undefined
      }

      if (persistenceRequired(chatOptions)) {
        sendJson(res, req, 503, { error: 'Persistence unavailable' })
        return
      }

      try {
        const result = shouldPersistConversation(chatOptions)
          ? await conversationalAnswer(chatOptions)
          : {
              ...(await answerWithRag(chatOptions)),
              conversation_id: null,
              message_id: null,
              llm_meta: {
                llm_provider: null,
                llm_model: null,
                llm_fallback: false
              }
            }

        if (
          result.meta.index_status === 'no_index' ||
          result.meta.index_status === 'sync_failed'
        ) {
          sendJson(res, req, 503, { error: 'Index unavailable', meta: result.meta })
          return
        }

        sendJson(res, req, 200, {
          conversation_id: result.conversation_id,
          message_id: result.message_id,
          answer: result.answer,
          chunks: result.chunks,
          ann_chunks: result.annChunks,
          meta: result.meta,
          synthesis_fallback: result.synthesis_fallback ?? false
        })
        return
      } catch (err) {
        const message = err instanceof Error ? err.message : 'Chat failed'
        if (message === 'Conversation not found') {
          sendJson(res, req, 404, { error: message })
          return
        }
        if (message === 'Persistence unavailable') {
          sendJson(res, req, 503, { error: message })
          return
        }
        throw err
      }
    }

    sendJson(res, req, 404, { error: 'Not found' })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal error'
    console.error('[knowledge-index-platform]', message)
    sendJson(res, req, 500, { error: message })
  }
}
