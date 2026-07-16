// Minimal JSON-RPC 2.0 LSP-like fake server that reports diagnostics via the
// PULL model (textDocument/diagnostic) instead of pushing publishDiagnostics.
// Mirrors how typescript-go (tsgo) behaves, so the client's pull path can be
// tested without the real binary.

import { send, start } from './fake-lsp-transport.js'

start((data) => {

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
    const uri = data.params?.textDocument?.uri ?? ''
    if (uri.includes('failed-pull')) {
      send({
        jsonrpc: '2.0',
        id: data.id,
        error: { code: -32603, message: 'Simulated pull failure' },
      })
      return
    }
    if (uri.includes('unchanged-pull')) {
      send({ jsonrpc: '2.0', id: data.id, result: { kind: 'unchanged' } })
      return
    }
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
})
