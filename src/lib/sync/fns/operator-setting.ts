/**
 * 配置模块收发（最小骨架）。
 *
 * note-gen 的配置体系（tauri-store / Zustand）与 Obsidian 的 .obsidian 目录差异较大，
 * 「同步哪些配置项」是开放问题（见计划开放问题）。本期先实现协议层占位：接收下行只推进
 * lastTime，不落地写入；不主动上行配置。待与用户敲定范围后，再把选定配置项序列化为
 * setting 条目（path 用虚拟键，content 为 JSON）。
 */

import * as State from './sync-state'
import type { FnsCtx } from './operator-note'

interface SettingMsg {
  path: string
  content?: string
  lastTime?: number
}

export async function receiveSettingSyncModify(ctx: FnsCtx, msg: SettingMsg): Promise<void> {
  // TODO(范围待定): 落地 note-gen 选定配置项
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'setting', msg.lastTime)
}

export async function receiveSettingSyncDelete(ctx: FnsCtx, msg: SettingMsg): Promise<void> {
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'setting', msg.lastTime)
}

export async function receiveSettingSyncMtime(ctx: FnsCtx, msg: SettingMsg): Promise<void> {
  if (msg.lastTime) await State.setLastTime(ctx.vault, 'setting', msg.lastTime)
}
