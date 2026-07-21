import { createServer } from 'node:http'
import { loadEnvFiles } from '@/lib/env/load-env'
import { handleRequest } from '@/lib/server/router'

loadEnvFiles()

const port = Number(process.env.KNOWLEDGE_PLATFORM_PORT ?? '3921')
const host = process.env.KNOWLEDGE_PLATFORM_HOST ?? '127.0.0.1'

const server = createServer((req, res) => {
  void handleRequest(req, res)
})

server.listen(port, host, () => {
  console.log(
    `[knowledge-index-platform] retrieve API http://${host}:${port} (v1/retrieve, v1/status, v1/warm)`
  )
})
