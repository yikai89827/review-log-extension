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

  function createFloatingPanel() {
    var panel = document.createElement('div')
    panel.id = 'review-log-config-panel'
    panel.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      width: 300px;
      background: rgba(15, 15, 15, 0.95);
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4);
      padding: 16px;
      z-index: 999999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      color: #fff;
    `

    var header = document.createElement('div')
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 16px;
      padding-bottom: 8px;
      border-bottom: 1px solid rgba(255,255,255,0.1);
    `

    var title = document.createElement('span')
    title.textContent = '📱 Review Log'
    title.style.fontSize = '14px'
    title.style.fontWeight = '600'
    header.appendChild(title)

    var closeBtn = document.createElement('button')
    closeBtn.textContent = '×'
    closeBtn.style.cssText = `
      width: 24px;
      height: 24px;
      border: none;
      background: rgba(255,255,255,0.1);
      border-radius: 50%;
      color: #fff;
      font-size: 16px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
    `
    closeBtn.onclick = function() {
      panel.style.display = 'none'
    }
    header.appendChild(closeBtn)
    panel.appendChild(header)

    var hostInput = document.createElement('input')
    hostInput.type = 'text'
    hostInput.placeholder = 'WebSocket 服务器地址'
    hostInput.value = config.host || ''
    hostInput.style.cssText = `
      width: 100%;
      padding: 10px 12px;
      margin-bottom: 12px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 8px;
      background: rgba(255,255,255,0.05);
      color: #fff;
      font-size: 13px;
      box-sizing: border-box;
    `
    hostInput.onfocus = function() {
      this.style.borderColor = '#6366f1'
    }
    hostInput.onblur = function() {
      this.style.borderColor = 'rgba(255,255,255,0.2)'
    }
    panel.appendChild(hostInput)

    var connectBtn = document.createElement('button')
    connectBtn.textContent = isConnected ? '断开连接' : '连接'
    connectBtn.style.cssText = `
      width: 100%;
      padding: 10px;
      border: none;
      border-radius: 8px;
      background: ${isConnected ? '#ef4444' : '#6366f1'};
      color: #fff;
      font-size: 13px;
      font-weight: 500;
      cursor: pointer;
      margin-bottom: 12px;
    `
    connectBtn.onclick = function() {
      if (isConnected) {
        disconnect()
        connectBtn.textContent = '连接'
        connectBtn.style.background = '#6366f1'
        statusText.textContent = '已断开'
        statusText.style.color = '#9ca3af'
      } else {
        var host = hostInput.value.trim()
        if (!host) {
          alert('请输入服务器地址')
          return
        }
        setHost(host)
        connectBtn.textContent = '连接中...'
        connectBtn.style.background = '#4b5563'
        connectBtn.disabled = true
      }
    }
    panel.appendChild(connectBtn)

    var statusText = document.createElement('div')
    statusText.textContent = isConnected ? '已连接' : '未连接'
    statusText.style.cssText = `
      font-size: 12px;
      color: ${isConnected ? '#22c55e' : '#9ca3af'};
      text-align: center;
      margin-bottom: 8px;
    `
    panel.appendChild(statusText)

    var deviceIdText = document.createElement('div')
    deviceIdText.textContent = '设备ID: ' + (deviceId || '未初始化')
    deviceIdText.style.cssText = `
      font-size: 11px;
      color: #6b7280;
      text-align: center;
      word-break: break-all;
    `
    panel.appendChild(deviceIdText)

    var toggleBtn = document.createElement('button')
    toggleBtn.textContent = '隐藏面板'
    toggleBtn.style.cssText = `
      width: 100%;
      padding: 6px;
      border: 1px solid rgba(255,255,255,0.2);
      border-radius: 6px;
      background: transparent;
      color: #9ca3af;
      font-size: 11px;
      cursor: pointer;
      margin-top: 8px;
    `
    toggleBtn.onclick = function() {
      panel.style.display = 'none'
      showToggleBtn()
    }
    panel.appendChild(toggleBtn)

    document.body.appendChild(panel)

    // 监听连接状态变化
    function updateStatus() {
      if (isConnected) {
        connectBtn.textContent = '断开连接'
        connectBtn.style.background = '#ef4444'
        statusText.textContent = '已连接'
        statusText.style.color = '#22c55e'
      } else {
        connectBtn.textContent = '连接'
        connectBtn.style.background = '#6366f1'
        statusText.textContent = '未连接'
        statusText.style.color = '#9ca3af'
      }
      connectBtn.disabled = false
    }

    // 重写 connect 函数以更新状态
    var originalConnect = connect
    connect = function() {
      originalConnect()
      setTimeout(updateStatus, 100)
    }

    // 重写 disconnect 函数以更新状态
    var originalDisconnect = disconnect
    disconnect = function() {
      originalDisconnect()
      updateStatus()
    }

    // 显示切换按钮
    function showToggleBtn() {
      var toggle = document.getElementById('review-log-toggle-btn')
      if (!toggle) {
        toggle = document.createElement('button')
        toggle.id = 'review-log-toggle-btn'
        toggle.textContent = '📱'
        toggle.style.cssText = `
          position: fixed;
          bottom: 20px;
          right: 20px;
          width: 48px;
          height: 48px;
          border: none;
          border-radius: 50%;
          background: #6366f1;
          color: #fff;
          font-size: 20px;
          cursor: pointer;
          box-shadow: 0 2px 12px rgba(99, 102, 241, 0.4);
          z-index: 999998;
        `
        toggle.onclick = function() {
          panel.style.display = 'block'
          toggle.remove()
        }
        document.body.appendChild(toggle)
      }
    }
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
    // 显示配置面板（默认显示，除非通过参数隐藏）
    if (!params.has('hidePanel')) {
      setTimeout(createFloatingPanel, 500)
    }
  }

  return sdk
})
