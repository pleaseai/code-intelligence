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
  const messages = []
  let headerEnd = buffer.indexOf('\r\n\r\n')
  while (headerEnd !== -1) {
    const header = buffer.slice(0, headerEnd).toString('utf8')
    const match = /Content-Length:\s*(\d+)/i.exec(header)
    const length = match ? Number.parseInt(match[1], 10) : 0
    const bodyStart = headerEnd + 4
    const bodyEnd = bodyStart + length
    if (buffer.length < bodyEnd) { break }
    messages.push(buffer.slice(bodyStart, bodyEnd).toString('utf8'))
    buffer = buffer.slice(bodyEnd)
    headerEnd = buffer.indexOf('\r\n\r\n')
  }
  return { messages, rest: buffer }
}

export function send(message) {
  process.stdout.write(encode(message))
}

export function start(handler) {
  let readBuffer = Buffer.alloc(0)
  process.stdin.on('data', (chunk) => {
    readBuffer = Buffer.concat([readBuffer, chunk])
    const { messages, rest } = decodeFrames(readBuffer)
    readBuffer = rest
    for (const raw of messages) {
      try {
        handler(JSON.parse(raw))
      }
      catch {
        // Ignore malformed test input.
      }
    }
  })
}
