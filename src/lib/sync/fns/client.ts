/**
 * FnsClient：fast-note-sync 连接中枢。
 * 负责鉴权、ClientInfo、把下行消息分派到各 operator、二进制分片路由、冲突提示。
 *
 * 下行有两条路径，都要处理：
 *  1. 独立推送帧（其它设备的实时改动）：action='NoteSyncModify' 等，payload.data 为明细。
 *  2. *SyncEnd 内嵌 messages[]（全量对账结果）：逐条取 {action,data} 走同一套明细处理。
 */

import { FnsWsClient } from './ws-client'
import {
  ACT, CODE, type ResEnvelope, type SyncEndData,
} from './protocol'
import type { FastNoteSyncConfig } from '@/types/sync'
import { nextConnectCount, enableWatch, disableWatch } from './sync-state'
import { resetGuards } from './loop-guard'
import * as Note from './operator-note'
import * as Folder from './operator-folder'
import * as File from './operator-file'
import * as Setting from './operator-setting'
import type { FnsCtx } from './operator-note'
import { toast } from '@/hooks/use-toast'

const CLIENT_TYPE = 'noteGen'
const CLIENT_VERSION = '0.0.1'

export interface FnsClientCallbacks {
  onStatusChange?: (connected: boolean, authed: boolean) => void
  onReady?: (client: FnsClient) => void   // 鉴权 + ClientInfo 成功后（触发全量对账）
  onError?: (message: string) => void
}

export class FnsClient {
  private ws: FnsWsClient | null = null
  private cfg: FastNoteSyncConfig
  private cbs: FnsClientCallbacks
  public ctx: FnsCtx
  public authed = false

  constructor(cfg: FastNoteSyncConfig, cbs: FnsClientCallbacks = {}) {
    this.cfg = cfg
    this.cbs = cbs
    this.ctx = {
      vault: cfg.vault,
      send: (action, data) => this.ws?.send(action, data) ?? false,
    }
  }

  get vault(): string {
    return this.cfg.vault
  }

  get isConnected(): boolean {
    return this.ws?.isOpen ?? false
  }

  /** 发送二进制帧（附件分片） */
  sendBinary = (frame: Uint8Array): boolean => this.ws?.sendBinary(frame) ?? false

  async connect(): Promise<void> {
    const count = await nextConnectCount(this.cfg.vault)
    this.ws = new FnsWsClient({
      api: this.cfg.api,
      apiToken: this.cfg.apiToken,
      vault: this.cfg.vault,
      clientName: 'NoteGen',
      clientVersion: CLIENT_VERSION,
      clientType: this.cfg.client || CLIENT_TYPE,
      getCount: () => count,
      onOpen: () => {
        // 鉴权 → ClientInfo
        this.ws?.send(ACT.Authorization, this.cfg.apiToken)
        this.ws?.send(ACT.ClientInfo, {
          name: 'NoteGen',
          version: CLIENT_VERSION,
          type: CLIENT_TYPE,
          offlineSyncStrategy: 'newTimeMerge',
        })
        this.cbs.onStatusChange?.(true, this.authed)
      },
      onClose: (code, reason) => {
        this.authed = false
        resetGuards()
        enableWatch()
        this.cbs.onStatusChange?.(false, false)
        if (reason === 'AuthorizationFaild') {
          this.cbs.onError?.('鉴权失败，请检查 token 是否有效')
        }
      },
      onText: (action, payload) => { void this.onText(action, payload) },
      onBinary: (buf) => { void File.onBinaryChunk(this.ctx, buf) },
      onError: (err) => { this.cbs.onError?.(String((err as Error)?.message ?? err)) },
    })
    this.ws.connect()
  }

  disconnect(): void {
    this.ws?.close()
    this.ws = null
    this.authed = false
    resetGuards()
  }

  // ============ 文本帧处理 ============

  private async onText(action: string, payload: ResEnvelope | null): Promise<void> {
    if (!payload) return

    // 控制消息
    if (action === ACT.Authorization) {
      if (payload.code === CODE.Success || payload.status) {
        this.authed = true
        this.cbs.onStatusChange?.(true, true)
      } else {
        this.authed = false
        this.cbs.onError?.(payload.message || '鉴权失败')
      }
      return
    }
    if (action === ACT.ClientInfo) {
      // 鉴权通过且声明完设备 → 触发全量对账
      if (this.authed) this.cbs.onReady?.(this)
      return
    }

    // 冲突提示
    if (payload.code === CODE.NoteConflict || payload.code === CODE.SyncConflict) {
      const p = (payload.data as { path?: string })?.path
      toast({ title: '同步冲突', description: p ? `文件 ${p} 发生冲突，已采用服务端版本（可从笔记历史恢复）` : payload.message, variant: 'destructive' })
      // 继续按明细处理（服务端通常随后下推其版本）
    }

    // *SyncEnd：推进 lastTime + 消费内嵌 messages
    if (action.endsWith('SyncEnd')) {
      const data = payload.data as SyncEndData | undefined
      if (data?.messages?.length) {
        for (const m of data.messages) await this.dispatchDetail(m.action, m.data)
      }
      return
    }

    // ack
    if (action === ACT.NoteModifyAck || action === ACT.NoteDeleteAck || action === ACT.NoteRenameAck) {
      await Note.receiveNoteModifyAck(this.ctx, (payload.data ?? {}) as { path: string; contentHash?: string; lastTime?: number })
      return
    }

    // 明细推送（独立帧）
    await this.dispatchDetail(action, payload.data)
  }

  /** 单条明细动作分派（独立帧与 SyncEnd.messages 共用） */
  private async dispatchDetail(action: string, data: unknown): Promise<void> {
    try {
      switch (action) {
        // 笔记
        case ACT.NoteSyncModify: return await Note.receiveNoteSyncModify(this.ctx, data as never)
        case ACT.NoteSyncDelete: return await Note.receiveNoteSyncDelete(this.ctx, data as never)
        case ACT.NoteSyncRename: return await Note.receiveNoteSyncRename(this.ctx, data as never)
        case ACT.NoteSyncMtime: return await Note.receiveNoteSyncMtime(this.ctx, data as never)
        case ACT.NoteSyncNeedPush: return await Note.receiveNoteSyncNeedPush(this.ctx, data as never)
        // 文件夹
        case ACT.FolderSyncModify: return await Folder.receiveFolderSyncModify(this.ctx, data as never)
        case ACT.FolderSyncDelete: return await Folder.receiveFolderSyncDelete(this.ctx, data as never)
        case ACT.FolderSyncRename: return await Folder.receiveFolderSyncRename(this.ctx, data as never)
        // 附件
        case ACT.FileSyncUpdate: return await File.receiveFileSyncUpdate(this.ctx, data as never)
        case ACT.FileSyncDelete: return await File.receiveFileSyncDelete(this.ctx, data as never)
        case ACT.FileUpload: return await File.receiveFileUpload(this.ctx, data as never, this.sendBinary)
        // 设置
        case ACT.SettingSyncModify: return await Setting.receiveSettingSyncModify(this.ctx, data as never)
        case ACT.SettingSyncDelete: return await Setting.receiveSettingSyncDelete(this.ctx, data as never)
        case ACT.SettingSyncMtime: return await Setting.receiveSettingSyncMtime(this.ctx, data as never)
        default:
          // 未识别动作，忽略
          return
      }
    } catch (err) {
      console.error(`[fns] dispatch ${action} failed:`, err)
    }
  }

  // 供 orchestrator 在对账期间控制 watch
  beginFullSync(): void { disableWatch() }
  endFullSync(): void { enableWatch() }
}
