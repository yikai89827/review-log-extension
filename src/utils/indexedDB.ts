import type { LogEntry, PageActionEvent } from "../types"

const DB_NAME = "ReviewLogDB"
const DB_VERSION = 1
const STORE_NAME = "logs"
const BODY_STORE_NAME = "body_content"

interface StoredEntry {
  id: string
  tabId: number | string
  type: "log" | "action"
  data: LogEntry | PageActionEvent
  timestamp: number
}

interface BodyContentEntry {
  tabId: number | string
  url: string
  content: string
  timestamp: number
}

let dbInstance: IDBDatabase | null = null

export async function openDB(): Promise<IDBDatabase> {
  if (dbInstance) return dbInstance

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)

    request.onerror = () => reject(request.error)

    request.onsuccess = () => {
      dbInstance = request.result
      resolve(dbInstance)
    }

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" })
        store.createIndex("tabId", "tabId", { unique: false })
        store.createIndex("timestamp", "timestamp", { unique: false })
      }
      if (!db.objectStoreNames.contains(BODY_STORE_NAME)) {
        const bodyStore = db.createObjectStore(BODY_STORE_NAME, { keyPath: "tabId" })
        bodyStore.createIndex("timestamp", "timestamp", { unique: false })
      }
    }
  })
}

export async function saveLog(tabId: number | string, entry: LogEntry): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    
    const stored: StoredEntry = {
      id: `log_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      tabId,
      type: "log",
      data: entry,
      timestamp: Date.now()
    }

    const request = store.put(stored)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function saveAction(tabId: number | string, event: PageActionEvent): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    
    const stored: StoredEntry = {
      id: `action_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      tabId,
      type: "action",
      data: event,
      timestamp: Date.now()
    }

    const request = store.put(stored)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getLogsByTabId(tabId: number | string): Promise<StoredEntry[]> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index("tabId")
    const request = index.getAll(tabId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => {
      const results = request.result as StoredEntry[]
      results.sort((a, b) => a.timestamp - b.timestamp)
      resolve(results)
    }
  })
}

export async function deleteLogsByTabId(tabId: number | string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    const index = store.index("tabId")
    
    index.getAll(tabId).onsuccess = (event) => {
      const results = (event.target as IDBRequest).result as StoredEntry[]
      results.forEach(entry => {
        store.delete(entry.id)
      })
      resolve()
    }
    
    index.getAll(tabId).onerror = () => reject(index.error)
  })
}

export async function clearAllLogs(): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readwrite")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.clear()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

export async function getLogCount(): Promise<number> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([STORE_NAME], "readonly")
    const store = transaction.objectStore(STORE_NAME)
    const request = store.count()

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result)
  })
}

// 存储 body 内容到 IndexedDB
export async function saveBodyContent(tabId: number | string, content: string, url: string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BODY_STORE_NAME], "readwrite")
    const store = transaction.objectStore(BODY_STORE_NAME)
    
    const entry: BodyContentEntry = {
      tabId,
      url,
      content,
      timestamp: Date.now()
    }

    const request = store.put(entry)
    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}

// 获取 body 内容
export async function getBodyContent(tabId: number | string): Promise<BodyContentEntry | null> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BODY_STORE_NAME], "readonly")
    const store = transaction.objectStore(BODY_STORE_NAME)
    const request = store.get(tabId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve(request.result || null)
  })
}

// 删除 body 内容
export async function deleteBodyContent(tabId: number | string): Promise<void> {
  const db = await openDB()
  return new Promise((resolve, reject) => {
    const transaction = db.transaction([BODY_STORE_NAME], "readwrite")
    const store = transaction.objectStore(BODY_STORE_NAME)
    const request = store.delete(tabId)

    request.onerror = () => reject(request.error)
    request.onsuccess = () => resolve()
  })
}
