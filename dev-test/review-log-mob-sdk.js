/**
 * Review Log Mobile SDK
 * 
 * 使用方式：
 * <script src="https://your-server/review-log-mob-sdk.js?host=192.168.1.100:8080"></script>
 * 
 * 或在代码中初始化：
 * ReviewLogSDK.init({ host: '192.168.1.100:8080' })
 * 
 * GoEasy WebSocket 配置：
 * ReviewLogSDK.initGoEasy({ appkey: 'your-appkey', host: 'hangzhou.goeasy.io' })
 * ReviewLogSDK.subscribeGoEasy({ channel: 'my_channel', onMessage: function(msg) { console.log(msg) } })
 * ReviewLogSDK.publishGoEasy({ channel: 'my_channel', content: 'Hello!' })
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
  // GoEasy 相关配置
  var goEasyInstance = null
  var goEasyConfig = {
    appkey: null,
    host: 'hangzhou.goeasy.io',
    connected: false,
    subscriptions: {}
  }

  // GoEasy 初始化
  function initGoEasy(options) {
    if (!options || !options.appkey) {
      console.error('[ReviewLog] GoEasy appkey is required')
      return
    }
    goEasyConfig.appkey = options.appkey
    goEasyConfig.host = options.host || goEasyConfig.host

    // 动态加载 GoEasy SDK
    if (!window.GoEasy) {
      var script = document.createElement('script')
      script.src = 'https://cdn.goeasy.io/goeasy-2.6.4.min.js'
      script.onload = function() {
        createGoEasyInstance()
      }
      script.onerror = function() {
        console.error('[ReviewLog] Failed to load GoEasy SDK')
      }
      document.head.appendChild(script)
    } else {
      createGoEasyInstance()
    }
  }

  function createGoEasyInstance() {
    try {
      goEasyInstance = GoEasy.getInstance({
        host: goEasyConfig.host,
        appkey: goEasyConfig.appkey,
        modules: ['pubsub']
      })

      goEasyInstance.connect({
        onSuccess: function() {
          goEasyConfig.connected = true
          console.log('[ReviewLog] GoEasy 连接成功')
          // 恢复所有订阅
          for (var channel in goEasyConfig.subscriptions) {
            var sub = goEasyConfig.subscriptions[channel]
            if (sub && !sub.active) {
              sub.active = true
            }
          }
        },
        onFailed: function(error) {
          goEasyConfig.connected = false
          console.error('[ReviewLog] GoEasy 连接失败:', error)
        }
      })
    } catch (e) {
      console.error('[ReviewLog] GoEasy 初始化失败:', e)
    }
  }

  // 订阅 GoEasy 频道
  function subscribeGoEasy(options) {
    var channel = options.channel
    var onMessage = options.onMessage

    if (!goEasyInstance) {
      console.error('[ReviewLog] GoEasy 未初始化，请先调用 initGoEasy()')
      return
    }

    if (!channel) {
      console.error('[ReviewLog] 订阅频道不能为空')
      return
    }

    goEasyInstance.pubsub.subscribe({
      channel: channel,
      onMessage: function(message) {
        console.log('[ReviewLog] GoEasy 收到消息:', message.data)
        if (typeof onMessage === 'function') {
          onMessage(message.data)
        }
      },
      onSuccess: function() {
        console.log('[ReviewLog] GoEasy 订阅成功:', channel)
        goEasyConfig.subscriptions[channel] = { active: true }
      },
      onFailed: function(error) {
        console.log('[ReviewLog] GoEasy 订阅失败:', error)
      }
    })
  }

  // 推送消息到 GoEasy 频道
  function publishGoEasy(options) {
    var channel = options.channel
    var content = options.content

    if (!goEasyInstance) {
      console.error('[ReviewLog] GoEasy 未初始化，请先调用 initGoEasy()')
      return
    }

    if (!channel || content === undefined) {
      console.error('[ReviewLog] 频道和内容不能为空')
      return
    }

    // 确保内容是字符串
    var contentStr = typeof content === 'string' ? content : JSON.stringify(content)

    goEasyInstance.pubsub.publish({
      channel: channel,
      message: contentStr,
      onSuccess: function() {
        console.log('[ReviewLog] GoEasy 推送成功:', channel, contentStr)
      },
      onFailed: function(error) {
        console.error('[ReviewLog] GoEasy 推送失败:', error)
      }
    })
  }

  // 断开 GoEasy 连接
  function disconnectGoEasy() {
    if (goEasyInstance) {
      goEasyInstance.disconnect()
      goEasyConfig.connected = false
      console.log('[ReviewLog] GoEasy 已断开连接')
    }
  }

  // 获取 GoEasy 连接状态
  function isGoEasyConnected() {
    return goEasyConfig.connected
  }

  // 从 localStorage 读取保存的配置
  var savedHost = localStorage.getItem('review-log-host') || ''
  var savedAutoConnect = localStorage.getItem('review-log-auto-connect') === 'true'
  
  var config = {
    host: savedHost,
    autoConnect: savedHost ? true : false,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
    debug: false
  }
  
  function saveConfig() {
    localStorage.setItem('review-log-host', config.host)
    localStorage.setItem('review-log-auto-connect', 'true')
    console.log('[ReviewLog] 配置已保存到本地存储')
  }
  
  function clearConfig() {
    localStorage.removeItem('review-log-host')
    localStorage.removeItem('review-log-auto-connect')
    config.host = ''
    config.autoConnect = false
    console.log('[ReviewLog] 配置已清除')
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
    console.log('[ReviewLog] === 开始连接 ===')
    
    if (!config.host) {
      console.error('[ReviewLog] ❌ Host not configured')
      return
    }
    
    console.log('[ReviewLog] 当前配置:', JSON.stringify({ 
      host: config.host, 
      autoConnect: config.autoConnect,
      debug: config.debug 
    }))
    
    if (ws) {
      console.log('[ReviewLog] 关闭现有连接')
      ws.close()
      ws = null
    }
    
    // 支持三种格式：
    // 1. 完整 WebSocket URL: wss://xxx.workers.dev/ws 或 ws://xxx.workers.dev/ws
    // 2. 完整 HTTP URL: http://xxx:8080 (自动转换为 ws://)
    // 3. 旧格式 host:port (自动添加协议和路径)
    var wsUrl = config.host
    
    // 如果是 http/https 开头，转换为 ws/wss
    if (wsUrl.startsWith('http://')) {
      wsUrl = 'ws://' + wsUrl.slice(7)
      console.log('[ReviewLog] 转换 HTTP 地址为 WebSocket:', wsUrl)
    } else if (wsUrl.startsWith('https://')) {
      wsUrl = 'wss://' + wsUrl.slice(8)
      console.log('[ReviewLog] 转换 HTTPS 地址为 WebSocket:', wsUrl)
    } else if (!wsUrl.startsWith('ws://') && !wsUrl.startsWith('wss://')) {
      // 如果没有协议，自动添加
      var protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
      wsUrl = protocol + '//' + config.host
      console.log('[ReviewLog] 添加协议:', wsUrl)
    }
    
    // 如果路径不包含 /ws，添加路径
    if (!wsUrl.includes('/ws')) {
      wsUrl += '/ws'
      console.log('[ReviewLog] 添加 WebSocket 路径:', wsUrl)
    }
    
    // 添加 deviceId 参数
    if (deviceId) {
      wsUrl += (wsUrl.includes('?') ? '&' : '?') + 'deviceId=' + encodeURIComponent(deviceId) + '&deviceType=mobile'
      console.log('[ReviewLog] 添加设备参数:', wsUrl)
    }
    
    console.log('[ReviewLog] 📡 正在连接:', wsUrl)
    
    try {
      ws = new WebSocket(wsUrl)
      console.log('[ReviewLog] ✅ WebSocket 对象创建成功')
      
      ws.onopen = function () {
        isConnected = true
        reconnectAttempts = 0
        console.log('[ReviewLog] 🎉 连接成功！')
        flushQueue()
      }
      
      ws.onmessage = function (event) {
        console.log('[ReviewLog] 📥 收到消息:', event.data.length > 200 ? event.data.slice(0, 200) + '...' : event.data)
        try {
          var data = JSON.parse(event.data)
          if (data.type === 'connected') {
            console.log('[ReviewLog] 🤝 服务器确认连接:', data.sessionId)
          }
        } catch (e) {
          console.log('[ReviewLog] ⚠️ 非JSON消息:', event.data)
        }
      }
      
      ws.onclose = function (event) {
        isConnected = false
        console.log('[ReviewLog] 🔌 连接断开 (code:', event.code, ', reason:', event.reason || 'none', ')')
        if (reconnectAttempts < config.maxReconnectAttempts) {
          reconnectAttempts++
          var delay = config.reconnectInterval * reconnectAttempts
          console.log('[ReviewLog] 🔄 准备重连 (尝试:', reconnectAttempts, '/', config.maxReconnectAttempts, ', 延迟:', delay, 'ms)')
          setTimeout(connect, delay)
        } else {
          console.log('[ReviewLog] ⛔ 达到最大重连次数，停止尝试')
        }
      }
      
      ws.onerror = function (error) {
        console.error('[ReviewLog] ❌ WebSocket 错误:', error.message || error)
      }
      
    } catch (e) {
      console.error('[ReviewLog] ❌ 创建 WebSocket 失败:', e.message || e)
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
    hostInput.placeholder = 'ws://192.168.x.x:8080/ws'
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
        // 保存配置到本地存储
        saveConfig()
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
    _config: config,
    // GoEasy WebSocket 相关功能
    initGoEasy: initGoEasy,
    subscribeGoEasy: subscribeGoEasy,
    publishGoEasy: publishGoEasy,
    disconnectGoEasy: disconnectGoEasy,
    isGoEasyConnected: isGoEasyConnected
  }

  function isMobileDevice() {
    if (typeof window === 'undefined') return false
    var userAgent = window.navigator.userAgent || ''
    var mobileKeywords = ['Mobile', 'Android', 'iPhone', 'iPad', 'iPod', 'Windows Phone', 'BlackBerry', 'Opera Mini', 'IEMobile', 'WPDesktop']
    return mobileKeywords.some(function(keyword) {
      return userAgent.indexOf(keyword) !== -1
    }) || (typeof window.orientation !== 'undefined') || (window.innerWidth <= 768)
  }

  function shouldShowPanel() {
    // 只有移动端才显示配置面板
    if (!isMobileDevice()) {
      return false
    }
    // 检查是否通过参数强制隐藏
    var script = document.currentScript
    if (script) {
      var params = new URLSearchParams(script.src.split('?')[1])
      if (params.has('hidePanel')) {
        return false
      }
    }
    // 检查全局配置
    if (window && window.__REVIEW_LOG_CONFIG__ && window.__REVIEW_LOG_CONFIG__.hidePanel) {
      return false
    }
    return true
  }

  function tryInitialize() {
    var hasHost = false
    
    // 方法1: 通过 document.currentScript 获取参数
    var script = document.currentScript
    if (script) {
      var params = new URLSearchParams(script.src.split('?')[1])
      if (params.has('host')) {
        init({ host: params.get('host') })
        hasHost = true
      }
      if (params.has('debug')) {
        config.debug = true
      }
      // 显示配置面板（只在移动端显示）
      if (shouldShowPanel()) {
        setTimeout(createFloatingPanel, 500)
        return
      }
    }
    
    // 方法2: 通过全局变量配置
    if (window && window.__REVIEW_LOG_CONFIG__) {
      init(window.__REVIEW_LOG_CONFIG__)
      hasHost = true
      if (shouldShowPanel()) {
        setTimeout(createFloatingPanel, 500)
        return
      }
    }
    
    // 方法3: 默认显示配置面板（没有配置host时，且只在移动端显示）
    if ((!hasHost || !config.host) && shouldShowPanel()) {
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', function() {
          setTimeout(createFloatingPanel, 300)
        })
      } else {
        setTimeout(createFloatingPanel, 500)
      }
    }
  }

  // 暴露全局函数，允许手动显示配置面板
  window.__ReviewLogShowPanel = createFloatingPanel

  // 尝试初始化
  try {
    tryInitialize()
  } catch (e) {
    // 某些浏览器可能有安全限制，降级处理
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function() {
        setTimeout(createFloatingPanel, 300)
      })
    } else {
      setTimeout(createFloatingPanel, 500)
    }
  }

  return sdk
})
