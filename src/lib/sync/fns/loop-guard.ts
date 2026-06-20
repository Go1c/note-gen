/**
 * fast-note-sync 回环防护。
 *
 * 核心问题：收到服务端推送 → 写本地文件 → 若本地变更监听把这次写入又当成「用户改动」
 * 上行，会造成无限回环。三层防护（复刻插件）：
 *  1. ignoredFiles：写本地前加入，写完延迟 ~500ms 移除——期间该 path 的本地改动一律忽略。
 *  2. lastSyncMtime：记录服务端推送写入时的 mtime/contentHash；本地「改动」若与之一致则忽略。
 *  3. lastSyncPathDeleted / lastSyncPathRenamed：删除/重命名同理拦截。
 */

const IGNORE_TTL = 600

const ignoredFiles = new Map<string, ReturnType<typeof setTimeout>>()
const lastSyncMtime = new Map<string, { mtime: number; contentHash: string }>()
const lastSyncPathDeleted = new Map<string, ReturnType<typeof setTimeout>>()
const lastSyncPathRenamed = new Map<string, ReturnType<typeof setTimeout>>()

// ---- ignoredFiles ----

/** 写本地前调用，标记该 path 为「正在被同步写入」 */
export function beginIgnore(path: string): void {
  const existing = ignoredFiles.get(path)
  if (existing) clearTimeout(existing)
  // 先占位（无定时器），由 endIgnore 安排延迟移除
  ignoredFiles.set(path, setTimeout(() => ignoredFiles.delete(path), 60_000))
}

/** 写本地完成后调用，延迟移除标记，覆盖文件系统事件的异步抖动窗口 */
export function endIgnore(path: string, ttl = IGNORE_TTL): void {
  const existing = ignoredFiles.get(path)
  if (existing) clearTimeout(existing)
  ignoredFiles.set(path, setTimeout(() => ignoredFiles.delete(path), ttl))
}

export function isIgnored(path: string): boolean {
  return ignoredFiles.has(path)
}

// ---- lastSyncMtime ----

export function recordSyncMtime(path: string, mtime: number, contentHash: string): void {
  lastSyncMtime.set(path, { mtime, contentHash })
}

/** 本地改动是否其实就是「刚同步下来的版本」（mtime 或 contentHash 命中） */
export function isSyncedVersion(path: string, mtime: number, contentHash: string): boolean {
  const rec = lastSyncMtime.get(path)
  if (!rec) return false
  return rec.contentHash === contentHash || rec.mtime === mtime
}

export function clearSyncMtime(path: string): void {
  lastSyncMtime.delete(path)
}

// ---- 删除 / 重命名 ----

export function recordSyncDeleted(path: string, ttl = IGNORE_TTL): void {
  const existing = lastSyncPathDeleted.get(path)
  if (existing) clearTimeout(existing)
  lastSyncPathDeleted.set(path, setTimeout(() => lastSyncPathDeleted.delete(path), ttl))
}
export function isSyncDeleted(path: string): boolean {
  return lastSyncPathDeleted.has(path)
}

export function recordSyncRenamed(path: string, ttl = IGNORE_TTL): void {
  const existing = lastSyncPathRenamed.get(path)
  if (existing) clearTimeout(existing)
  lastSyncPathRenamed.set(path, setTimeout(() => lastSyncPathRenamed.delete(path), ttl))
}
export function isSyncRenamed(path: string): boolean {
  return lastSyncPathRenamed.has(path)
}

/** 全部清空（断开连接时） */
export function resetGuards(): void {
  for (const t of ignoredFiles.values()) clearTimeout(t)
  for (const t of lastSyncPathDeleted.values()) clearTimeout(t)
  for (const t of lastSyncPathRenamed.values()) clearTimeout(t)
  ignoredFiles.clear()
  lastSyncMtime.clear()
  lastSyncPathDeleted.clear()
  lastSyncPathRenamed.clear()
}
