/**
 * fast-note-sync 连接管理单例：读取配置、建立/断开连接、串联对账与上行钩子、上报 UI 状态。
 */

import { Store } from '@tauri-apps/plugin-store'
import { FNS_CONFIG_KEY, type FastNoteSyncConfig, type SyncPlatform } from '@/types/sync'
import { FnsClient } from './client'
import { fullSync, registerUploadHooks } from './orchestrator'
import useFnsSyncStore from '@/stores/fns-sync'
import { showErrorTip, classifyError } from '@/lib/error-tips'

let client: FnsClient | null = null
let cleanupHooks: (() => void) | null = null

export function isValidConfig(c: unknown): c is FastNoteSyncConfig {
  const cfg = c as FastNoteSyncConfig
  return !!cfg && typeof cfg.api === 'string' && !!cfg.api && typeof cfg.apiToken === 'string' && !!cfg.apiToken && typeof cfg.vault === 'string' && !!cfg.vault
}

export async function getFnsConfig(): Promise<FastNoteSyncConfig | null> {
  const store = await Store.load('store.json')
  const cfg = await store.get<FastNoteSyncConfig>(FNS_CONFIG_KEY)
  return isValidConfig(cfg) ? cfg : null
}

export async function saveFnsConfig(cfg: FastNoteSyncConfig): Promise<void> {
  const store = await Store.load('store.json')
  await store.set(FNS_CONFIG_KEY, cfg)
  await store.save()
}

/** 当前主同步后端是否为 fast-note-sync */
export async function isFnsPrimary(): Promise<boolean> {
  const store = await Store.load('store.json')
  const method = await store.get<SyncPlatform>('primaryBackupMethod')
  return method === 'fast-note-sync'
}

/** 建立连接（若已连接则先断开） */
export async function connectFns(cfgOverride?: FastNoteSyncConfig): Promise<boolean> {
  const cfg = cfgOverride ?? (await getFnsConfig())
  if (!cfg) return false
  disconnectFns()

  const setStatus = useFnsSyncStore.getState().setStatus
  client = new FnsClient(cfg, {
    onStatusChange: (connected, authed) => setStatus({ connected, authed, lastError: connected ? null : useFnsSyncStore.getState().lastError }),
    onError: (message) => {
      setStatus({ lastError: message })
      // 仅鉴权失败这类「可操作」错误弹提示；瞬时连接错误不弹
      if (classifyError(message, 'sync') === 'sync.authFailed') {
        showErrorTip('sync.authFailed')
      }
    },
    onReady: (c) => {
      setStatus({ syncing: true, lastError: null })
      void fullSync(c).finally(() => setStatus({ syncing: false }))
    },
  })
  cleanupHooks = registerUploadHooks(client)
  await client.connect()
  return true
}

export function disconnectFns(): void {
  cleanupHooks?.()
  cleanupHooks = null
  client?.disconnect()
  client = null
  useFnsSyncStore.getState().setStatus({ connected: false, authed: false, syncing: false })
}

export function getFnsClient(): FnsClient | null {
  return client
}

/**
 * 应用启动时调用：若主后端为 fast-note-sync 且配置有效则自动连接。
 */
export async function initFnsIfActive(): Promise<void> {
  if (await isFnsPrimary()) {
    await connectFns()
  }
}
