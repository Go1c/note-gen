/**
 * fast-note-sync WebSocket 协议定义。
 *
 * 消息封装：文本帧 `Action|JSON`，例 `Authorization|"<token>"`、`NoteSync|{...}`。
 * 已实测服务端默认回 JSON 文本帧（无需 protobuf）。
 * 参考：fast-note-sync-service/docs/ws_api.md、SyncProtocol.md、websocket_integration.md。
 */

// ============ Action 常量 ============

// 基础控制
export const ACT = {
  Authorization: 'Authorization',
  ClientInfo: 'ClientInfo',

  // 笔记 C->S
  NoteSync: 'NoteSync',
  NoteModify: 'NoteModify',
  NoteDelete: 'NoteDelete',
  NoteRename: 'NoteRename',
  NoteCheck: 'NoteCheck',
  NoteRePush: 'NoteRePush',
  // 笔记 S->C
  NoteSyncModify: 'NoteSyncModify',
  NoteSyncDelete: 'NoteSyncDelete',
  NoteSyncRename: 'NoteSyncRename',
  NoteSyncMtime: 'NoteSyncMtime',
  NoteSyncNeedPush: 'NoteSyncNeedPush',
  NoteSyncEnd: 'NoteSyncEnd',
  NoteModifyAck: 'NoteModifyAck',
  NoteDeleteAck: 'NoteDeleteAck',
  NoteRenameAck: 'NoteRenameAck',

  // 文件夹 C->S
  FolderSync: 'FolderSync',
  FolderModify: 'FolderModify',
  FolderDelete: 'FolderDelete',
  FolderRename: 'FolderRename',
  // 文件夹 S->C
  FolderSyncModify: 'FolderSyncModify',
  FolderSyncDelete: 'FolderSyncDelete',
  FolderSyncRename: 'FolderSyncRename',
  FolderSyncEnd: 'FolderSyncEnd',

  // 附件 C->S
  FileSync: 'FileSync',
  FileUploadCheck: 'FileUploadCheck',
  FileDelete: 'FileDelete',
  FileRename: 'FileRename',
  FileChunkDownload: 'FileChunkDownload',
  // 附件 S->C
  FileSyncUpdate: 'FileSyncUpdate',
  FileSyncDelete: 'FileSyncDelete',
  FileSyncRename: 'FileSyncRename',
  FileSyncMtime: 'FileSyncMtime',
  FileUpload: 'FileUpload',
  FileSyncEnd: 'FileSyncEnd',

  // 设置 C->S
  SettingSync: 'SettingSync',
  SettingModify: 'SettingModify',
  SettingDelete: 'SettingDelete',
  // 设置 S->C
  SettingSyncModify: 'SettingSyncModify',
  SettingSyncDelete: 'SettingSyncDelete',
  SettingSyncMtime: 'SettingSyncMtime',
  SettingSyncNeedUpload: 'SettingSyncNeedUpload',
  SettingSyncEnd: 'SettingSyncEnd',
} as const

export type ActionName = (typeof ACT)[keyof typeof ACT] | string

// ============ 业务状态码 ============

export const CODE = {
  Success: 1,
  SuccessNoUpdate: 6,
  InvalidParams: 305,
  NotLoggedIn: 307,
  AuthExpired: 308,
  NoteModifyFailed: 433,
  NoteConflict: 441,
  FileUploadSessionNotFound: 463,
  SyncConflict: 490,
} as const

/** 鉴权失败 / token 失效的关闭原因或码（不应自动重连） */
export const NON_RECONNECT_REASONS = new Set([
  'AuthorizationFaild',
  'ClientClose',
  'kicked by admin',
  'TokenRotatedOrRevoked',
  'broadcast failed',
])

// ============ 二进制帧 ============

/** 二进制分片帧头：36 字节 SessionID + 4 字节 uint32(大端) ChunkIndex，之后为数据 */
export const BINARY_HEADER_BYTES = 40
export const SESSION_ID_BYTES = 36

// ============ 响应外壳 ============

export interface ResEnvelope<T = unknown> {
  code: number
  status: boolean
  message: string
  data?: T
  details?: string
  vault?: string
  context?: string
}

