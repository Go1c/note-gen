/**
 * 错误提示按钮的操作回调。
 *
 * 导航需要 Next.js 路由（仅在 React 组件内可用），因此由已挂载的 ErrorTipBridge
 * 在 mount 时通过 registerTipNavigator 注入一个导航函数；纯 TS 处只调用注入的函数。
 * 其余操作（刷新文件树、重试同步）用动态 import 懒加载，避免拖入同步模块的初始化成本。
 */

export type TipNavTarget = 'sync' | 'imageHosting' | 'ai'

let navigator: ((target: TipNavTarget) => void) | null = null

/** 由 ErrorTipBridge 在 mount 时注册（持有 useRouter） */
export function registerTipNavigator(fn: (target: TipNavTarget) => void): void {
  navigator = fn
}

export function openSyncSettings(): void {
  navigator?.('sync')
}

export function openImageHostingSettings(): void {
  navigator?.('imageHosting')
}

export function openAiSettings(): void {
  navigator?.('ai')
}

export function refreshFileTreeAction(): void {
  void import('@/lib/sync/fns/fs-utils').then((m) => m.refreshFileTree())
}

export function retrySyncAction(): void {
  void import('@/lib/sync/auto-data-sync-queue').then((m) => m.retryAutoDataSync())
}
