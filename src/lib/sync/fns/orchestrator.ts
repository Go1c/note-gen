/**
 * 同步编排：连接时全量对账 + 本地变更上行钩子。
 *
 * 全量对账（handleSync 复刻）：disableWatch → 扫描工作区构造清单 → 先 FolderSync，
 * 再 NoteSync + FileSync → 消费服务端 messages（由 client 分派）→ 一段宽限后 enableWatch。
 * 本地变更上行：钩 emitter 'article-saved' → 经回环防护后 NoteModify。
 */

import { ACT, type NoteSnapshot, type FolderSnapshot } from './protocol'
import { hashContentAsync, hashPath } from './hash'
import * as HM from './hash-manager'
import * as Guard from './loop-guard'
import { getLastTime, isWatchEnabled, disableWatch, enableWatch } from './sync-state'
import { getAllMarkdownFiles } from '@/lib/files'
import { shouldExclude } from '@/config/sync-exclusions'
import emitter from '@/lib/emitter'
import type { FnsClient } from './client'
import { uploadNote } from './operator-note'

function genContext(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `ctx_${Date.now()}_${Math.floor(performance.now())}`
  }
}

/** 扫描本地 Markdown，构造笔记快照（带 contentHash 缓存复用 + baseHash） */
async function buildNoteSnapshots(vault: string): Promise<{ notes: NoteSnapshot[]; localPaths: Set<string> }> {
  const files = await getAllMarkdownFiles(true)
  const notes: NoteSnapshot[] = []
  const localPaths = new Set<string>()
  for (const f of files) {
    const rel = f.relativePath
    if (shouldExclude(rel)) continue
    localPaths.add(rel)
    const mtime = f.metadata?.modifiedAt ? f.metadata.modifiedAt.getTime() : 0
    const size = f.metadata?.size ?? 0
    let contentHash = await HM.getValidHash(vault, rel, mtime, size)
    if (!contentHash) {
      try {
        const { readNote } = await import('./fs-utils')
        const content = await readNote(rel)
        contentHash = await hashContentAsync(content)
        await HM.setHash(vault, rel, { contentHash, mtime, size, successful: false })
      } catch {
        continue
      }
    }
    const baseHash = (await HM.getBaseHash(vault, rel)) ?? undefined
    notes.push({
      path: rel,
      pathHash: hashPath(rel),
      contentHash,
      mtime,
      size,
      ctime: f.metadata?.createdAt ? Math.floor(f.metadata.createdAt.getTime() / 1000) : undefined,
      baseHash,
      baseHashMissing: baseHash === undefined,
    })
  }
  await HM.flush(vault)
  return { notes, localPaths }
}

/** 由笔记路径推导出涉及的文件夹（去重）。空文件夹本期不单独捕获。 */
function deriveFolders(localPaths: Set<string>): FolderSnapshot[] {
  const set = new Set<string>()
  for (const p of localPaths) {
    const parts = p.split('/')
    parts.pop()
    let acc = ''
    for (const part of parts) {
      acc = acc ? `${acc}/${part}` : part
      set.add(acc)
    }
  }
  return [...set].map((path) => ({ path, pathHash: hashPath(path) }))
}

/**
 * 连接就绪后的全量对账。
 */
export async function fullSync(client: FnsClient): Promise<void> {
  const vault = client.vault
  disableWatch()
  try {
    const { notes, localPaths } = await buildNoteSnapshots(vault)
    const folders = deriveFolders(localPaths)

    // 本地哈希表里有、但本地已不存在 → 告知服务端这些是本端删除
    const known = await HM.getAllPaths(vault)
    const delNotes = known
      .filter((p) => !localPaths.has(p) && p.endsWith('.md'))
      .map((p) => ({ path: p, pathHash: hashPath(p) }))

    const folderCtx = genContext()
    client.ctx.send(ACT.FolderSync, {
      vault,
      lastTime: await getLastTime(vault, 'folder'),
      folders,
      context: folderCtx,
    })

    // 文件夹结构就绪后再发笔记/附件（给服务端一点时间建目录）
    await new Promise<void>((r) => setTimeout(r, 300))

    client.ctx.send(ACT.NoteSync, {
      vault,
      lastTime: await getLastTime(vault, 'note'),
      notes,
      delNotes,
      context: genContext(),
    })

    // 附件：本期发空清单（下载向对账，接收其它端附件）；本地存量附件上传待补全
    // TODO(附件): 扫描工作区非 .md 二进制文件构造 files 清单做双向对账
    client.ctx.send(ACT.FileSync, {
      vault,
      lastTime: await getLastTime(vault, 'file'),
      files: [],
      context: genContext(),
    })

    // TODO(配置): SettingSync 待范围确定后接入
  } finally {
    // 宽限期后恢复 watch。明细写入由 loop-guard 逐文件保护，故此处仅作总开关兜底。
    setTimeout(() => enableWatch(), 8000)
  }
}

/**
 * 注册本地变更上行钩子。返回清理函数。
 */
export function registerUploadHooks(client: FnsClient): () => void {
  const onSaved = (e: unknown) => {
    const evt = e as { path: string; content: string }
    if (!evt?.path) return
    if (!isWatchEnabled()) return                 // 对账期间不上行
    if (Guard.isIgnored(evt.path)) return         // 这是刚同步下来的写入，跳过
    if (shouldExclude(evt.path)) return
    void uploadNote(client.ctx, evt.path)
  }
  emitter.on('article-saved', onSaved)

  // TODO(删除/重命名): note-gen 暂无专用删除/重命名 emitter 事件，需在 article store
  // 的删除/重命名动作处挂钩调用 deleteNote/renameNote；本期靠下次连接的对账兜底删除。

  return () => {
    emitter.off('article-saved', onSaved)
  }
}
