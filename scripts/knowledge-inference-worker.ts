/**
 * Long-lived Xenova embed/rerank process.
 * Spawned by lib/knowledge/inference-bridge.ts so Next.js does not hold ONNX in its heap.
 *
 * Protocol (IPC):
 *   → { id, op: 'embed', texts: string[] }
 *   → { id, op: 'rerank', query: string, passages: string[] }
 *   ← { id, ok: true, result } | { id, ok: false, error }
 *   ← { id: 0, ok: true, ready: true } on boot
 */
import {
  embedTextsRuntime
} from '../lib/knowledge/embed-runtime'
import { scoreQueryPassagePairsRuntime } from '../lib/knowledge/rerank-runtime'
import {
  context,
  propagation,
  SpanStatusCode,
  trace,
  type TextMapGetter
} from '@opentelemetry/api'

type TraceCarrier = Record<string, string>

type InMsg =
  | {
      id: number
      op: 'embed'
      texts: string[]
      traceContext?: TraceCarrier
    }
  | {
      id: number
      op: 'rerank'
      query: string
      passages: string[]
      traceContext?: TraceCarrier
    }
  | { id: number; op: 'ping' }

const tracer = trace.getTracer('knowledge-index-platform-inference-worker')
const carrierGetter: TextMapGetter<TraceCarrier> = {
  keys: (carrier) => Object.keys(carrier),
  get: (carrier, key) => carrier[key]
}

function countBucket(value: number): string {
  if (value <= 0) return '0'
  if (value === 1) return '1'
  if (value <= 5) return '2-5'
  if (value <= 10) return '6-10'
  if (value <= 20) return '11-20'
  return '>20'
}

async function handle(msg: InMsg): Promise<unknown> {
  if (msg.op === 'ping') return 'pong'
  const parentContext = msg.traceContext
    ? propagation.extract(context.active(), msg.traceContext, carrierGetter)
    : context.active()
  const spanName =
    msg.op === 'embed' ? 'inference.ipc.embed' : 'inference.ipc.rerank'
  const size = msg.op === 'embed' ? msg.texts.length : msg.passages.length

  return tracer.startActiveSpan(
    spanName,
    {
      attributes: {
        'ipc.operation': msg.op,
        'batch.size': countBucket(size)
      }
    },
    parentContext,
    async (span) => {
      try {
        const result =
          msg.op === 'embed'
            ? await embedTextsRuntime(msg.texts)
            : await scoreQueryPassagePairsRuntime(msg.query, msg.passages)
        span.setStatus({ code: SpanStatusCode.OK })
        return result
      } catch (error) {
        span.setStatus({
          code: SpanStatusCode.ERROR,
          message: error instanceof Error ? error.name : 'inference_error'
        })
        throw error
      } finally {
        span.end()
      }
    }
  )
}

process.on('message', (raw: unknown) => {
  const msg = raw as InMsg
  if (!msg || typeof msg !== 'object' || typeof msg.id !== 'number') return
  void handle(msg)
    .then((result) => {
      process.send?.({ id: msg.id, ok: true, result })
    })
    .catch((err: unknown) => {
      const error = err instanceof Error ? err.message : String(err)
      process.send?.({ id: msg.id, ok: false, error })
    })
})

process.send?.({ id: 0, ok: true, ready: true })
