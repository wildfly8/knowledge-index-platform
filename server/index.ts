import { createServer } from 'node:http'
import { loadEnvFiles } from '@/lib/env/load-env'
import { handleRequest } from '@/lib/server/router'
import {
  resolveListenHost,
  resolveListenPort
} from '@/lib/server/transport-security'

loadEnvFiles()

const port = resolveListenPort()
const host = resolveListenHost()

const server = createServer((req, res) => {
  void handleRequest(req, res)
})

server.listen(port, host, () => {
  const scheme =
    process.env.NODE_ENV === 'production' ? 'https (via proxy)' : 'http'
  console.log(
    `[knowledge-index-platform] retrieve API listening on ${host}:${port} (${scheme})`
  )
})
