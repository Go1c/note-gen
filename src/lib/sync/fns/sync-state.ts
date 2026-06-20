/**
 * fast-note-sync 多端状态：按模块的增量基准 lastTime、连接计数、watch 开关。
 *
 * lastTime 是「离线后重连自动补齐」的根基：同步请求带本端各模块 lastTime，服务端只回
 * mtime > lastTime 的增量；收到 *SyncEnd 后把本地 lastTime 更新为服务端返回的 data.lastTime。
 * 每个 vault 隔离持久化，4 个模块各一个时间戳。
 */

import { Store } from '@tauri-apps/plugin-store'

const STORE_FILE = 'fns_state.json'

export type SyncModule = 'note' | 'file' | 'folder' | 'setting'

function lastTimeKey(vault: string, mod: SyncModule): string {
  return `lastTime:${vault}:${mod}`
}
function countKey(vault: string): string {
  return `count:${vault}`
}

let storePromise: Promise<Store> | null = null
function getStore(): Promise<Store> {
  if (!storePromise) storePromise = Store.load(STORE_FILE)
  return storePromise
}

export async function getLastTime(vault: string, mod: SyncModule): Promise<number> {
  const store = await getStore()
  return (await store.get<number>(lastTimeKey(vault, mod))) ?? 0
}

export async function setLastTime(vault: string, mod: SyncModule, value: number): Promise<void> {
  if (!value || value <= 0) return
  const store = await getStore()
  const current = (await store.get<number>(lastTimeKey(vault, mod))) ?? 0
  // 只前进，不回退，避免乱序消息把基准拉回
  if (value > current) {
    await store.set(lastTimeKey(vault, mod), value)
    await store.save()
  }
}

/** 取出并自增连接计数（每次新建连接调用一次） */
export async function nextConnectCount(vault: string): Promise<number> {
  const store = await getStore()
  const current = (await store.get<number>(countKey(vault))) ?? 0
  const next = current + 1
  await store.set(countKey(vault), next)
  await store.save()
  return next
}

/** 清空某 vault 的全部 lastTime（强制下次全量对账） */
export async function clearLastTimes(vault: string): Promise<void> {
  const store = await getStore()
  const mods: SyncModule[] = ['note', 'file', 'folder', 'setting']
  for (const m of mods) await store.delete(lastTimeKey(vault, m))
  await store.save()
}

/**
 * watch 开关（仅内存）：全量对账期间关闭，避免把「接收写入」误当本地改动上行。
 */
let watchEnabled = true
export function isWatchEnabled(): boolean {
  return watchEnabled
}
export function enableWatch(): void {
  watchEnabled = true
}
export function disableWatch(): void {
  watchEnabled = false
}
