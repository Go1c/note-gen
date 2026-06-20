'use client'

/**
 * 错误提示桥：把「自动数据同步」的状态跃迁转成用户可读的 Tips。
 *
 * - 注册导航函数（toast 按钮点击需要 Next.js 路由）。
 * - 订阅 auto-data-sync 状态：仅在 status 跃迁进入 'failed'（重试耗尽）/ 'conflict' 时弹一次，
 *   过程中的 syncing/queued 不弹，避免对瞬时失败骚扰。
 *
 * FNS 鉴权失败由 manager.ts 的 onError 直接调用 showErrorTip('sync.authFailed')，此处不重复处理。
 */

import { useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import { isMobileDevice } from '@/lib/check'
import { subscribeAutoDataSyncState, type AutoDataSyncState } from '@/lib/sync/auto-data-sync-queue'
import { registerTipNavigator, type TipNavTarget } from '@/lib/error-tips/actions'
import { showErrorTip } from '@/lib/error-tips'

export function ErrorTipBridge() {
  const router = useRouter()
  const prevStatus = useRef<AutoDataSyncState['status'] | null>(null)

  useEffect(() => {
    registerTipNavigator((target: TipNavTarget) => {
      const base = isMobileDevice() ? '/mobile/setting/pages/' : '/core/setting/'
      router.push(base + target)
    })
  }, [router])

  useEffect(() => {
    const unsubscribe = subscribeAutoDataSyncState((next) => {
      const prev = prevStatus.current
      prevStatus.current = next.status
      // 首次回调只记录基线，不弹
      if (prev === null || prev === next.status) return
      if (next.status === 'failed') {
        showErrorTip('sync.failedPersistent')
      } else if (next.status === 'conflict') {
        showErrorTip('sync.conflict')
      }
    })
    return unsubscribe
  }, [])

  return null
}
