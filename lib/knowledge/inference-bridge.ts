import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { context, propagation } from '@opentelemetry/api'

type TraceCarrier = Record<string, string>

type RpcRequestBody =
  | { op: 'embed'; texts: string[]; traceContext?: TraceCarrier }
  | {
      op: 'rerank'
      query: string
      passages: string[]
      traceContext?: TraceCarrier
    }
  | { op: 'ping' }

type RpcRequest = RpcRequestBody & { id: number }

type RpcOk =
  | { id: number; ok: true; result: unknown }
  | { id: number; ok: true; ready: true }

type RpcResponse = RpcOk | { id: number; ok: false; error: string }

type Pending = {
  resolve: (value: unknown) => void
  reject: (err: Error) => void
}

type BridgeState = {
  child: ChildProcess | null
  starting: Promise<ChildProcess> | null
  pending: Map<number, Pending>
  nextId: number
}

const g = globalThis as typeof globalThis & { __afKnowledgeBridge?: BridgeState }

function state(): BridgeState {
  if (!g.__afKnowledgeBridge) {
    g.__afKnowledgeBridge = {
      child: null,
      starting: null,
      pending: new Map(),
      nextId: 1
    }
  }
  return g.__afKnowledgeBridge
}

function workerHeapMb(): string {
  return process.env.KNOWLEDGE_WORKER_HEAP_MB ?? '4096'
}

function attachHandlers(child: ChildProcess) {
  const s = state()
  child.on('message', (msg: RpcResponse) => {
    if (!msg || typeof msg !== 'object' || typeof msg.id !== 'number') return
    if ('ready' in msg && msg.ok) return
    const entry = s.pending.get(msg.id)
    if (!entry) return
    s.pending.delete(msg.id)
    if (msg.ok) {
      entry.resolve('result' in msg ? msg.result : undefined)
    } else {
      entry.reject(new Error(msg.error || 'inference worker error'))
    }
  })
  child.on('exit', (code, signal) => {
    if (s.child === child) s.child = null
    const err = new Error(
      `knowledge inference worker exited (code=${code}, signal=${signal})`
    )
    for (const [, p] of s.pending) p.reject(err)
    s.pending.clear()
  })
  child.on('error', (err) => {
    for (const [, p] of s.pending) p.reject(err)
    s.pending.clear()
    if (s.child === child) s.child = null
  })
}

async function ensureWorker(): Promise<ChildProcess> {
  const s = state()
  if (s.child?.connected) return s.child
  if (s.starting) return s.starting

  s.starting = new Promise<ChildProcess>((resolve, reject) => {
    const workerPath = path.join(
      process.cwd(),
      'scripts',
      'knowledge-inference-worker.ts'
    )
    const child = fork(workerPath, [], {
      execArgv: [
        '--import',
        'tsx',
        `--max-old-space-size=${workerHeapMb()}`
      ],
      // Do not inherit a huge parent NODE_OPTIONS into the worker.
      env: {
        ...process.env,
        NODE_OPTIONS: `--max-old-space-size=${workerHeapMb()}`
      },
      stdio: ['ignore', 'inherit', 'inherit', 'ipc']
    })
    attachHandlers(child)

    const bootTimeout = setTimeout(() => {
      child.kill('SIGTERM')
      reject(new Error('knowledge inference worker failed to become ready'))
    }, 120_000)

    const onReady = (msg: RpcResponse) => {
      if (msg && typeof msg === 'object' && 'ready' in msg && msg.ok) {
        clearTimeout(bootTimeout)
        child.off('message', onReady)
        s.child = child
        s.starting = null
        resolve(child)
      }
    }
    child.on('message', onReady)
    child.once('error', (err) => {
      clearTimeout(bootTimeout)
      s.starting = null
      reject(err)
    })
  })

  try {
    return await s.starting
  } catch (err) {
    s.starting = null
    throw err
  }
}

async function rpc<T>(req: RpcRequestBody): Promise<T> {
  const s = state()
  const child = await ensureWorker()
  const id = s.nextId++
  const traceContext: TraceCarrier = {}
  propagation.inject(context.active(), traceContext)
  const payload: RpcRequest = {
    ...req,
    id,
    ...(req.op === 'ping' ? {} : { traceContext })
  }

  return new Promise<T>((resolve, reject) => {
    s.pending.set(id, {
      resolve: (v) => resolve(v as T),
      reject
    })
    const ok = child.send(payload)
    if (!ok) {
      s.pending.delete(id)
      reject(new Error('failed to send message to knowledge inference worker'))
    }
  })
}

export async function workerEmbedTexts(texts: string[]): Promise<number[][]> {
  return rpc<number[][]>({ op: 'embed', texts })
}

export async function workerScoreQueryPassagePairs(
  query: string,
  passages: string[]
): Promise<number[]> {
  return rpc<number[]>({ op: 'rerank', query, passages })
}
