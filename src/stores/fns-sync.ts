/**
 * fast-note-sync 连接状态（UI 用）。
 */
import { create } from 'zustand'

interface FnsSyncState {
  connected: boolean
  authed: boolean
  syncing: boolean
  lastError: string | null
  serverVersion: string | null
  setStatus: (s: Partial<Pick<FnsSyncState, 'connected' | 'authed' | 'syncing' | 'lastError' | 'serverVersion'>>) => void
}

const useFnsSyncStore = create<FnsSyncState>((set) => ({
  connected: false,
  authed: false,
  syncing: false,
  lastError: null,
  serverVersion: null,
  setStatus: (s) => set(s),
}))

export default useFnsSyncStore
