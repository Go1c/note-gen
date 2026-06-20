/**
 * fast-note-sync 文件读写工具：统一以「相对工作区路径」操作本地文件，
 * 兼容默认工作区（AppData/article）与自定义工作区（绝对路径），并在写入后刷新 UI。
 */

import {
  readTextFile,
  writeTextFile,
  readFile,
  writeFile,
  mkdir,
  remove,
  rename,
  stat,
  exists,
} from '@tauri-apps/plugin-fs'
import { getFilePathOptions } from '@/lib/workspace'
import emitter from '@/lib/emitter'
import useArticleStore from '@/stores/article'

/** 取相对路径的父目录（正斜杠） */
function parentDir(relPath: string): string {
  const norm = relPath.replace(/\\/g, '/')
  const idx = norm.lastIndexOf('/')
  return idx === -1 ? '' : norm.slice(0, idx)
}

async function ensureParentDir(relPath: string): Promise<void> {
  const dir = parentDir(relPath)
  if (!dir) return
  const opts = await getFilePathOptions(dir)
  try {
    const present = opts.baseDir ? await exists(opts.path, { baseDir: opts.baseDir }) : await exists(opts.path)
    if (!present) {
      if (opts.baseDir) await mkdir(opts.path, { baseDir: opts.baseDir, recursive: true })
      else await mkdir(opts.path, { recursive: true })
    }
  } catch {
    // mkdir recursive 幂等，忽略已存在
  }
}

export async function readNote(relPath: string): Promise<string> {
  const opts = await getFilePathOptions(relPath)
  return opts.baseDir ? readTextFile(opts.path, { baseDir: opts.baseDir }) : readTextFile(opts.path)
}

export async function writeNote(relPath: string, content: string): Promise<void> {
  await ensureParentDir(relPath)
  const opts = await getFilePathOptions(relPath)
  if (opts.baseDir) await writeTextFile(opts.path, content, { baseDir: opts.baseDir })
  else await writeTextFile(opts.path, content)
}

export async function readBinaryFile(relPath: string): Promise<Uint8Array> {
  const opts = await getFilePathOptions(relPath)
  return opts.baseDir ? readFile(opts.path, { baseDir: opts.baseDir }) : readFile(opts.path)
}

export async function writeBinaryFile(relPath: string, data: Uint8Array): Promise<void> {
  await ensureParentDir(relPath)
  const opts = await getFilePathOptions(relPath)
  if (opts.baseDir) await writeFile(opts.path, data, { baseDir: opts.baseDir })
  else await writeFile(opts.path, data)
}

export async function removePath(relPath: string): Promise<void> {
  const opts = await getFilePathOptions(relPath)
  try {
    if (opts.baseDir) await remove(opts.path, { baseDir: opts.baseDir })
    else await remove(opts.path)
  } catch {
    // 已不存在则忽略
  }
}

export async function renamePathFs(oldRel: string, newRel: string): Promise<void> {
  await ensureParentDir(newRel)
  const from = await getFilePathOptions(oldRel)
  const to = await getFilePathOptions(newRel)
  if (from.baseDir && to.baseDir) {
    await rename(from.path, to.path, { oldPathBaseDir: from.baseDir, newPathBaseDir: to.baseDir })
  } else {
    await rename(from.path, to.path)
  }
}

export async function mkdirRel(relPath: string): Promise<void> {
  if (!relPath) return
  const opts = await getFilePathOptions(relPath)
  try {
    if (opts.baseDir) await mkdir(opts.path, { baseDir: opts.baseDir, recursive: true })
    else await mkdir(opts.path, { recursive: true })
  } catch {
    /* 幂等 */
  }
}

/** 返回 { mtime(ms), size, ctime(ms) }，文件不存在返回 null */
export async function statRel(relPath: string): Promise<{ mtime: number; size: number; ctime: number } | null> {
  const opts = await getFilePathOptions(relPath)
  try {
    const s = opts.baseDir ? await stat(opts.path, { baseDir: opts.baseDir }) : await stat(opts.path)
    return {
      mtime: s.mtime ? new Date(s.mtime).getTime() : 0,
      ctime: s.birthtime ? new Date(s.birthtime).getTime() : 0,
      size: s.size ?? 0,
    }
  } catch {
    return null
  }
}

export async function existsRel(relPath: string): Promise<boolean> {
  const opts = await getFilePathOptions(relPath)
  try {
    return opts.baseDir ? await exists(opts.path, { baseDir: opts.baseDir }) : await exists(opts.path)
  } catch {
    return false
  }
}

/**
 * 写入远程内容后刷新 UI：若该文件正在编辑器中打开则更新内容；并刷新文件树。
 */
export function refreshAfterRemoteWrite(relPath: string, content: string): void {
  const article = useArticleStore.getState()
  if (article.activeFilePath === relPath) {
    emitter.emit('sync-content-updated', { path: relPath, content })
  }
  // 跳过远程同步的文件树刷新（避免再次触发对账）
  void article.loadFileTree?.({ skipRemoteSync: true })
}

/** 仅刷新文件树（删除/重命名/新建后） */
export function refreshFileTree(): void {
  void useArticleStore.getState().loadFileTree?.({ skipRemoteSync: true })
}
