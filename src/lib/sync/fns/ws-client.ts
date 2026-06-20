/**
 * fast-note-sync WebSocket 连接封装（基于浏览器原生 WebSocket，运行在 Tauri webview）。
 * 负责：URL 构造、`Action|JSON` 文本帧收发、二进制帧收发、指数退避重连。
 */

import { decodeTextFrame, encodeTextFrame, NON_RECONNECT_REASONS, type ResEnvelope } from './protocol'

const RECONNECT_BASE_DELAY = 1000
const RECONNECT_MAX_DELAY = 30000

export interface WsClientOptions {
  api: string                 // http/https 基址
  apiToken: string
  vault: string
  clientName: string
  clientVersion: string
  clientType: string          // 例 'noteGen'
  lang?: string
  /** 每次连接递增的计数（按 vault 维度持久化），用于服务端区分多次连接 */
  getCount: () => number
  onOpen?: () => void
  onClose?: (code: number, reason: string) => void
  onText?: (action: string, payload: ResEnvelope | null) => void
  onBinary?: (data: ArrayBuffer) => void
  onError?: (err: unknown) => void
}

export class FnsWsClient {
  private ws: WebSocket | null = null
  private opts: WsClientOptions
  private manualClose = false
  private reconnectAttempts = 0
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null

  public isOpen = false
  public isAuth = false

  constructor(opts: WsClientOptions) {
    this.opts = opts
  }

  /** 由 http(s) 基址 + query 构造 ws(s) 同步地址 */
  private buildUrl(): string {
    const base = this.opts.api.replace(/\/+$/, '').replace(/^http/i, 'ws') + '/api/user/sync'
    const qs = new URLSearchParams({
      lang: this.opts.lang || 'zh-CN',
      count: String(this.opts.getCount()),
      client: this.opts.clientType,
      clientName: this.opts.clientName,
      clientVersion: this.opts.clientVersion,
    })
    return `${base}?${qs.toString()}`
  }

  connect(): void {
    this.manualClose = false
    this.clearReconnectTimer()

    let ws: WebSocket
    try {
      ws = new WebSocket(this.buildUrl())
    } catch (err) {
      this.opts.onError?.(err)
      this.scheduleReconnect()
      return
    }
    ws.binaryType = 'arraybuffer'
    this.ws = ws

    ws.addEventListener('open', () => {
      this.isOpen = true
      this.reconnectAttempts = 0
      this.opts.onOpen?.()
    })

    ws.addEventListener('message', (ev) => {
      const data = ev.data
      if (typeof data === 'string') {
        const { action, payload } = decodeTextFrame(data)
        this.opts.onText?.(action, payload)
      } else if (data instanceof ArrayBuffer) {
        this.opts.onBinary?.(data)
      } else if (data instanceof Blob) {
        data.arrayBuffer().then((buf) => this.opts.onBinary?.(buf))
      }
    })

    ws.addEventListener('close', (ev) => {
      this.isOpen = false
      this.isAuth = false
      this.ws = null
      this.opts.onClose?.(ev.code, ev.reason)
      if (!this.manualClose && !NON_RECONNECT_REASONS.has(ev.reason)) {
        this.scheduleReconnect()
      }
    })

    ws.addEventListener('error', (ev) => {
      this.opts.onError?.(ev)
    })
  }

  /** 发送 `Action|JSON` 文本帧 */
  send(action: string, data: unknown): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    this.ws.send(encodeTextFrame(action, data))
    return true
  }

  /** 发送二进制帧（已含前缀+帧头的完整 Uint8Array） */
  sendBinary(frame: Uint8Array): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false
    // copy 到底层 ArrayBuffer，避免 SharedArrayBuffer 类型问题
    this.ws.send(frame.buffer.slice(frame.byteOffset, frame.byteOffset + frame.byteLength))
    return true
  }

  /** 当前发送缓冲区字节数（用于判定同步是否真正发完） */
  get bufferedAmount(): number {
    return this.ws?.bufferedAmount ?? 0
  }

  close(): void {
    this.manualClose = true
    this.clearReconnectTimer()
    this.ws?.close(1000, 'ClientClose')
    this.ws = null
    this.isOpen = false
    this.isAuth = false
  }

  private scheduleReconnect(): void {
    this.clearReconnectTimer()
    const delay = Math.min(RECONNECT_BASE_DELAY * 2 ** this.reconnectAttempts, RECONNECT_MAX_DELAY)
    this.reconnectAttempts++
    this.reconnectTimer = setTimeout(() => this.connect(), delay)
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer)
      this.reconnectTimer = null
    }
  }
}
