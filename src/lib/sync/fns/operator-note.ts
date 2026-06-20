/**
 * 笔记模块收发。
 * 接收：服务端推送（其它设备改动）或全量对账下发的 NoteSync* 明细。
 * 发送：本端改动上行 NoteModify/NoteDelete/NoteRename。
 */

import { ACT, type NoteSyncModifyMessage, type NoteSyncDeleteMessage, type NoteSyncRenameMessage, type NoteSyncMtimeMessage, type NoteSyncNeedPushMessage } from './protocol'
import { hashContentAsync, hashPath } from './hash'
import * as HM from './hash-manager'
import * as Guard from './loop-guard'
import * as State from './sync-state'
import { readNote, writeNote, removePath, renamePathFs, statRel, refreshAfterRemoteWrite, refreshFileTree } from './fs-utils'

export interface FnsCtx {
  vault: string
  send: (action: string, data: unknown) => boolean
}

const nowSec = (ms: number) => Math.floor((ms || Date.now()) / 1000)

// ============ 接收（下行） ============

/** 服务端较新：用 data.content 覆盖本地 */
export async function receiveNoteSyncModify(ctx: FnsCtx, msg: NoteSyncModifyMessage): Promise<void> {
  const { path, content } = msg
  Guard.beginIgnore(path)
  try {
    await writeNote(path, content)
    const contentHash = await hashContentAsync(content)
    const s = await statRel(path)
    await HM.setHash(ctx.vault, path, {
      contentHash,
      mtime: s?.mtime ?? Date.now(),
      size: s?.size ?? content.length,
      successful: true, // 已与服务端一致 → 推进 baseHash
    })
    Guard.recordSyncMtime(path, s?.mtime ?? Date.now(), contentHash)
    refreshAfterRemoteWrite(path, content)
    if (msg.lastTime) await State.setLastTime(ctx.vault, 'note', msg.lastTime)
  } finally {
    Guard.endIgnore(path)
    await HM.flush(ctx.vault)
  }
}

/** 服务端已删 → 删本地 */
export async function receiveNoteSyncDelete(ctx: FnsCtx, msg: NoteSyncDeleteMessage): Promise<void> {
  const { path } = msg
  Guard.recordSyncDeleted(path)
  await removePath(path)
  await HM.deletePath(ctx.vault, path)
  refreshFileTree()
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'note', msg.lastTime)
  await HM.flush(ctx.vault)
}

/** 服务端重命名 → 本地重命名 */
export async function receiveNoteSyncRename(ctx: FnsCtx, msg: NoteSyncRenameMessage): Promise<void> {
  const { oldPath, path } = msg
  Guard.recordSyncRenamed(oldPath)
  Guard.recordSyncRenamed(path)
  await renamePathFs(oldPath, path)
  await HM.renamePath(ctx.vault, oldPath, path)
  refreshFileTree()
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'note', msg.lastTime)
  await HM.flush(ctx.vault)
}

/** 内容一致，仅更新时间基准 */
export async function receiveNoteSyncMtime(ctx: FnsCtx, msg: NoteSyncMtimeMessage): Promise<void> {
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'note', msg.lastTime)
}

/** 服务端要求客户端上传本地版本 */
export async function receiveNoteSyncNeedPush(ctx: FnsCtx, msg: NoteSyncNeedPushMessage): Promise<void> {
  await uploadNote(ctx, msg.path)
}

/** 上行被接受的 ack：推进 baseHash + lastTime */
export async function receiveNoteModifyAck(ctx: FnsCtx, data: { path: string; contentHash?: string; lastTime?: number }): Promise<void> {
  if (data.contentHash) {
    const e = await HM.getEntry(ctx.vault, data.path)
    if (e) await HM.setHash(ctx.vault, data.path, { contentHash: e.contentHash, mtime: e.mtime, size: e.size, successful: true })
  }
  if (data.lastTime) await State.setLastTime(ctx.vault, 'note', data.lastTime)
  await HM.flush(ctx.vault)
}

// ============ 发送（上行） ============

export async function uploadNote(ctx: FnsCtx, relPath: string): Promise<void> {
  let content: string
  try {
    content = await readNote(relPath)
  } catch {
    return // 文件已不存在
  }
  const contentHash = await hashContentAsync(content)
  const s = await statRel(relPath)
  const baseHash = (await HM.getBaseHash(ctx.vault, relPath)) ?? undefined
  ctx.send(ACT.NoteModify, {
    vault: ctx.vault,
    path: relPath,
    pathHash: hashPath(relPath),
    content,
    contentHash,
    baseHash,
    ctime: nowSec(s?.ctime ?? Date.now()),
    mtime: nowSec(s?.mtime ?? Date.now()),
  })
  // 暂存本端当前哈希（baseHash 待 ack 后推进）
  await HM.setHash(ctx.vault, relPath, {
    contentHash,
    mtime: s?.mtime ?? Date.now(),
    size: s?.size ?? content.length,
    successful: false,
  })
  await HM.flush(ctx.vault)
}

export async function deleteNote(ctx: FnsCtx, relPath: string): Promise<void> {
  ctx.send(ACT.NoteDelete, { vault: ctx.vault, path: relPath, pathHash: hashPath(relPath) })
  await HM.deletePath(ctx.vault, relPath)
  await HM.flush(ctx.vault)
}

export async function renameNote(ctx: FnsCtx, oldRel: string, newRel: string): Promise<void> {
  ctx.send(ACT.NoteRename, {
    vault: ctx.vault,
    path: newRel,
    pathHash: hashPath(newRel),
    oldPath: oldRel,
    oldPathHash: hashPath(oldRel),
  })
  await HM.renamePath(ctx.vault, oldRel, newRel)
  await HM.flush(ctx.vault)
}
