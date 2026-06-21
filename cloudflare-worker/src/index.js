/**
 * Review Log WebSocket Server - Cloudflare Worker
 * 
 * 使用 Durable Objects 实现 WebSocket 连接状态管理
 * 支持跨设备日志传输
 */

// Durable Object 类，用于管理 WebSocket 连接
export class WebSocketServer {
  constructor(state, env) {
    this.state = state
    this.env = env
    // 存储所有连接的 WebSocket
    this.sessions = new Map()
    // 设备房间映射
    this.deviceRooms = new Map()
  }

  // 处理 HTTP 请求（包括 WebSocket 升级）
  async fetch(request) {
    const url = new URL(request.url)
    
    // WebSocket 升级请求
    if (request.headers.get("Upgrade") === "websocket") {
      return this.handleWebSocket(request)
    }
    
    // 普通 HTTP 请求
    if (url.pathname === "/") {
      return new Response(JSON.stringify({
        name: "Review Log WebSocket Server",
        version: "1.0.0",
        status: "running",
        connections: this.sessions.size,
        endpoints: {
          ws: "/ws",
          health: "/health",
          rooms: "/rooms"
        }
      }), {
        headers: { "Content-Type": "application/json" }
      })
    }
    
    if (url.pathname === "/health") {
      return new Response(JSON.stringify({ status: "ok", connections: this.sessions.size }), {
        headers: { "Content-Type": "application/json" }
      })
    }
    
    if (url.pathname === "/rooms") {
      const rooms = {}
      for (const [deviceId, sessions] of this.deviceRooms) {
        rooms[deviceId] = sessions.length
      }
      return new Response(JSON.stringify({ rooms }), {
        headers: { "Content-Type": "application/json" }
      })
    }
    
    return new Response("Not Found", { status: 404 })
  }

  // 处理 WebSocket 连接
  async handleWebSocket(request) {
    const url = new URL(request.url)
    const deviceId = url.searchParams.get("deviceId") || "default"
    const deviceType = url.searchParams.get("deviceType") || "unknown"
    
    // 创建 WebSocket 连接
    const pair = new WebSocketPair()
    const [client, server] = Object.values(pair)
    
    // 接受 WebSocket 连接
    this.state.acceptWebSocket(server)
    
    // 存储连接信息
    const sessionId = `${deviceId}-${Date.now()}-${Math.random().toString(36).slice(2)}`
    this.sessions.set(sessionId, {
      deviceId,
      deviceType,
      ws: server,
      connectedAt: Date.now()
    })
    
    // 添加到设备房间
    if (!this.deviceRooms.has(deviceId)) {
      this.deviceRooms.set(deviceId, [])
    }
    this.deviceRooms.get(deviceId).push(sessionId)
    
    // 发送欢迎消息
    server.send(JSON.stringify({
      type: "connected",
      sessionId,
      deviceId,
      message: "Connected to Review Log WebSocket Server"
    }))
    
    return new Response(null, { status: 101, webSocket: client })
  }

  // 处理 WebSocket 消息
  async webSocketMessage(ws, message) {
    try {
      const data = JSON.parse(message)
      
      // 找到发送者的会话信息
      let senderSession = null
      for (const [sessionId, session] of this.sessions) {
        if (session.ws === ws) {
          senderSession = { sessionId, ...session }
          break
        }
      }
      
      if (!senderSession) {
        ws.send(JSON.stringify({ type: "error", message: "Session not found" }))
        return
      }
      
      // 处理不同类型的消息
      switch (data.type) {
        case "log":
        case "action":
          // 广播日志/动作消息到所有连接（包括扩展端）
          this.broadcastToAll(message, ws)
          break
        
        case "ping":
          ws.send(JSON.stringify({ type: "pong", timestamp: Date.now() }))
          break
        
        case "join":
          // 加入特定房间
          const roomId = data.roomId || senderSession.deviceId
          if (!this.deviceRooms.has(roomId)) {
            this.deviceRooms.set(roomId, [])
          }
          this.deviceRooms.get(roomId).push(senderSession.sessionId)
          ws.send(JSON.stringify({ type: "joined", roomId }))
          break
        
        default:
          // 默认广播到所有连接
          this.broadcastToAll(message, ws)
      }
    } catch (e) {
      ws.send(JSON.stringify({ type: "error", message: "Invalid message format" }))
    }
  }

  // 广播消息到所有连接
  broadcastToAll(message, excludeWs) {
    for (const [sessionId, session] of this.sessions) {
      if (session.ws !== excludeWs && session.ws.readyState === WebSocket.OPEN) {
        try {
          session.ws.send(message)
        } catch (e) {
          // 发送失败，移除连接
          this.sessions.delete(sessionId)
        }
      }
    }
  }

  // 广播消息到特定设备房间
  broadcastToRoom(deviceId, message, excludeWs) {
    const sessions = this.deviceRooms.get(deviceId)
    if (!sessions) return
    
    for (const sessionId of sessions) {
      const session = this.sessions.get(sessionId)
      if (session && session.ws !== excludeWs && session.ws.readyState === WebSocket.OPEN) {
        try {
          session.ws.send(message)
        } catch (e) {
          this.sessions.delete(sessionId)
        }
      }
    }
  }

  // WebSocket 关闭处理
  async webSocketClose(ws, code, reason) {
    // 移除连接
    for (const [sessionId, session] of this.sessions) {
      if (session.ws === ws) {
        this.sessions.delete(sessionId)
        // 从设备房间移除
        const roomSessions = this.deviceRooms.get(session.deviceId)
        if (roomSessions) {
          const index = roomSessions.indexOf(sessionId)
          if (index > -1) {
            roomSessions.splice(index, 1)
          }
          if (roomSessions.length === 0) {
            this.deviceRooms.delete(session.deviceId)
          }
        }
        break
      }
    }
  }

  // WebSocket 错误处理
  async webSocketError(ws, error) {
    console.error("WebSocket error:", error)
    // 移除连接
    for (const [sessionId, session] of this.sessions) {
      if (session.ws === ws) {
        this.sessions.delete(sessionId)
        break
      }
    }
  }
}

// 主 Worker 入口
export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url)
    
    // WebSocket 升级请求 - 路由到 Durable Object
    if (request.headers.get("Upgrade") === "websocket") {
      // 获取或创建 Durable Object 实例
      const id = env.WEBSOCKET_SERVER.idFromName("global")
      const stub = env.WEBSOCKET_SERVER.get(id)
      return stub.fetch(request)
    }
    
    // HTTP 请求 - 路由到 Durable Object 获取状态信息
    if (url.pathname === "/" || url.pathname === "/health" || url.pathname === "/rooms") {
      const id = env.WEBSOCKET_SERVER.idFromName("global")
      const stub = env.WEBSOCKET_SERVER.get(id)
      return stub.fetch(request)
    }
    
    // API 端点 - 获取历史日志（可选）
    if (url.pathname === "/api/logs") {
      // 这里可以从 KV 或其他存储中获取历史日志
      return new Response(JSON.stringify({ logs: [] }), {
        headers: { "Content-Type": "application/json" }
      })
    }
    
    return new Response("Not Found", { status: 404 })
  }
}