/** *SyncEnd 统计 + 队列消息 */
export interface SyncEndData {
  lastTime: number
  needUploadCount?: number
  needModifyCount?: number
  needSyncMtimeCount?: number
  needDeleteCount?: number
  messages?: QueuedMessage[]
}

export interface QueuedMessage {
  action: string
  data: unknown
}

// ============ 同步清单项（上行） ============

export interface NoteSnapshot {
  path: string
  pathHash: string
  contentHash: string
  mtime: number          // 毫秒
  ctime?: number
  size?: number
  baseHash?: string
  baseHashMissing?: boolean
}

export interface FileSnapshot {
  path: string
  pathHash: string
  contentHash: string
  size: number
  mtime: number
  ctime?: number
  baseHash?: string
}

export interface FolderSnapshot {
  path: string
  pathHash: string
}

export interface PathHashRef {
  path: string
  pathHash: string
}

// ============ 同步请求（C->S） ============

export interface NoteSyncRequest {
  vault: string
  lastTime: number
  notes: NoteSnapshot[]
  delNotes?: PathHashRef[]
  missingNotes?: PathHashRef[]
  context: string
}

export interface FileSyncRequest {
  vault: string
  lastTime: number
  files: FileSnapshot[]
  context: string
}

export interface FolderSyncRequest {
  vault: string
  lastTime: number
  folders: FolderSnapshot[]
  context: string
}

export interface SettingSyncRequest {
  vault: string
  lastTime: number
  settings: NoteSnapshot[]
  cover?: boolean
  context: string
}

// ============ 上行修改/删除/重命名 ============

export interface NoteModifyRequest {
  vault: string
  path: string
  pathHash: string
  content: string
  contentHash: string
  baseHash?: string
  ctime: number          // 秒
  mtime: number          // 秒
  createOnly?: boolean
  context?: string
}

export interface NoteDeleteRequest {
  vault: string
  path: string
  pathHash: string
  context?: string
}

export interface NoteRenameRequest {
  vault: string
  path: string
  pathHash: string
  oldPath: string
  oldPathHash: string
  context?: string
}

// ============ 下行明细消息（S->C，messages[i].data 或独立推送） ============

export interface NoteSyncModifyMessage {
  path: string
  pathHash?: string
  content: string
  contentHash: string
  ctime?: number
  mtime?: number
  lastTime?: number
}

export interface NoteSyncDeleteMessage {
  path: string
  pathHash?: string
  lastTime?: number
}

export interface NoteSyncRenameMessage {
  path: string
  pathHash?: string
  oldPath: string
  oldPathHash?: string
  lastTime?: number
}

export interface NoteSyncMtimeMessage {
  path: string
  ctime?: number
  mtime?: number
  lastTime?: number
}

export interface NoteSyncNeedPushMessage {
  path: string
}

// 附件下行
export interface FileSyncUpdateMessage {
  path: string
  pathHash?: string
  contentHash: string
  size: number
  ctime?: number
  mtime?: number
  lastTime?: number
}

export interface FileUploadMessage {
  path: string
  sessionId: string
  chunkSize: number
}

// ============ ClientInfo ============

export interface ClientInfoRequest {
  name: string
  version: string
  type: string
  offlineSyncStrategy?: 'newTimeMerge' | 'ignoreTimeMerge'
}

// ============ 工具：编解码文本帧 ============

/** 把 `Action|JSON` 文本帧拆成 action 与已解析的 payload */
export function decodeTextFrame(raw: string): { action: string; payload: ResEnvelope | null } {
  const idx = raw.indexOf('|')
  if (idx === -1) {
    return { action: raw, payload: null }
  }
  const action = raw.slice(0, idx)
  const jsonStr = raw.slice(idx + 1)
  try {
    return { action, payload: JSON.parse(jsonStr) as ResEnvelope }
  } catch {
    return { action, payload: null }
  }
}

/**
 * 编码为 `Action|payload` 文本帧。
 * 关键：与服务端/插件 sendTextFallback 对齐——payload 为字符串时**直接拼接**（如
 * Authorization 的 token），不可 JSON.stringify（加引号会导致服务端解析失败 → 鉴权失效）；
 * 非字符串才 JSON 序列化。
 */
export function encodeTextFrame(action: string, data: unknown): string {
  const payload = typeof data === 'string' ? data : JSON.stringify(data)
  return action + '|' + payload
}
