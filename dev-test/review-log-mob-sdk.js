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
 * 
 * 悬浮面板自动显示在移动端右下角，支持自建服务器和 GoEasy 两种模式切换
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
  // ==================== 配置 ====================
  var goEasyInstance = null
  var goEasyConfig = {
    appkey: '',
    host: 'hangzhou.goeasy.io',
    channel: 'review-log-channel',
    connected: false,
    subscriptions: {}
  }

  // 从 localStorage 读取保存的配置
  var savedHost = localStorage.getItem('review-log-host') || ''
  var savedGoEasyAppkey = localStorage.getItem('review-log-goeasy-appkey') || ''
  var savedGoEasyHost = localStorage.getItem('review-log-goeasy-host') || 'hangzhou.goeasy.io'
  var savedGoEasyChannel = localStorage.getItem('review-log-goeasy-channel') || 'review-log-channel'
  var savedConnectionMode = localStorage.getItem('review-log-connection-mode') || 'self-hosted'
  var savedAutoConnect = localStorage.getItem('review-log-auto-connect') === 'true'

  var config = {
    host: savedHost,
    autoConnect: savedHost ? true : false,
    reconnectInterval: 3000,
    maxReconnectAttempts: 10,
    debug: false
  }

  // ==================== 工具函数 ====================
  function serializeArg(arg) {
    if (arg === null) return { kind: 'null', value: 'null' }
    if (arg === undefined) return { kind: 'undefined', value: 'undefined' }
    if (typeof arg === 'function') return { kind: 'function', value: arg.toString() }
    if (typeof arg === 'symbol') return { kind: 'symbol', value: arg.toString() }
    if (arg instanceof Error) return { kind: 'error', name: arg.name, message: arg.message, stack: arg.stack }
    if (typeof arg === 'object') {
      try {
        return { kind: 'object', value: JSON.stringify(arg), isCircular: false }
      } catch {
        return { kind: 'object', value: String(arg), isCircular: false }
      }
    }
    return { kind: typeof arg, value: String(arg) }
  }

  function safeStringify(obj) {
    var seen = []
    try {
      return JSON.stringify(obj, function (key, val) {
        if (typeof val === 'object' && val !== null) {
          if (seen.indexOf(val) !== -1) return '[Circular]'
          seen.push(val)
        }
        return val
      })
    } catch {
      return String(obj)
    }
  }

  function getQueryParam(name) {
    if (typeof window === 'undefined') return null
    var script = document.currentScript
    if (!script) return null
    var params = new URLSearchParams(script.src.split('?')[1])
    return params.get(name)
  }

  function saveConfig() {
    localStorage.setItem('review-log-host', config.host)
    localStorage.setItem('review-log-goeasy-appkey', goEasyConfig.appkey)
    localStorage.setItem('review-log-goeasy-host', goEasyConfig.host)
    localStorage.setItem('review-log-goeasy-channel', goEasyConfig.channel)
    localStorage.setItem('review-log-connection-mode', currentConnectionMode)
    localStorage.setItem('review-log-auto-connect', 'true')
  }

  function clearConfig() {
    localStorage.removeItem('review-log-host')
    localStorage.removeItem('review-log-goeasy-appkey')
    localStorage.removeItem('review-log-goeasy-host')
    localStorage.removeItem('review-log-goeasy-channel')
    localStorage.removeItem('review-log-connection-mode')
    localStorage.removeItem('review-log-auto-connect')
  }

  // ==================== 设备 ID ====================
  var deviceId = null
  function generateDeviceId() {
    var id = localStorage.getItem('review-log-device-id')
    if (!id) {
      id = 'mobile_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9)
      localStorage.setItem('review-log-device-id', id)
    }
    return id
  }

  // ==================== WebSocket 连接 ====================
  var ws = null
  var reconnectAttempts = 0
  var isConnected = false
  var messageQueue = []
  var currentConnectionMode = savedConnectionMode || 'self-hosted'

  function setHost(host) {
    config.host = host
  }

  function connect() {
    if (!isMobileDevice()) return
    if (isConnected) return
    deviceId = generateDeviceId()
    var url = config.host
    if (!url) return

    if (url.indexOf('ws://') !== 0 && url.indexOf('wss://') !== 0) {
      url = (window.location.protocol === 'https:' ? 'wss://' : 'ws://') + url
    }
    url += '?deviceType=mobile&deviceId=' + encodeURIComponent(deviceId)

    try {
      ws = new WebSocket(url)
    } catch (e) {
      console.error('[ReviewLog] WebSocket 创建失败:', e)
      return
    }

    ws.onopen = function () {
      reconnectAttempts = 0
      isConnected = true
      console.log('[ReviewLog] WebSocket 已连接')
      flushQueue()
      notifyPanelStatus()
    }

    ws.onmessage = function (event) {
      try {
        var data = JSON.parse(event.data)
        console.log('[ReviewLog] 收到消息:', data)
      } catch (e) {
        console.warn('[ReviewLog] 消息解析失败:', event.data)
      }
    }

    ws.onclose = function () {
      isConnected = false
      ws = null
      console.log('[ReviewLog] WebSocket 已断开')
      notifyPanelStatus()
      if (config.autoConnect && reconnectAttempts < config.maxReconnectAttempts) {
        reconnectAttempts++
        setTimeout(connect, config.reconnectInterval * reconnectAttempts)
      }
    }

    ws.onerror = function (error) {
      console.error('[ReviewLog] WebSocket 错误:', error)
    }
  }

  function disconnect() {
    isConnected = false
    config.autoConnect = false
    if (ws) {
      ws.close()
      ws = null
    }
  }

  function flushQueue() {
    while (messageQueue.length > 0 && isConnected) {
      var msg = messageQueue.shift()
      ws.send(JSON.stringify(msg))
    }
  }

  function sendMessage(type, payload) {
    // 仅移动端推送日志，PC 端由浏览器扩展本地采集
    if (!isMobileDevice()) return

    var msg = {
      type: type,
      payload: payload,
      deviceId: deviceId || generateDeviceId(),
      timestamp: Date.now()
    }

    if (type === 'log' || type === 'action') {
      msg.url = window.location.href
    }

    // GoEasy 模式：通过 pubsub 推送
    if (currentConnectionMode === 'goeasy' && goEasyConfig.connected && goEasyInstance) {
      goEasyInstance.pubsub.publish({
        channel: goEasyConfig.channel,
        message: JSON.stringify(msg),
        onFailed: function(error) {
          console.error('[ReviewLog] GoEasy 推送失败:', error)
        }
      })
      return
    }

    if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg))
    } else {
      messageQueue.push(msg)
      if (messageQueue.length > 100) messageQueue.shift()
    }
  }

  // ==================== GoEasy 相关 ====================
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
          notifyPanelStatus()
        },
        onFailed: function(error) {
          goEasyConfig.connected = false
          console.error('[ReviewLog] GoEasy 连接失败:', error)
          notifyPanelStatus()
        }
      })
    } catch (e) {
      console.error('[ReviewLog] GoEasy 初始化失败:', e)
    }
  }

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

  function disconnectGoEasy() {
    if (goEasyInstance) {
      goEasyInstance.disconnect()
      goEasyConfig.connected = false
      console.log('[ReviewLog] GoEasy 已断开连接')
      notifyPanelStatus()
    }
  }

  function isGoEasyConnected() {
    return goEasyConfig.connected
  }

  // ==================== 日志捕获 ====================
  function captureConsole() {
    // 若扩展已 hook console，避免重复捕获导致日志双份
    if (window.__review_log_main_injected__ || window.console.__review_log_wrapped__) {
      return
    }

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
    })
    document.addEventListener('input', function (e) {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        sendMessage('action', {
          action: 'input',
          target: describeTarget(e.target),
          value: e.target.value.substring(0, 100),
          timestamp: Date.now()
        })
      }
    })
    document.addEventListener('submit', function (e) {
      sendMessage('action', {
        action: 'submit',
        target: describeTarget(e.target),
        timestamp: Date.now()
      })
    })
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Enter') {
        sendMessage('action', {
          action: 'keydown',
          target: describeTarget(e.target),
          key: 'Enter',
          timestamp: Date.now()
        })
      }
    })
  }

  // ==================== 悬浮配置面板 ====================
  var panelInstance = null

  function createFloatingPanel() {
    // 如果已存在则移除
    var existing = document.getElementById('review-log-config-panel')
    if (existing) existing.remove()

    var panel = document.createElement('div')
    panel.id = 'review-log-config-panel'
    panel.style.cssText = [
      'position: fixed',
      'bottom: 20px',
      'right: 20px',
      'width: 280px',
      'max-height: 80vh',
      'overflow-y: auto',
      'background: rgba(15, 15, 15, 0.95)',
      'border-radius: 12px',
      'box-shadow: 0 4px 24px rgba(0, 0, 0, 0.4)',
      'padding: 16px',
      'z-index: 999999',
      'font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
      'color: #fff',
      'font-size: 13px',
      'box-sizing: border-box'
    ].join(';')

    // 头部
    var header = document.createElement('div')
    header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid rgba(255,255,255,0.1);'

    var title = document.createElement('span')
    title.textContent = '📱 Review Log SDK'
    title.style.cssText = 'font-size: 14px; font-weight: 600;'
    header.appendChild(title)

    var closeBtn = document.createElement('button')
    closeBtn.textContent = '×'
    closeBtn.style.cssText = 'width: 24px; height: 24px; border: none; background: rgba(255,255,255,0.1); border-radius: 50%; color: #fff; font-size: 16px; cursor: pointer; display: flex; align-items: center; justify-content: center;'
    closeBtn.onclick = function() {
      panel.style.display = 'none'
      showToggleBtn()
    }
    header.appendChild(closeBtn)
    panel.appendChild(header)

    // 连接模式选择
    var modeContainer = document.createElement('div')
    modeContainer.style.cssText = 'margin-bottom: 12px;'
    var modeLabel = document.createElement('div')
    modeLabel.textContent = '连接模式'
    modeLabel.style.cssText = 'font-size: 11px; color: #9ca3af; margin-bottom: 6px;'
    modeContainer.appendChild(modeLabel)

    var modeSelector = document.createElement('div')
    modeSelector.style.cssText = 'display: flex; gap: 8px;'
    modeSelector.innerHTML = [
      '<button class="mode-btn" data-mode="self-hosted" style="flex:1; padding:8px; border:1px solid ' + (currentConnectionMode === 'self-hosted' ? '#6366f1' : 'rgba(255,255,255,0.2)') + '; border-radius:6px; background:' + (currentConnectionMode === 'self-hosted' ? 'rgba(99,102,241,0.2)' : 'transparent') + '; color:' + (currentConnectionMode === 'self-hosted' ? '#818cf8' : '#fff') + '; font-size:12px; cursor:pointer;">自建服务器</button>',
      '<button class="mode-btn" data-mode="goeasy" style="flex:1; padding:8px; border:1px solid ' + (currentConnectionMode === 'goeasy' ? '#6366f1' : 'rgba(255,255,255,0.2)') + '; border-radius:6px; background:' + (currentConnectionMode === 'goeasy' ? 'rgba(99,102,241,0.2)' : 'transparent') + '; color:' + (currentConnectionMode === 'goeasy' ? '#818cf8' : '#fff') + '; font-size:12px; cursor:pointer;">GoEasy</button>'
    ].join('')
    modeContainer.appendChild(modeSelector)
    panel.appendChild(modeContainer)

    // 自建服务器配置
    var selfHostedPanel = document.createElement('div')
    selfHostedPanel.id = 'self-hosted-config'
    selfHostedPanel.style.cssText = 'display: ' + (currentConnectionMode === 'self-hosted' ? 'block' : 'none') + ';'

    var hostInput = document.createElement('input')
    hostInput.type = 'text'
    hostInput.id = 'self-hosted-url'
    hostInput.placeholder = 'ws://192.168.x.x:8080/ws'
    hostInput.value = config.host || ''
    hostInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 10px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; box-sizing: border-box;'
    selfHostedPanel.appendChild(hostInput)
    panel.appendChild(selfHostedPanel)

    // GoEasy 配置
    var goeasyPanel = document.createElement('div')
    goeasyPanel.id = 'goeasy-config'
    goeasyPanel.style.cssText = 'display: ' + (currentConnectionMode === 'goeasy' ? 'block' : 'none') + ';'

    var appkeyInput = document.createElement('input')
    appkeyInput.type = 'text'
    appkeyInput.id = 'goeasy-appkey'
    appkeyInput.placeholder = 'AppKey'
    appkeyInput.value = goEasyConfig.appkey || savedGoEasyAppkey || ''
    appkeyInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; box-sizing: border-box;'

    var goeasyHostInput = document.createElement('input')
    goeasyHostInput.type = 'text'
    goeasyHostInput.id = 'goeasy-host'
    goeasyHostInput.placeholder = 'Host (如 hangzhou.goeasy.io)'
    goeasyHostInput.value = goEasyConfig.host || savedGoEasyHost || 'hangzhou.goeasy.io'
    goeasyHostInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; box-sizing: border-box;'

    var channelInput = document.createElement('input')
    channelInput.type = 'text'
    channelInput.id = 'goeasy-channel'
    channelInput.placeholder = '频道名称'
    channelInput.value = goEasyConfig.channel || savedGoEasyChannel || 'review-log-channel'
    channelInput.style.cssText = 'width: 100%; padding: 10px 12px; margin-bottom: 8px; border: 1px solid rgba(255,255,255,0.2); border-radius: 8px; background: rgba(255,255,255,0.05); color: #fff; font-size: 12px; box-sizing: border-box;'

    goeasyPanel.appendChild(appkeyInput)
    goeasyPanel.appendChild(goeasyHostInput)
    goeasyPanel.appendChild(channelInput)
    panel.appendChild(goeasyPanel)

    // 连接按钮
    var connectBtn = document.createElement('button')
    connectBtn.id = 'connect-btn'
    connectBtn.style.cssText = 'width: 100%; padding: 10px; border: none; border-radius: 8px; background: #6366f1; color: #fff; font-size: 13px; font-weight: 500; cursor: pointer; margin-bottom: 10px;'
    connectBtn.onclick = handleConnect
    panel.appendChild(connectBtn)

    // 状态显示
    var statusText = document.createElement('div')
    statusText.id = 'connection-status'
    statusText.style.cssText = 'font-size: 12px; text-align: center; margin-bottom: 8px;'
    panel.appendChild(statusText)

    // 设备ID
    var deviceIdText = document.createElement('div')
    deviceIdText.style.cssText = 'font-size: 10px; color: #6b7280; text-align: center; word-break: break-all; margin-bottom: 8px;'
    panel.appendChild(deviceIdText)

    // 隐藏按钮
    var hideBtn = document.createElement('button')
    hideBtn.textContent = '隐藏面板'
    hideBtn.style.cssText = 'width: 100%; padding: 6px; border: 1px solid rgba(255,255,255,0.2); border-radius: 6px; background: transparent; color: #9ca3af; font-size: 11px; cursor: pointer;'
    hideBtn.onclick = function() {
      panel.style.display = 'none'
      showToggleBtn()
    }
    panel.appendChild(hideBtn)

    document.body.appendChild(panel)
    panelInstance = panel

    // 模式切换事件
    modeSelector.addEventListener('click', function(e) {
      var btn = e.target.closest('.mode-btn')
      if (!btn) return
      var mode = btn.dataset.mode
      if (!mode) return
      currentConnectionMode = mode
      localStorage.setItem('review-log-connection-mode', mode)

      // 更新 UI
      document.querySelectorAll('.mode-btn').forEach(function(b) {
        var isActive = b.dataset.mode === mode
        b.style.borderColor = isActive ? '#6366f1' : 'rgba(255,255,255,0.2)'
        b.style.background = isActive ? 'rgba(99,102,241,0.2)' : 'transparent'
        b.style.color = isActive ? '#818cf8' : '#fff'
      })
      document.getElementById('self-hosted-config').style.display = mode === 'self-hosted' ? 'block' : 'none'
      document.getElementById('goeasy-config').style.display = mode === 'goeasy' ? 'block' : 'none'

      updateConnectButton()
    })

    updateConnectButton()
    updateStatus()

    function updateConnectButton() {
      var isConnectedNow = currentConnectionMode === 'self-hosted' ? isConnected : goEasyConfig.connected
      connectBtn.textContent = isConnectedNow ? '断开连接' : '连接'
      connectBtn.style.background = isConnectedNow ? '#ef4444' : '#6366f1'
    }

    function updateStatus() {
      var isConnectedNow = currentConnectionMode === 'self-hosted' ? isConnected : goEasyConfig.connected
      var status = isConnectedNow ? '已连接' : '未连接'
      var color = isConnectedNow ? '#22c55e' : '#9ca3af'
      statusText.textContent = status
      statusText.style.color = color
      deviceIdText.textContent = '设备ID: ' + (deviceId || '未初始化')
      updateConnectButton()
    }

    function handleConnect() {
      var isConnectedNow = currentConnectionMode === 'self-hosted' ? isConnected : goEasyConfig.connected

      if (isConnectedNow) {
        // 断开连接
        if (currentConnectionMode === 'self-hosted') {
          disconnect()
        } else {
          disconnectGoEasy()
        }
        updateStatus()
        return
      }

      // 连接
      if (currentConnectionMode === 'self-hosted') {
        var url = hostInput.value.trim()
        if (!url) {
          alert('请输入服务器地址')
          return
        }
        setHost(url)
        goEasyConfig.connected = false
        saveConfig()
        connect()
      } else {
        var appkey = appkeyInput.value.trim()
        var goeasyHost = goeasyHostInput.value.trim()
        var channel = channelInput.value.trim()
        if (!appkey) {
          alert('请输入 AppKey')
          return
        }
        if (!channel) {
          alert('请输入频道名称')
          return
        }
        goEasyConfig.appkey = appkey
        goEasyConfig.host = goeasyHost || 'hangzhou.goeasy.io'
        goEasyConfig.channel = channel
        isConnected = false
        saveConfig()
        deviceId = generateDeviceId()
        initGoEasy({ appkey: appkey, host: goEasyConfig.host })
        // 连接成功后 captureConsole 会通过 sendMessage 走 GoEasy 推送
        setTimeout(function() {
          if (goEasyConfig.connected) {
            updateStatus()
          }
        }, 1500)
      }
      setTimeout(updateStatus, 200)
    }

    // 监听连接状态变化
    var originalConnect = connect
    connect = function() {
      originalConnect()
      setTimeout(updateStatus, 100)
    }

    var originalDisconnect = disconnect
    disconnect = function() {
      originalDisconnect()
      updateStatus()
    }

    return panel
  }

  function notifyPanelStatus() {
    if (panelInstance) {
      var event = new CustomEvent('review-log:status-change')
      document.dispatchEvent(event)
    }
  }

  function showToggleBtn() {
    var toggle = document.getElementById('review-log-toggle-btn')
    if (!toggle) {
      toggle = document.createElement('button')
      toggle.id = 'review-log-toggle-btn'
      toggle.textContent = '📱'
      toggle.style.cssText = [
        'position: fixed',
        'bottom: 20px',
        'right: 20px',
        'width: 48px',
        'height: 48px',
        'border: none',
        'border-radius: 50%',
        'background: #6366f1',
        'color: #fff',
        'font-size: 20px',
        'cursor: pointer',
        'box-shadow: 0 2px 12px rgba(99, 102, 241, 0.4)',
        'z-index: 999998',
        'display: flex',
        'align-items: 'center',
        'justify-content: center'
      ].join(';')
      toggle.onclick = function() {
        createFloatingPanel()
        toggle.remove()
      }
      document.body.appendChild(toggle)
    }
  }

  // ==================== SDK 初始化 ====================
  function init(options) {
    if (!isMobileDevice()) {
      console.warn('[ReviewLog] 移动端 SDK 仅用于手机/平板页面，PC 端请使用 Review Log 浏览器扩展')
      return
    }
    if (options && options.host) {
      setHost(options.host)
    }
    captureConsole()
    captureUserActions()
    if (config.host || savedHost) {
      setHost(config.host || savedHost)
      if (savedAutoConnect || (options && options.autoConnect)) {
        setTimeout(connect, 500)
      }
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
    _config: config,
    // GoEasy WebSocket 相关功能
    initGoEasy: initGoEasy,
    subscribeGoEasy: subscribeGoEasy,
    publishGoEasy: publishGoEasy,
    disconnectGoEasy: disconnectGoEasy,
    isGoEasyConnected: isGoEasyConnected,
    // 面板控制
    showPanel: createFloatingPanel,
    hidePanel: function() {
      var panel = document.getElementById('review-log-config-panel')
      if (panel) {
        panel.style.display = 'none'
        showToggleBtn()
      }
    }
  }

  function isMobileDevice() {
    if (typeof window === 'undefined') return false
    var userAgent = window.navigator.userAgent || ''
    var platform = window.navigator.platform || ''
    
    // 检测移动设备关键字
    var mobileKeywords = ['Mobile', 'Android', 'iPhone', 'iPad', 'iPod', 'Windows Phone', 'BlackBerry', 'Opera Mini', 'IEMobile', 'WPDesktop']
    var isMobileUA = mobileKeywords.some(function(keyword) {
      return userAgent.indexOf(keyword) !== -1
    })
    
    // 检测移动平台
    var mobilePlatforms = ['iPhone', 'iPad', 'iPod', 'Android', 'BlackBerry', 'Windows Phone']
    var isMobilePlatform = mobilePlatforms.some(function(platformName) {
      return platform.indexOf(platformName) !== -1
    })
    
    // 检测屏幕尺寸（小于 768px 视为移动端）
    var isSmallScreen = typeof window.innerWidth !== 'undefined' && window.innerWidth <= 768
    
    // 检测触摸支持
    var isTouchDevice = 'ontouchstart' in window || navigator.maxTouchPoints > 0
    
    // 检测 orientation（移动端特有）
    var hasOrientation = typeof window.orientation !== 'undefined'
    
    return isMobileUA || isMobilePlatform || isSmallScreen || isTouchDevice || hasOrientation
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
    // ========== PC 端完全不执行 ==========
    // 日志采集与 WS 推送仅由移动端负责
    if (!isMobileDevice()) {
      console.log('[ReviewLog] PC 端检测到，SDK 不执行日志捕获和推送')
      return
    }

    showSDKIndicator()

    var hostFromQuery = getQueryParam('host')
    if (hostFromQuery) {
      setHost(hostFromQuery)
    }
    captureConsole()
    captureUserActions()

    if (config.host) {
      setTimeout(connect, 500)
    }

    if (shouldShowPanel()) {
      setTimeout(createFloatingPanel, 1000)
    }
  }

  function showSDKIndicator() {
    if (!isMobileDevice()) return
    var indicator = document.createElement('div')
    indicator.id = 'review-log-sdk-indicator'
    indicator.textContent = '📱 Review Log SDK 已加载'
    indicator.style.cssText = [
      'position: fixed',
      'top: 10px',
      'left: 10px',
      'padding: 8px 12px',
      'background: rgba(99, 102, 241, 0.9)',
      'color: #fff',
      'border-radius: 6px',
      'font-size: 12px',
      'font-family: -apple-system, BlinkMacSystemFont, sans-serif',
      'z-index: 999999',
      'box-shadow: 0 2px 8px rgba(0,0,0,0.2)',
      'cursor: pointer'
    ].join(';')
    indicator.onclick = function() {
      createFloatingPanel()
      indicator.remove()
    }
    document.body.appendChild(indicator)
    setTimeout(function() {
      indicator.remove()
    }, 5000)
  }

  // 监听状态变化以更新面板
  document.addEventListener('review-log:status-change', function() {
    if (panelInstance) {
      // 触发面板更新
    }
  })

  // DOM 加载完成后初始化
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', tryInitialize)
  } else {
    tryInitialize()
  }

  return sdk
})
