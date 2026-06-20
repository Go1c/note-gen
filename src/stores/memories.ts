import { create } from 'zustand'
import { Memory, getAllMemories, deleteMemory as deleteMemoryDb, upsertMemory, getMemoryStats, insertMemoriesRaw, clearAllMemories as clearAllMemoriesDb } from '@/db/memories'
import { fetchEmbedding } from '@/lib/ai/embedding'
import { uploadDataFile, downloadDataFile, type DataFileDownloadOptions } from '@/lib/sync/data-file-sync'
import { setAutoDataSyncApplyingRemote } from '@/lib/sync/auto-data-sync-queue'

interface MemoriesState {
  memories: Memory[]
  loading: boolean
  stats: {
    total: number
    preferences: number
    memories: number
    totalAccessCount: number
  } | null

  // Actions
  loadMemories: () => Promise<void>
  loadStats: () => Promise<void>
  addMemory: (content: string, category?: 'preference' | 'memory') => Promise<{ id: string; replaced: boolean }>
  deleteMemory: (id: string) => Promise<void>
  clearAllMemories: () => Promise<void>

  // 数据同步（.data/memories.json）
  uploadMemories: () => Promise<boolean>
  downloadMemories: (options?: DataFileDownloadOptions) => Promise<Memory[]>
}

const useMemoriesStore = create<MemoriesState>((set, get) => ({
  memories: [],
  loading: false,
  stats: null,

  loadMemories: async () => {
    set({ loading: true })
    try {
      const memories = await getAllMemories()
      set({ memories, loading: false })
    } catch (error) {
      console.error('Failed to load memories:', error)
      set({ loading: false })
    }
  },

  loadStats: async () => {
    try {
      const stats = await getMemoryStats()
      set({ stats })
    } catch (error) {
      console.error('Failed to load memory stats:', error)
    }
  },

  addMemory: async (content, category) => {
    const embedding = await fetchEmbedding(content)
    if (!embedding) {
      throw new Error('无法生成向量嵌入，请检查嵌入模型配置')
    }

    const result = await upsertMemory({
      content,
      embedding: JSON.stringify(embedding),
      category,
    })

    // Reload memories and stats
    await get().loadMemories()
    await get().loadStats()

    return result
  },

  deleteMemory: async (id) => {
    await deleteMemoryDb(id)
    await get().loadMemories()
    await get().loadStats()
  },

  clearAllMemories: async () => {
    const { clearAllMemories: clearDb } = await import('@/db/memories')
    await clearDb()
    await get().loadMemories()
    await get().loadStats()
  },

  uploadMemories: async () => {
    const memories = await getAllMemories()
    return uploadDataFile('memories.json', JSON.stringify(memories))
  },

  downloadMemories: async (options: DataFileDownloadOptions = {}) => {
    const content = await downloadDataFile('memories.json', options)
    if (content === null) return []
    let memories: Memory[]
    try {
      memories = JSON.parse(content)
    } catch {
      return []
    }
    if (!Array.isArray(memories)) return []
    // 应用远端数据：清空后原样写回（guard 期间不触发上行回环）
    setAutoDataSyncApplyingRemote(true)
    try {
      await clearAllMemoriesDb()
      await insertMemoriesRaw(memories)
      await get().loadMemories()
      await get().loadStats()
    } finally {
      setAutoDataSyncApplyingRemote(false)
    }
    return memories
  },
}))

export default useMemoriesStore
