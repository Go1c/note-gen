/**
 * fast-note-sync 哈希管理器：每个文件缓存 { contentHash, mtime, size } 并记录
 * baseHash（上次成功同步后的 contentHash，即三方合并的「共同祖先」）。
 *
 * 三方合并的基石：上行时同时带 contentHash（本端当前）与 baseHash（祖先），服务端据此
 * 判断「谁改了」——只有本端改 → 接受；两端都改 → 冲突。
 *
 * 缓存按 mtime+size 命中复用，避免每次全量重算。按 vault 隔离持久化。
 */

import { Store } from '@tauri-apps/plugin-store'

const STORE_FILE = 'fns_hashes.json'

export interface HashEntry {
  contentHash: string
  mtime: number
  size: number
  baseHash: string   // 上次成功同步后的 contentHash
}

type HashMap = Record<string, HashEntry>

function mapKey(vault: string): string {
  return `hashMap:${vault}`
}

let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = Store.load(STORE_FILE)
  return storePromise
}

/** 内存缓存：vault -> HashMap，避免频繁读盘 */
const memCache = new Map<string, HashMap>()
let dirty = false

async function loadMap(vault: string): Promise<HashMap> {
  const cached = memCache.get(vault)
  if (cached) return cached
  const store = await getStore()
  const map = (await store.get<HashMap>(mapKey(vault))) ?? {}
  memCache.set(vault, map)
  return map
}

/** 把内存改动落盘（合并多次写，节流由调用方控制；此处直接保存） */
export async function flush(vault: string): Promise<void> {
  if (!dirty) return
  const map = memCache.get(vault)
  if (!map) return
  const store = await getStore()
  await store.set(mapKey(vault), map)
  await store.save()
  dirty = false
}

/** 命中复用：mtime+size 都一致则返回缓存 contentHash，否则 null（需重算） */
export async function getValidHash(
  vault: string,
  path: string,
  mtime: number,
  size: number
): Promise<string | null> {
  const map = await loadMap(vault)
  const e = map[path]
  if (e && e.mtime === mtime && e.size === size) return e.contentHash
  return null
}

export async function getEntry(vault: string, path: string): Promise<HashEntry | null> {
  const map = await loadMap(vault)
  return map[path] ?? null
}

export async function getBaseHash(vault: string, path: string): Promise<string | null> {
  const e = await getEntry(vault, path)
  return e ? e.baseHash : null
}

/**
 * 记录一个文件的当前哈希。successful=true 表示这是「已与服务端达成一致」的版本，
 * 此时同步推进 baseHash（祖先 = 当前内容）。本地改动写入时 successful=false，只更新
 * contentHash/mtime/size，保留旧 baseHash 作为祖先。
 */
export async function setHash(
  vault: string,
  path: string,
  params: { contentHash: string; mtime: number; size: number; successful: boolean }
): Promise<void> {
  const map = await loadMap(vault)
  const prev = map[path]
  map[path] = {
    contentHash: params.contentHash,
    mtime: params.mtime,
    size: params.size,
    baseHash: params.successful ? params.contentHash : prev?.baseHash ?? params.contentHash,
  }
  dirty = true
}

export async function deletePath(vault: string, path: string): Promise<void> {
  const map = await loadMap(vault)
  if (path in map) {
    delete map[path]
    dirty = true
  }
}

export async function renamePath(vault: string, oldPath: string, newPath: string): Promise<void> {
  const map = await loadMap(vault)
  if (map[oldPath]) {
    map[newPath] = map[oldPath]
    delete map[oldPath]
    dirty = true
  }
}

export async function getAllPaths(vault: string): Promise<string[]> {
  const map = await loadMap(vault)
  return Object.keys(map)
}

export async function clearAll(vault: string): Promise<void> {
  memCache.set(vault, {})
  const store = await getStore()
  await store.set(mapKey(vault), {})
  await store.save()
  dirty = false
}
