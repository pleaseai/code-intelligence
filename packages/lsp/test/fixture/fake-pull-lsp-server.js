// Minimal JSON-RPC 2.0 LSP-like fake server that reports diagnostics via the
// PULL model (textDocument/diagnostic) instead of pushing publishDiagnostics.
// Mirrors how typescript-go (tsgo) behaves, so the client's pull path can be
// tested without the real binary.

import { Buffer } from 'node:buffer'
import process from 'node:process'

function encode(message) {
  const json = JSON.stringify(message)
  const header = `Content-Length: ${Buffer.byteLength(json, 'utf8')}\r\n\r\n`
  return Buffer.concat([
    Buffer.from(header, 'utf8'),
    Buffer.from(json, 'utf8'),
  ])
}

function decodeFrames(buffer) {
  const results = []
  let idx = buffer.indexOf('\r\n\r\n')
  while (idx !== -1) {
    const header = buffer.slice(0, idx).toString('utf8')
    const m = /Content-Length:\s*(\d+)/i.exec(header)
    const len = m ? Number.parseInt(m[1], 10) : 0
    const bodyStart = idx + 4
    const bodyEnd = bodyStart + len
    if (buffer.length < bodyEnd)
      break
    const body = buffer.slice(bodyStart, bodyEnd).toString('utf8')
    results.push(body)
    buffer = buffer.slice(bodyEnd)
    idx = buffer.indexOf('\r\n\r\n')
  }
  return { messages: results, rest: buffer }
}

let readBuffer = Buffer.alloc(0)

process.stdin.on('data', (chunk) => {
  readBuffer = Buffer.concat([readBuffer, chunk])
  const { messages, rest } = decodeFrames(readBuffer)
  readBuffer = rest
  for (const m of messages) handle(m)
})

function send(msg) {
  process.stdout.write(encode(msg))
}

function handle(raw) {
  let data
  try {
    data = JSON.parse(raw)
  }
  catch {
    return
  }

  // Initialize request - advertise a diagnostic provider (pull model).
  if (data.method === 'initialize') {
    send({
      jsonrpc: '2.0',
      id: data.id,
      result: {
        capabilities: {
          textDocumentSync: { openClose: true, change: 2 },
          diagnosticProvider: {
            identifier: 'fake',
            interFileDependencies: true,
            workspaceDiagnostics: false,
          },
        },
      },
    })
    return
  }

  // Deliberately do NOT push publishDiagnostics on didOpen/didChange — this
  // server only answers pull requests.
  if (
    data.method === 'initialized'
    || data.method === 'textDocument/didOpen'
    || data.method === 'textDocument/didChange'
    || data.method === 'textDocument/didClose'
    || data.method === 'workspace/didChangeConfiguration'
  ) {
    return
  }

  // Pull diagnostics request - return a full report with one error.
  if (data.method === 'textDocument/diagnostic') {
    send({
      jsonrpc: '2.0',
      id: data.id,
      result: {
        kind: 'full',
        items: [
          {
            range: {
              start: { line: 0, character: 0 },
              end: { line: 0, character: 5 },
            },
            severity: 1, // Error
            code: 2322,
            source: 'fake',
            message: 'Pull diagnostic from fake LSP server',
          },
        ],
      },
    })
    return
  }

  // Respond OK to any other request.
  if (typeof data.id !== 'undefined') {
    send({ jsonrpc: '2.0', id: data.id, result: null })
  }
}
