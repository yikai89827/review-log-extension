/**
 * 移动端连接配置工具
 * 从环境变量读取默认配置
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
  return {
    defaultMode: (process.env.DEFAULT_CONNECTION_MODE as 'self-hosted' | 'goeasy') || 'self-hosted',
    
    selfHosted: {
      serverUrl: process.env.SELF_HOSTED_SERVER_URL || ''
    },
    
    goeasy: {
      host: process.env.GOEASY_HOST || 'hangzhou.goeasy.io',
      appkey: process.env.GOEASY_APPKEY || '',
      channel: process.env.GOEASY_CHANNEL || 'review-log-channel'
    }
  }
}