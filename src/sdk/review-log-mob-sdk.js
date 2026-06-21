/**
 * Review Log Mobile SDK
 * 
 * 使用方式：
 * <script src="https://your-server/review-log-mob-sdk.js?host=192.168.1.100:8080"></script>
 * 
 * 或在代码中初始化：
 * ReviewLogSDK.init({ host: '192.168.1.100:8080' })
 */

;(function (global, factory) {
  if (typeof exports === 'object' && typeof module !== 'undefined') {
    module.exports = factory()
  } else if (typeof define === 'function' && define.amd) {
    define(factory)
  } else {
    global.ReviewLogSDK = factory()
  }
})(typeof window !== 'undefined' ? window : this, function () {
  var config = {
    host: null,
    autoConnect: true,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
    debug: false
  }

  var ws = null
  var reconnectAttempts = 0
  var isConnected = false
  var messageQueue = []
  var deviceId = null

  function generateDeviceId() {
    var id = localStorage.getItem('review-log-device-id')
    if (!id) {
      id = 'mobile-' + Date.now().toString(36) + '-' + Math.random().toString(36).substr(2, 9)
      localStorage.setItem('review-log-device-id', id)
    }
    return id
  }

  function safeStringify(value) {
    try {
      if (typeof value === 'string') return value
      if (typeof value === 'number' || typeof value === 'boolean') return String(value)
      if (value === null) return 'null'
      if (value === undefined) return 'undefined'
      if (typeof value === 'bigint') return value.toString() + 'n'
      if (typeof value === 'symbol') return value.toString()
      if (typeof value === 'function') return '[Function ' + (value.name || 'anonymous') + ']'
      return JSON.stringify(value, function (key, v) {
        if (typeof v === 'bigint') return v.toString() + 'n'
        if (typeof v === 'function') return '[Function ' + ((v && v.name) || 'anonymous') + ']'
        if (typeof v === 'undefined') return '[undefined]'
        return v
      })
    } catch {
      try {
        return String(value)
      } catch {
        return '[Unserializable]'
      }
    }
  }

  function serializeArg(value, seen) {
    seen = seen || new WeakSet()
    if (value === null) return { kind: 'null' }
    if (value === undefined) return { kind: 'undefined' }
    var t = typeof value
    if (t === 'string') return { kind: 'string', value: value }
    if (t === 'number') return { kind: 'number', value: value }
    if (t === 'boolean') return { kind: 'boolean', value: value }
    if (t === 'bigint') return { kind: 'bigint', value: value.toString() }
    if (t === 'symbol') return { kind: 'symbol', value: value.toString() }
    if (t === 'function') return { kind: 'function', value: value.name || 'anonymous' }
    if (value instanceof Error) {
      return { kind: 'error', name: value.name, message: value.message, stack: value.stack }
    }
    if (value instanceof Date) return { kind: 'string', value: value.toISOString() }
    if (value instanceof RegExp) return { kind: 'string', value: value.toString() }
    if (typeof value === 'object') {
      if (seen.has(value)) return { kind: 'string', value: '[Circular]' }
      seen.add(value)
      if (Array.isArray(value)) {
        return { kind: 'object', value: value.map(function (v) { return serializeArg(v, seen) }) }
      }
      var obj = {}
      for (var k in value) {
        try {
          obj[k] = serializeArg(value[k], seen)
        } catch {
          obj[k] = { kind: 'string', value: '[Unreadable]' }
        }
      }
      return { kind: 'object', value: obj }
    }
    return { kind: 'string', value: safeStringify(value) }
  }

  function sendMessage(type, payload) {
    var msg = {
      type: type,
      deviceId: deviceId,
      deviceType: 'mobile',
      timestamp: Date.now(),
      url: window.location.href,
      userAgent: navigator.userAgent,
      payload: payload
    }
    if (isConnected && ws) {
      try {
        ws.send(JSON.stringify(msg))
        if (config.debug) console.log('[ReviewLog] Sent:', msg)
      } catch (e) {
        if (config.debug) console.error('[ReviewLog] Send failed:', e)
        messageQueue.push(msg)
      }
    } else {
      messageQueue.push(msg)
    }
  }

  function flushQueue() {
    while (messageQueue.length > 0 && isConnected && ws) {
      var msg = messageQueue.shift()
      try {
        ws.send(JSON.stringify(msg))
      } catch {
        messageQueue.unshift(msg)
        break
      }
    }
  }

  function connect() {
    if (!config.host) {
      if (config.debug) console.error('[ReviewLog] Host not configured')
      return
    }
    if (ws) {
      ws.close()
    }
    
    // 支持两种格式：
    // 1. 完整 WebSocket URL: wss://xxx.workers.dev 或 ws://xxx.workers.dev
    // 2. 旧格式 host:port (自动添加协议)
    var wsUrl = config.host
    if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = protocol + '//' + config.host
    }
    
    // 添加 deviceId 参数
    if (deviceId) {
      wsUrl += '?deviceId=' + encodeURIComponent(deviceId) + '&deviceType=mobile'
    }
    
    ws = new WebSocket(wsUrl)
    ws.onopen = function () {
      isConnected = true
      reconnectAttempts = 0
      if (config.debug) console.log('[ReviewLog] Connected to', config.host)
      flushQueue()
    }
    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data)
        if (config.debug) console.log('[ReviewLog] Received:', data)
        // 处理服务器消息
        if (data.type === 'connected') {
          if (config.debug) console.log('[ReviewLog] Server confirmed connection:', data.sessionId)
        }
      } catch (e) {
        if (config.debug) console.log('[ReviewLog] Raw message:', event.data)
      }
    }
    ws.onclose = function () {
      isConnected = false
      if (config.debug) console.log('[ReviewLog] Disconnected')
      if (reconnectAttempts < config.maxReconnectAttempts) {
        reconnectAttempts++
        setTimeout(connect, config.reconnectInterval * reconnectAttempts)
        if (config.debug) console.log('[ReviewLog] Reconnect attempt', reconnectAttempts)
      }
    }
    ws.onerror = function (error) {
      if (config.debug) console.error('[ReviewLog] WebSocket error:', error)
    }
  }

  function captureConsole() {
    var levels = ['log', 'info', 'warn', 'error', 'debug']
    var originalConsole = window.console
    levels.forEach(function (level) {
      var original = originalConsole[level]
      window.console[level] = function () {
        var args = Array.prototype.slice.call(arguments)
        var serialized = args.map(function (a) { return serializeArg(a) })
        var text = args.map(function (a) { return safeStringify(a) }).join(' ')
        sendMessage('log', {
          level: level,
          args: serialized,
          text: text,
          timestamp: Date.now()
        })
        if (original && typeof original === 'function') {
          original.apply(originalConsole, arguments)
        }
      }
    })
    window.addEventListener('error', function (e) {
      sendMessage('log', {
        level: 'error',
        args: [{ kind: 'error', name: e.error.name, message: e.message, stack: e.error.stack }],
        text: e.message || 'Uncaught error',
        timestamp: Date.now()
      })
    })
    window.addEventListener('unhandledrejection', function (e) {
      var reason = e.reason
      sendMessage('log', {
        level: 'error',
        args: [{ kind: 'string', value: 'Unhandled promise rejection' }, serializeArg(reason)],
        text: 'Unhandled promise rejection: ' + safeStringify(reason),
        timestamp: Date.now()
      })
    })
  }

  function captureUserActions() {
    function describeTarget(el) {
      if (!(el instanceof Element)) return undefined
      var id = el.id ? '#' + el.id : ''
      var cls = el.className && typeof el.className === 'string' ? '.' + el.className.trim().split(/\s+/).join('.') : ''
      return el.tagName.toLowerCase() + id + cls
    }
    document.addEventListener('click', function (e) {
      sendMessage('action', {
        action: 'click',
        target: describeTarget(e.target),
        timestamp: Date.now()
      })
    }, true)
    document.addEventListener('input', function (e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        sendMessage('action', {
          action: 'input',
          target: describeTarget(e.target),
          timestamp: Date.now()
        })
      }
    }, true)
    document.addEventListener('submit', function (e) {
      sendMessage('action', {
        action: 'submit',
        target: describeTarget(e.target),
        timestamp: Date.now()
      })
    }, true)
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === 'Escape' || e.key === 'Tab') {
        sendMessage('action', {
          action: 'keydown:' + e.key,
          timestamp: Date.now()
        })
      }
    }, true)
  }

  function init(options) {
    Object.assign(config, options || {})
    deviceId = generateDeviceId()
    if (config.debug) console.log('[ReviewLog] Initialized with config:', config)
    captureConsole()
    captureUserActions()
    if (config.autoConnect) {
      connect()
    }
  }

  function setHost(host) {
    config.host = host
    if (config.autoConnect) {
      connect()
    }
  }

  function disconnect() {
    if (ws) {
      ws.close()
      ws = null
      isConnected = false
    }
  }

  function isConnectedStatus() {
    return isConnected
  }

  function log(message) {
    sendMessage('log', {
      level: 'log',
      args: [{ kind: 'string', value: message }],
      text: message,
      timestamp: Date.now()
    })
  }

  function warn(message) {
    sendMessage('log', {
      level: 'warn',
      args: [{ kind: 'string', value: message }],
      text: message,
      timestamp: Date.now()
    })
  }

  function error(message) {
    sendMessage('log', {
      level: 'error',
      args: [{ kind: 'string', value: message }],
      text: message,
      timestamp: Date.now()
    })
  }

  var sdk = {
    init: init,
    setHost: setHost,
    connect: connect,
    disconnect: disconnect,
    isConnected: isConnectedStatus,
    log: log,
    warn: warn,
    error: error,
    _config: config
  }

  var script = document.currentScript
  if (script) {
    var params = new URLSearchParams(script.src.split('?')[1])
    if (params.has('host')) {
      init({ host: params.get('host') })
    }
    if (params.has('debug')) {
      config.debug = true
    }
  }

  return sdk
})
