#!/usr/bin/env node
/**
 * Review Log Mobile Debug Server
 * 
 * Usage:
 *   node server.js [port]
 *   Default port: 8080
 * 
 * Features:
 *   - WebSocket server for mobile devices to send logs
 *   - HTTP endpoint for extension to fetch logs
 *   - Auto-detect local IP addresses for easy mobile connection
 */

const http = require('http')
const WebSocket = require('ws')
const os = require('os')

const PORT = parseInt(process.argv[2]) || 8080

let logs = []
const MAX_LOGS = 500
let clients = new Set()

function getLocalIPs() {
  const interfaces = os.networkInterfaces()
  const ips = []
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        ips.push(iface.address)
      }
    }
  }
  return ips
}

function addLog(entry) {
  logs.push(entry)
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(-MAX_LOGS)
  }
  clients.forEach((client) => {
    if (client.readyState === WebSocket.OPEN) {
      client.send(JSON.stringify({ type: 'new-log', entry }))
    }
  })
}

function createServer() {
  const server = http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type')

    if (req.method === 'OPTIONS') {
      res.writeHead(200)
      res.end()
      return
    }

    if (req.url === '/logs') {
      if (req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ logs }))
      } else if (req.method === 'POST') {
        let body = ''
        req.on('data', (chunk) => { body += chunk })
        req.on('end', () => {
          try {
            const data = JSON.parse(body)
            addLog(data)
            res.writeHead(200, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ success: true }))
          } catch (e) {
            res.writeHead(400, { 'Content-Type': 'application/json' })
            res.end(JSON.stringify({ error: 'Invalid JSON' }))
          }
        })
      }
    } else if (req.url === '/clear') {
      logs = []
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ success: true }))
    } else if (req.url === '/count') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ count: logs.length }))
    } else if (req.url === '/') {
      const ips = getLocalIPs()
      const html = `
<!DOCTYPE html>
<html>
<head>
  <title>Review Log Server</title>
  <style>
    body { font-family: -apple-system, sans-serif; padding: 20px; max-width: 600px; margin: 0 auto; }
    .ip-list { margin: 16px 0; padding: 12px; background: #f5f5f5; border-radius: 8px; }
    .log-item { padding: 8px; border-bottom: 1px solid #eee; font-family: monospace; font-size: 12px; }
    .log-error { color: #dc2626; }
    .log-warn { color: #d97706; }
    pre { white-space: pre-wrap; word-break: break-all; }
  </style>
</head>
<body>
  <h1>Review Log Server</h1>
  <p>Server running on port ${PORT}</p>
  <div class="ip-list">
    <strong>Mobile devices connect to:</strong><br>
    ${ips.map(ip => `<code>ws://${ip}:${PORT}/ws</code>`).join('<br>')}
  </div>
  <p>Include in mobile page:</p>
  <code>&lt;script src="https://raw.githubusercontent.com/your/repo/review-log-mob-sdk.js?host=${ips[0] || 'localhost'}:${PORT}"&gt;&lt;/script&gt;</code>
  <h3>Recent Logs (${logs.length})</h3>
  <div id="logs-container">
    ${logs.slice(-20).map((log, i) => `
      <div class="log-item log-${log.payload?.level || 'log'}">
        <strong>[${new Date(log.timestamp).toLocaleTimeString()}]</strong>
        ${log.deviceType === 'mobile' ? '[MOBILE]' : '[PC]'}
        <pre>${log.payload?.text || JSON.stringify(log)}</pre>
      </div>
    `).join('')}
  </div>
</body>
</html>
      `
      res.writeHead(200, { 'Content-Type': 'text/html' })
      res.end(html)
    } else {
      res.writeHead(404)
      res.end()
    }
  })

  const wss = new WebSocket.Server({ server, path: '/ws' })

  wss.on('connection', (ws) => {
    clients.add(ws)
    console.log('Client connected')

    ws.on('message', (message) => {
      try {
        const data = JSON.parse(message)
        addLog(data)
        console.log(`[${data.deviceType}] ${data.type}: ${data.payload?.text?.slice(0, 100)}...`)
      } catch (e) {
        console.error('Invalid message:', e)
      }
    })

    ws.on('close', () => {
      clients.delete(ws)
      console.log('Client disconnected')
    })

    ws.on('error', (error) => {
      console.error('WebSocket error:', error)
    })
  })

  return server
}

const server = createServer()
const ips = getLocalIPs()

server.listen(PORT, () => {
  console.log('\n========================================')
  console.log('Review Log Mobile Debug Server Started')
  console.log('========================================')
  console.log(`\nServer running on port ${PORT}`)
  console.log('\nMobile devices can connect to:')
  ips.forEach(ip => {
    console.log(`  • ws://${ip}:${PORT}/ws`)
  })
  console.log('\nHTTP endpoints:')
  console.log(`  • http://localhost:${PORT}/logs (GET/POST)`)
  console.log(`  • http://localhost:${PORT}/clear`)
  console.log(`  • http://localhost:${PORT}/count`)
  console.log(`  • http://localhost:${PORT}/ (dashboard)`)
  console.log('\nInclude this script in your mobile page:')
  console.log(`  <script src="review-log-mob-sdk.js?host=${ips[0] || 'localhost'}:${PORT}"></script>`)
  console.log('\n========================================')
})

process.on('SIGINT', () => {
  console.log('\nShutting down server...')
  server.close(() => {
    process.exit(0)
  })
})
