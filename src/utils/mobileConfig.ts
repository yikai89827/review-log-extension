/**
 * 移动端连接配置工具
 * 从环境变量读取默认配置
 * Plasmo 会自动将 PLASMO_PUBLIC_ 前缀的环境变量注入到前端
 */

export interface MobileConfig {
  // 默认连接模式
  defaultMode: 'self-hosted' | 'goeasy'
  
  // 自建服务器配置
  selfHosted: {
    serverUrl: string
  }
  
  // GoEasy 配置
  goeasy: {
    host: string
    appkey: string
    channel: string
  }
}

export function getMobileConfig(): MobileConfig {
  // Plasmo 会将 PLASMO_PUBLIC_ 前缀的环境变量注入到前端
  // 访问时使用 process.env.PUBLIC_XXX
  return {
    defaultMode: (process.env.PUBLIC_DEFAULT_CONNECTION_MODE as 'self-hosted' | 'goeasy') || 'self-hosted',
    
    selfHosted: {
      serverUrl: process.env.PUBLIC_SELF_HOSTED_SERVER_URL || ''
    },
    
    goeasy: {
      host: process.env.PUBLIC_GOEASY_HOST || 'hangzhou.goeasy.io',
      appkey: process.env.PUBLIC_GOEASY_APPKEY || '',
      channel: process.env.PUBLIC_GOEASY_CHANNEL || 'review-log-channel'
    }
  }
}