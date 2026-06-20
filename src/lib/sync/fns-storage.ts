import type { FastNoteSyncConfig } from '@/types/sync'
import { FNS_CONFIG_KEY } from '@/types/sync'
import { Store } from '@tauri-apps/plugin-store'
import { fetch } from '@tauri-apps/plugin-http'
import { hashContent } from '@/lib/sync/fns/hash'

interface FnsSettingResponse {
  code: number
  data?: {
    content?: string
    path?: string
  }
}

function fnsHeaders(apiToken: string) {
  return {
    'Content-Type': 'application/json',
    'Token': apiToken,
  }
}

export async function getFnsStorageConfig(): Promise<FastNoteSyncConfig | null> {
  const store = await Store.load('store.json')
  const cfg = await store.get<FastNoteSyncConfig>(FNS_CONFIG_KEY)
  if (!cfg?.api || !cfg.apiToken || !cfg.vault) return null
  return cfg
}

export async function fnsUpload(cfg: FastNoteSyncConfig, path: string, content: string): Promise<boolean> {
  try {
    const pathHash = hashContent(path)
    const url = `${cfg.api.replace(/\/$/, '')}/api/setting`
    const res = await fetch(url, {
      method: 'POST',
      headers: fnsHeaders(cfg.apiToken),
      body: JSON.stringify({ vault: cfg.vault, path, pathHash, content }),
    })
    if (!res.ok) return false
    const text = await res.text()
    if (!text) return false
    const json: FnsSettingResponse = JSON.parse(text)
    return json.code === 1
  } catch (e) {
    console.error('[fns-storage] upload failed', path, e)
    return false
  }
}

export async function fnsDownload(cfg: FastNoteSyncConfig, path: string): Promise<string | null> {
  try {
    const pathHash = hashContent(path)
    const url = `${cfg.api.replace(/\/$/, '')}/api/setting?vault=${encodeURIComponent(cfg.vault)}&pathHash=${encodeURIComponent(pathHash)}`
    const res = await fetch(url, {
      method: 'GET',
      headers: fnsHeaders(cfg.apiToken),
    })
    if (!res.ok) return null
    const text = await res.text()
    if (!text) return null
    const json: FnsSettingResponse = JSON.parse(text)
    if (json.code !== 1) return null
    return json.data?.content ?? null
  } catch (e) {
    console.error('[fns-storage] download failed', path, e)
    return null
  }
}
