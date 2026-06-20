/**
 * 附件（图片等二进制文件）模块收发：分片上传 / 下载 + 断点续传。
 *
 * 协议（来自 ws_api.md / websocket_sync_protocol.md，部分细节需端到端联调核实）：
 *  - 上传：FileUploadCheck(JSON) → 服务端 FileUpload{sessionId,chunkSize} → 循环发二进制帧。
 *  - 二进制帧 = [可选前缀] + [36B SessionID] + [4B uint32 大端 ChunkIndex] + [分片数据]。
 *    ws_api.md 记前缀为 `BC`；插件文档未提前缀。FNS_BINARY_PREFIX 默认 'BC'，联调时核实。
 *  - 下载：服务端 FileSyncUpdate → 客户端 FileChunkDownload 请求 → 服务端回二进制分片 → 组装写盘。
 */

import { ACT, SESSION_ID_BYTES, type FileSyncUpdateMessage, type FileUploadMessage } from './protocol'
import { hashBinary, hashPath } from './hash'
import * as HM from './hash-manager'
import * as Guard from './loop-guard'
import * as State from './sync-state'
import { readBinaryFile, writeBinaryFile, removePath, statRel, refreshFileTree } from './fs-utils'
import type { FnsCtx } from './operator-note'

/** 二进制帧前缀，联调核实（ws_api.md: 'BC'） */
export const FNS_BINARY_PREFIX = 'BC'

const nowSec = (ms: number) => Math.floor((ms || Date.now()) / 1000)

const enc = new TextEncoder()

function buildChunkFrame(sessionId: string, chunkIndex: number, chunk: Uint8Array): Uint8Array {
  const prefix = enc.encode(FNS_BINARY_PREFIX)
  const sid = enc.encode(sessionId) // UUID 36 字符 → 36 字节
  const frame = new Uint8Array(prefix.length + SESSION_ID_BYTES + 4 + chunk.length)
  let off = 0
  frame.set(prefix, off); off += prefix.length
  frame.set(sid.subarray(0, SESSION_ID_BYTES), off); off += SESSION_ID_BYTES
  const dv = new DataView(frame.buffer)
  dv.setUint32(off, chunkIndex, false) // 大端
  off += 4
  frame.set(chunk, off)
  return frame
}

// ============ 上传 ============

/** 待上传的本地附件：path → 已读取内容，等服务端回 FileUpload 时发送 */
const pendingUploads = new Map<string, { content: Uint8Array; contentHash: string }>()

/** 第一步：发起上传检查 */
export async function uploadFile(ctx: FnsCtx, relPath: string): Promise<void> {
  let content: Uint8Array
  try {
    content = await readBinaryFile(relPath)
  } catch {
    return
  }
  const contentHash = hashBinary(content)
  const s = await statRel(relPath)
  pendingUploads.set(relPath, { content, contentHash })
  ctx.send(ACT.FileUploadCheck, {
    vault: ctx.vault,
    path: relPath,
    pathHash: hashPath(relPath),
    contentHash,
    size: content.length,
    ctime: nowSec(s?.ctime ?? Date.now()),
    mtime: nowSec(s?.mtime ?? Date.now()),
  })
}

/** 第二步：服务端分配 session，开始发分片 */
export async function receiveFileUpload(ctx: FnsCtx, msg: FileUploadMessage, sendBinary: (f: Uint8Array) => boolean): Promise<void> {
  const pending = pendingUploads.get(msg.path)
  if (!pending) return
  const { content, contentHash } = pending
  const chunkSize = msg.chunkSize > 0 ? msg.chunkSize : 256 * 1024
  const total = Math.ceil(content.length / chunkSize) || 1
  for (let i = 0; i < total; i++) {
    const chunk = content.subarray(i * chunkSize, Math.min((i + 1) * chunkSize, content.length))
    const frame = buildChunkFrame(msg.sessionId, i, chunk)
    sendBinary(frame)
    // 让出主线程，避免一次性塞满发送缓冲
    await new Promise<void>((r) => setTimeout(r, 2))
  }
  const s = await statRel(msg.path)
  await HM.setHash(ctx.vault, msg.path, { contentHash, mtime: s?.mtime ?? Date.now(), size: content.length, successful: true })
  await HM.flush(ctx.vault)
  pendingUploads.delete(msg.path)
}

// ============ 下载 ============

