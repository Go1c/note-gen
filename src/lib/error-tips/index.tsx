/**
 * 错误提示（Tips）分发器。
 *
 * showErrorTip(key)：按当前语言取文案，弹一条带「原因 + 修复建议 + 操作按钮」的 toast，
 * 复用现有 toast 系统（src/hooks/use-toast）。带按 key 的冷却节流，避免同类错误刷屏。
 *
 * classifyError(err)：把原始错误归类到「可操作」的 TipKey；不可操作/纯瞬时失败返回 null
 * （调用方据此决定不弹）。
 */

import { toast } from '@/hooks/use-toast'
import { ToastAction } from '@/components/ui/toast'
import { normalizeLocale, LANGUAGE_STORAGE_KEY } from '@/i18n/config'
import {
  TIP_MESSAGES,
  TIP_ACTION,
  type TipKey,
  type TipActionKind,
} from './messages'
import {
  openSyncSettings,
  openImageHostingSettings,
  openAiSettings,
  refreshFileTreeAction,
  retrySyncAction,
} from './actions'

const TIP_COOLDOWN_MS = 30_000
const TIP_DURATION_MS = 12_000

const lastShownAt = new Map<TipKey, number>()

function currentLocale() {
  const raw = typeof localStorage !== 'undefined' ? localStorage.getItem(LANGUAGE_STORAGE_KEY) : null
  return normalizeLocale(raw)
}

const ACTION_HANDLERS: Record<TipActionKind, () => void> = {
  openSyncSettings,
  openImageHostingSettings,
  openAiSettings,
  refreshFileTree: refreshFileTreeAction,
  retrySync: retrySyncAction,
}

export interface ShowErrorTipOptions {
  /** 跳过节流（用户主动触发的场景，如点击「连接测试」） */
  bypassThrottle?: boolean
}

export function showErrorTip(key: TipKey, opts: ShowErrorTipOptions = {}): void {
  const now = Date.now()
  if (!opts.bypassThrottle) {
    const prev = lastShownAt.get(key)
    if (prev && now - prev < TIP_COOLDOWN_MS) return
  }
  lastShownAt.set(key, now)

  const bundle = TIP_MESSAGES[currentLocale()]
  const text = bundle.tips[key]

  const description = (
    <>
      {text.cause}
      <span style={{ display: 'block', marginTop: 4, opacity: 0.9 }}>
        {bundle.fixLabel + text.fix}
      </span>
    </>
  )

  const actionKind = TIP_ACTION[key]
  const action = actionKind ? (
    <ToastAction altText={bundle.actions[actionKind]} onClick={() => ACTION_HANDLERS[actionKind]()}>
      {bundle.actions[actionKind]}
    </ToastAction>
  ) : undefined

  toast({
    variant: 'destructive',
    title: text.title,
    description,
    action,
    duration: TIP_DURATION_MS,
  })
}

/**
 * 把原始错误归类到可操作的 TipKey。
 * context 用于消歧（'s3' 时网络/权限错误归到图床类）。返回 null 表示不弹提示。
 */
export function classifyError(err: unknown, context?: 's3' | 'sync' | 'ai'): TipKey | null {
  const msg = (err instanceof Error ? err.message : String(err ?? '')).toLowerCase()
  if (!msg) return null

  const isAccessDenied = msg.includes('accessdenied') || msg.includes('access denied') || msg.includes('403')
  const isNetwork = msg.includes('error sending request') || msg.includes('failed to fetch') || msg.includes('networkerror') || msg.includes('timed out') || msg.includes('timeout')
  const isAuth = msg.includes('authorizationfaild') || msg.includes('鉴权') || msg.includes('unauthorized') || msg.includes('token')
  const isAiAuth = msg.includes('401') || msg.includes('invalid api key') || msg.includes('api key') || msg.includes('api_key') || msg.includes('incorrect') || msg.includes('quota') || msg.includes('insufficient')

  if (context === 's3') {
    if (isAccessDenied) return 's3.accessDenied'
    if (isNetwork) return 's3.network'
    return null
  }

  if (context === 'ai') {
    if (isAiAuth || msg.includes('unauthorized')) return 'ai.authFailed'
    if (isNetwork) return 'ai.requestFailed'
    return null
  }

  if (isAuth) return 'sync.authFailed'
  return null
}

export type { TipKey } from './messages'
