// Simple JSON-RPC 2.0 LSP-like fake server over stdio
// Implements a minimal LSP handshake and publishes diagnostics

let nextId = 1;

function encode(message) {
  const json = JSON.stringify(message);
  const header = `Content-Length: ${Buffer.byteLength(json, "utf8")}\r\n\r\n`;
  return Buffer.concat([
    Buffer.from(header, "utf8"),
    Buffer.from(json, "utf8"),
  ]);
}

function decodeFrames(buffer) {
  const results = [];
  let idx;
  while ((idx = buffer.indexOf("\r\n\r\n")) !== -1) {
    const header = buffer.slice(0, idx).toString("utf8");
    const m = /Content-Length:\s*(\d+)/i.exec(header);
    const len = m ? parseInt(m[1], 10) : 0;
    const bodyStart = idx + 4;
    const bodyEnd = bodyStart + len;
    if (buffer.length < bodyEnd) break;
    const body = buffer.slice(bodyStart, bodyEnd).toString("utf8");
    results.push(body);
    buffer = buffer.slice(bodyEnd);
  }
  return { messages: results, rest: buffer };
}

let readBuffer = Buffer.alloc(0);

process.stdin.on("data", (chunk) => {
  readBuffer = Buffer.concat([readBuffer, chunk]);
  const { messages, rest } = decodeFrames(readBuffer);
  readBuffer = rest;
  for (const m of messages) handle(m);
});

function send(msg) {
  process.stdout.write(encode(msg));
}

function sendNotification(method, params) {
  send({ jsonrpc: "2.0", method, params });
}

function sendRequest(method, params) {
  const id = nextId++;
  send({ jsonrpc: "2.0", id, method, params });
  return id;
}

function handle(raw) {
  let data;
  try {
    data = JSON.parse(raw);
  } catch {
    return;
  }

  // Initialize request
  if (data.method === "initialize") {
    send({
      jsonrpc: "2.0",
      id: data.id,
      result: {
        capabilities: {
          textDocumentSync: 1,
          hoverProvider: true,
          workspaceSymbolProvider: true,
          documentSymbolProvider: true,
        },
      },
    });
    return;
  }

  // Initialized notification
  if (data.method === "initialized") {
    return;
  }

  // Configuration change
  if (data.method === "workspace/didChangeConfiguration") {
    return;
  }

  // Document open - send fake diagnostics
  if (data.method === "textDocument/didOpen") {
    const uri = data.params?.textDocument?.uri;
    if (uri) {
      setTimeout(() => {
        sendNotification("textDocument/publishDiagnostics", {
          uri,
          diagnostics: [
            {
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 5 },
              },
              severity: 1, // Error
              message: "Test error from fake LSP server",
            },
          ],
        });
      }, 50);
    }
    return;
  }

  // Document change
  if (data.method === "textDocument/didChange") {
    return;
  }

  // Hover request
  if (data.method === "textDocument/hover") {
    send({
      jsonrpc: "2.0",
      id: data.id,
      result: {
        contents: {
          kind: "markdown",
          value: "**Test hover info**\n\nThis is test hover content.",
        },
        range: {
          start: { line: data.params.position.line, character: 0 },
          end: { line: data.params.position.line, character: 10 },
        },
      },
    });
    return;
  }

  // Workspace symbol request
  if (data.method === "workspace/symbol") {
    send({
      jsonrpc: "2.0",
      id: data.id,
      result: [
        {
          name: "testFunction",
          kind: 12, // Function
          location: {
            uri: "file:///test.ts",
            range: {
              start: { line: 0, character: 0 },
              end: { line: 5, character: 1 },
            },
          },
        },
      ],
    });
    return;
  }

  // Document symbol request
  if (data.method === "textDocument/documentSymbol") {
    send({
      jsonrpc: "2.0",
      id: data.id,
      result: [
        {
          name: "TestClass",
          kind: 5, // Class
          range: {
            start: { line: 0, character: 0 },
            end: { line: 10, character: 1 },
          },
          selectionRange: {
            start: { line: 0, character: 6 },
            end: { line: 0, character: 15 },
          },
        },
      ],
    });
    return;
  }

  // Test trigger for capability requests
  if (data.method === "test/trigger") {
    const method = data.params?.method;
    if (method) sendRequest(method, {});
    return;
  }

  // Respond OK to any other request
  if (typeof data.id !== "undefined") {
    send({ jsonrpc: "2.0", id: data.id, result: null });
    return;
  }
}