interface DownloadSession {
  path: string
  contentHash: string
  size: number
  chunks: Map<number, Uint8Array>
  received: number
  lastTime?: number
}
const downloadSessions = new Map<string, DownloadSession>()

/** 服务端较新：请求下载 */
export async function receiveFileSyncUpdate(ctx: FnsCtx, msg: FileSyncUpdateMessage): Promise<void> {
  ctx.send(ACT.FileChunkDownload, {
    vault: ctx.vault,
    path: msg.path,
    pathHash: msg.pathHash ?? hashPath(msg.path),
    contentHash: msg.contentHash,
  })
  // 预登记：以 contentHash 关联后续二进制分片（sessionId 在分片头里）
  // 实际 session 在收到首个分片头时建立，这里记录期望
  pendingDownloads.set(msg.contentHash, { path: msg.path, contentHash: msg.contentHash, size: msg.size, lastTime: msg.lastTime })
}
const pendingDownloads = new Map<string, { path: string; contentHash: string; size: number; lastTime?: number }>()

/**
 * 收到二进制分片帧：解析 [前缀][36B sessionId][4B index][data]，按 session 累积，齐了写盘。
 * 注意：下载分片如何与 path 关联依赖服务端实现（可能通过先行的 JSON 元数据消息携带
 * sessionId）。此处实现按 sessionId 聚合；path/size 的关联在联调时对齐。
 */
export async function onBinaryChunk(ctx: FnsCtx, buf: ArrayBuffer): Promise<void> {
  const view = new Uint8Array(buf)
  const prefixLen = FNS_BINARY_PREFIX.length
  const sidBytes = view.subarray(prefixLen, prefixLen + SESSION_ID_BYTES)
  const sessionId = new TextDecoder().decode(sidBytes)
  const dv = new DataView(buf)
  const chunkIndex = dv.getUint32(prefixLen + SESSION_ID_BYTES, false)
  const data = view.subarray(prefixLen + SESSION_ID_BYTES + 4)

  let session = downloadSessions.get(sessionId)
  if (!session) {
    // 取一个待下载登记（简化：取第一个；联调时应由元数据精确匹配）
    const first = pendingDownloads.values().next().value
    if (!first) return
    session = { path: first.path, contentHash: first.contentHash, size: first.size, chunks: new Map(), received: 0, lastTime: first.lastTime }
    downloadSessions.set(sessionId, session)
    pendingDownloads.delete(first.contentHash)
  }
  if (!session.chunks.has(chunkIndex)) {
    session.chunks.set(chunkIndex, new Uint8Array(data))
    session.received += data.length
  }
  if (session.received >= session.size) {
    await assembleAndWrite(ctx, session)
    downloadSessions.delete(sessionId)
  }
}

async function assembleAndWrite(ctx: FnsCtx, session: DownloadSession): Promise<void> {
  const ordered = [...session.chunks.entries()].sort((a, b) => a[0] - b[0]).map(([, d]) => d)
  const totalLen = ordered.reduce((n, d) => n + d.length, 0)
  const merged = new Uint8Array(totalLen)
  let off = 0
  for (const d of ordered) { merged.set(d, off); off += d.length }

  Guard.beginIgnore(session.path)
  try {
    await writeBinaryFile(session.path, merged)
    const s = await statRel(session.path)
    await HM.setHash(ctx.vault, session.path, { contentHash: session.contentHash, mtime: s?.mtime ?? Date.now(), size: merged.length, successful: true })
    refreshFileTree()
    if (session.lastTime) await State.setLastTime(ctx.vault, 'file', session.lastTime)
  } finally {
    Guard.endIgnore(session.path)
    await HM.flush(ctx.vault)
  }
}

// 删除
export async function receiveFileSyncDelete(ctx: FnsCtx, msg: { path: string; lastTime?: number }): Promise<void> {
  Guard.recordSyncDeleted(msg.path)
  await removePath(msg.path)
  await HM.deletePath(ctx.vault, msg.path)
  refreshFileTree()
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'file', msg.lastTime)
  await HM.flush(ctx.vault)
}

export async function deleteFile(ctx: FnsCtx, relPath: string): Promise<void> {
  ctx.send(ACT.FileDelete, { vault: ctx.vault, path: relPath, pathHash: hashPath(relPath) })
  await HM.deletePath(ctx.vault, relPath)
  await HM.flush(ctx.vault)
}
