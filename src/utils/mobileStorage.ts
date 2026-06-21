/**
 * 移动端连接配置持久化工具
 * 使用 Chrome storage API 保存用户配置
 */

export interface SavedMobileConfig {
  mode: 'self-hosted' | 'goeasy'
  
  // 自建服务器配置
  selfHostedServerUrl: string
  
  // GoEasy 配置
  goeasyHost: string
  goeasyAppkey: string
  goeasyChannel: string
}

const STORAGE_KEY = 'review-log-mobile-config'

export async function saveMobileConfig(config: SavedMobileConfig): Promise<void> {
  try {
    await chrome.storage.local.set({ [STORAGE_KEY]: config })
    console.log('[ReviewLog] 移动端配置已保存')
  } catch (e) {
    console.error('[ReviewLog] 保存移动端配置失败:', e)
  }
}

export async function loadMobileConfig(): Promise<SavedMobileConfig | null> {
  try {
    const result = await chrome.storage.local.get(STORAGE_KEY)
    return result[STORAGE_KEY] || null
  } catch (e) {
    console.error('[ReviewLog] 加载移动端配置失败:', e)
    return null
  }
}

export async function clearMobileConfig(): Promise<void> {
  try {
    await chrome.storage.local.remove(STORAGE_KEY)
    console.log('[ReviewLog] 移动端配置已清除')
  } catch (e) {
    console.error('[ReviewLog] 清除移动端配置失败:', e)
  }
}