/**
 * 文件夹模块收发。文件夹只关心路径结构（无内容）。
 */

import { ACT } from './protocol'
import { hashPath } from './hash'
import * as Guard from './loop-guard'
import * as State from './sync-state'
import { mkdirRel, removePath, renamePathFs, refreshFileTree } from './fs-utils'
import type { FnsCtx } from './operator-note'

interface FolderMsg {
  path: string
  oldPath?: string
  lastTime?: number
}

// 接收
export async function receiveFolderSyncModify(ctx: FnsCtx, msg: FolderMsg): Promise<void> {
  Guard.beginIgnore(msg.path)
  try {
    await mkdirRel(msg.path)
    refreshFileTree()
    if (msg.lastTime) await State.setLastTime(ctx.vault, 'folder', msg.lastTime)
  } finally {
    Guard.endIgnore(msg.path)
  }
}

export async function receiveFolderSyncDelete(ctx: FnsCtx, msg: FolderMsg): Promise<void> {
  Guard.recordSyncDeleted(msg.path)
  await removePath(msg.path)
  refreshFileTree()
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'folder', msg.lastTime)
}

export async function receiveFolderSyncRename(ctx: FnsCtx, msg: FolderMsg): Promise<void> {
  if (!msg.oldPath) return
  Guard.recordSyncRenamed(msg.oldPath)
  Guard.recordSyncRenamed(msg.path)
  await renamePathFs(msg.oldPath, msg.path)
  refreshFileTree()
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'folder', msg.lastTime)
}

// 发送
export function modifyFolder(ctx: FnsCtx, relPath: string): void {
  ctx.send(ACT.FolderModify, { vault: ctx.vault, path: relPath, pathHash: hashPath(relPath) })
}
export function deleteFolder(ctx: FnsCtx, relPath: string): void {
  ctx.send(ACT.FolderDelete, { vault: ctx.vault, path: relPath, pathHash: hashPath(relPath) })
}
export function renameFolder(ctx: FnsCtx, oldRel: string, newRel: string): void {
  ctx.send(ACT.FolderRename, {
    vault: ctx.vault,
    path: newRel,
    pathHash: hashPath(newRel),
    oldPath: oldRel,
    oldPathHash: hashPath(oldRel),
  })
}
