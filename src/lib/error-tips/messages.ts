/**
 * 错误提示（Tips）文案表与分类映射。
 *
 * 只覆盖「可操作」的错误：鉴权失效、同步持续失败、冲突、S3 凭证/权限、S3 网络、
 * 云端已删/未下载文件、AI 请求失败/鉴权。纯瞬时网络抖动（会自动重试的单次失败）不在此列、不弹提示。
 *
 * 纯静态对象（参照 src/lib/agent/i18n.ts），可在非 React 模块中直接取用。
 * locale 取值与 src/i18n/config.ts 的 SupportedLocale 对齐（en/zh/ja/pt-BR/zh-TW）。
 */

import type { SupportedLocale } from '@/i18n/config'

export type TipKey =
  | 'sync.authFailed'
  | 'sync.failedPersistent'
  | 'sync.conflict'
  | 's3.accessDenied'
  | 's3.network'
  | 'file.missingLocal'
  | 'ai.requestFailed'
  | 'ai.authFailed'

export type TipActionKind =
  | 'openSyncSettings'
  | 'openImageHostingSettings'
  | 'openAiSettings'
  | 'refreshFileTree'
  | 'retrySync'

/** 每个 tip 对应的操作按钮（null 表示无按钮） */
export const TIP_ACTION: Record<TipKey, TipActionKind | null> = {
  'sync.authFailed': 'openSyncSettings',
  'sync.failedPersistent': 'retrySync',
  'sync.conflict': 'openSyncSettings',
  's3.accessDenied': 'openImageHostingSettings',
  's3.network': 'openImageHostingSettings',
  'file.missingLocal': 'refreshFileTree',
  'ai.requestFailed': 'openAiSettings',
  'ai.authFailed': 'openAiSettings',
}

interface TipText {
  title: string
  cause: string
  fix: string
}

interface LocaleBundle {
  fixLabel: string
  actions: Record<TipActionKind, string>
  tips: Record<TipKey, TipText>
}

export const TIP_MESSAGES: Record<SupportedLocale, LocaleBundle> = {
  en: {
    fixLabel: 'Fix: ',
    actions: {
      openSyncSettings: 'Open Sync Settings',
      openImageHostingSettings: 'Open Image Hosting Settings',
      openAiSettings: 'Open AI Settings',
      refreshFileTree: 'Refresh File Tree',
      retrySync: 'Retry',
    },
    tips: {
      'sync.authFailed': {
        title: 'Sync authentication failed',
        cause: 'The sync service token is invalid or has expired.',
        fix: 'Update the token in Sync settings and reconnect.',
      },
      'sync.failedPersistent': {
        title: 'Sync keeps failing',
        cause: "Couldn't reach the sync service after several retries (network, proxy, or server down).",
        fix: 'Check your network and proxy, or click Retry.',
      },
      'sync.conflict': {
        title: 'Sync conflict',
        cause: 'The same data was changed on multiple devices.',
        fix: 'Resolve it in Sync settings by merging or choosing a side.',
      },
      's3.accessDenied': {
        title: 'Image host access denied',
        cause: "S3 credentials, bucket, or region don't match, or permissions are insufficient.",
        fix: 'Verify AccessKey / Secret / Bucket / Region and bucket permissions in Image Hosting settings.',
      },
      's3.network': {
        title: 'Image host unreachable',
        cause: "Couldn't connect to the S3 endpoint (network, proxy, or endpoint config).",
        fix: 'Check Endpoint, Region, and proxy settings, then retry.',
      },
      'file.missingLocal': {
        title: 'File not found',
        cause: "This file was deleted in the cloud, or hasn't been downloaded locally yet.",
        fix: 'Refresh the file tree; re-sync if you still need it.',
      },
      'ai.requestFailed': {
        title: 'AI request failed',
        cause: "Couldn't reach the AI service (network, proxy, or API base URL).",
        fix: 'Check your network, proxy, and API base URL, then retry.',
      },
      'ai.authFailed': {
        title: 'AI authentication failed',
        cause: 'The API key is invalid, expired, or out of quota.',
        fix: 'Check your API key and quota in AI settings.',
      },
    },
  },
  zh: {
    fixLabel: '修复建议：',
    actions: {
      openSyncSettings: '打开同步设置',
      openImageHostingSettings: '打开图床设置',
      openAiSettings: '打开 AI 设置',
      refreshFileTree: '刷新文件树',
      retrySync: '重试',
    },
    tips: {
      'sync.authFailed': {
        title: '同步鉴权失败',
        cause: '同步服务的 token 无效或已过期。',
        fix: '请在同步设置中更新 token 后重新连接。',
      },
      'sync.failedPersistent': {
        title: '同步多次失败',
        cause: '多次尝试后仍无法连接同步服务（网络、代理或服务端不可用）。',
        fix: '检查网络与代理设置，或稍后点击重试。',
      },
      'sync.conflict': {
        title: '同步存在冲突',
        cause: '本地与云端在多台设备上发生了冲突修改。',
        fix: '在同步设置中选择合并或以某一端为准。',
      },
      's3.accessDenied': {
        title: '图床访问被拒绝',
        cause: 'S3 凭证、Bucket 或 Region 不匹配，或对象/桶权限不足。',
        fix: '在图床设置中核对 AccessKey / Secret / Bucket / Region 与桶权限。',
      },
      's3.network': {
        title: '图床连接失败',
        cause: '无法连接到 S3 端点（网络、代理或 Endpoint 配置问题）。',
        fix: '检查 Endpoint、Region 与代理设置后重试。',
      },
      'file.missingLocal': {
        title: '文件不存在',
        cause: '该文件在云端已被删除，或尚未下载到本地。',
        fix: '刷新文件树；如仍需要可重新触发同步。',
      },
      'ai.requestFailed': {
        title: 'AI 请求失败',
        cause: '无法连接到 AI 服务（网络、代理或 API 地址问题）。',
        fix: '检查网络、代理与 API 地址（Base URL）后重试。',
      },
      'ai.authFailed': {
        title: 'AI 鉴权失败',
        cause: 'API Key 无效、已过期或额度不足。',
        fix: '在 AI 设置中检查 API Key 与额度。',
      },
    },
  },
  ja: {
    fixLabel: '対処法：',
    actions: {
      openSyncSettings: '同期設定を開く',
      openImageHostingSettings: '画像ホスティング設定を開く',
      openAiSettings: 'AI 設定を開く',
      refreshFileTree: 'ファイルツリーを更新',
      retrySync: '再試行',
    },
    tips: {
      'sync.authFailed': {
        title: '同期の認証に失敗',
        cause: '同期サービスのトークンが無効または期限切れです。',
        fix: '同期設定でトークンを更新して再接続してください。',
      },
      'sync.failedPersistent': {
        title: '同期に繰り返し失敗',
        cause: '数回の再試行後も同期サービスに接続できません（ネットワーク・プロキシ・サーバー停止）。',
        fix: 'ネットワークとプロキシを確認するか、再試行してください。',
      },
      'sync.conflict': {
        title: '同期の競合',
        cause: '複数の端末で同じデータが変更されました。',
        fix: '同期設定で統合するか、一方を優先してください。',
      },
      's3.accessDenied': {
        title: '画像ホストへのアクセス拒否',
        cause: 'S3 の認証情報・バケット・リージョンが一致しないか、権限が不足しています。',
        fix: '画像ホスティング設定で AccessKey / Secret / Bucket / Region と権限を確認してください。',
      },
      's3.network': {
        title: '画像ホストに接続できません',
        cause: 'S3 エンドポイントに接続できませんでした（ネットワーク・プロキシ・設定）。',
        fix: 'Endpoint・Region・プロキシ設定を確認して再試行してください。',
      },
      'file.missingLocal': {
        title: 'ファイルが見つかりません',
        cause: 'このファイルはクラウドで削除されたか、まだローカルにダウンロードされていません。',
        fix: 'ファイルツリーを更新してください。必要なら再同期します。',
      },
      'ai.requestFailed': {
        title: 'AI リクエスト失敗',
        cause: 'AI サービスに接続できません（ネットワーク・プロキシ・API アドレス）。',
        fix: 'ネットワーク・プロキシ・API のベース URL を確認して再試行してください。',
      },
      'ai.authFailed': {
        title: 'AI 認証に失敗',
        cause: 'API キーが無効・期限切れ、または残量不足です。',
        fix: 'AI 設定で API キーと残量を確認してください。',
      },
    },
  },
  'pt-BR': {
    fixLabel: 'Correção: ',
    actions: {
      openSyncSettings: 'Abrir configurações de sincronização',
      openImageHostingSettings: 'Abrir configurações de host de imagens',
      openAiSettings: 'Abrir configurações de IA',
      refreshFileTree: 'Atualizar árvore de arquivos',
      retrySync: 'Repetir',
    },
    tips: {
      'sync.authFailed': {
        title: 'Falha na autenticação de sincronização',
        cause: 'O token do serviço de sincronização é inválido ou expirou.',
        fix: 'Atualize o token nas configurações de sincronização e reconecte.',
      },
      'sync.failedPersistent': {
        title: 'Sincronização falhando',
        cause: 'Não foi possível acessar o serviço após várias tentativas (rede, proxy ou servidor fora do ar).',
        fix: 'Verifique sua rede e proxy, ou clique em Repetir.',
      },
      'sync.conflict': {
        title: 'Conflito de sincronização',
        cause: 'Os mesmos dados foram alterados em vários dispositivos.',
        fix: 'Resolva nas configurações de sincronização mesclando ou escolhendo um lado.',
      },
      's3.accessDenied': {
        title: 'Acesso ao host de imagens negado',
        cause: 'Credenciais, bucket ou região do S3 não conferem, ou as permissões são insuficientes.',
        fix: 'Verifique AccessKey / Secret / Bucket / Region e as permissões nas configurações.',
      },
      's3.network': {
        title: 'Host de imagens inacessível',
        cause: 'Não foi possível conectar ao endpoint S3 (rede, proxy ou configuração).',
        fix: 'Verifique Endpoint, Region e proxy e tente novamente.',
      },
      'file.missingLocal': {
        title: 'Arquivo não encontrado',
        cause: 'Este arquivo foi excluído na nuvem ou ainda não foi baixado localmente.',
        fix: 'Atualize a árvore de arquivos; sincronize novamente se necessário.',
      },
      'ai.requestFailed': {
        title: 'Falha na requisição de IA',
        cause: 'Não foi possível acessar o serviço de IA (rede, proxy ou URL base da API).',
        fix: 'Verifique rede, proxy e a URL base da API e tente novamente.',
      },
      'ai.authFailed': {
        title: 'Falha na autenticação de IA',
        cause: 'A chave de API é inválida, expirou ou está sem cota.',
        fix: 'Verifique a chave de API e a cota nas configurações de IA.',
      },
    },
  },
  'zh-TW': {
    fixLabel: '修復建議：',
    actions: {
      openSyncSettings: '開啟同步設定',
      openImageHostingSettings: '開啟圖床設定',
      openAiSettings: '開啟 AI 設定',
      refreshFileTree: '重新整理檔案樹',
      retrySync: '重試',
    },
    tips: {
      'sync.authFailed': {
        title: '同步驗證失敗',
        cause: '同步服務的 token 無效或已過期。',
        fix: '請在同步設定中更新 token 後重新連線。',
      },
      'sync.failedPersistent': {
        title: '同步多次失敗',
        cause: '多次嘗試後仍無法連線同步服務（網路、代理或伺服器無法使用）。',
        fix: '檢查網路與代理設定，或稍後點擊重試。',
      },
      'sync.conflict': {
        title: '同步發生衝突',
        cause: '本機與雲端在多台裝置上發生了衝突修改。',
        fix: '在同步設定中選擇合併或以某一端為準。',
      },
      's3.accessDenied': {
        title: '圖床存取被拒',
        cause: 'S3 憑證、Bucket 或 Region 不相符，或物件/桶權限不足。',
        fix: '在圖床設定中核對 AccessKey / Secret / Bucket / Region 與桶權限。',
      },
      's3.network': {
        title: '圖床連線失敗',
        cause: '無法連線到 S3 端點（網路、代理或 Endpoint 設定問題）。',
        fix: '檢查 Endpoint、Region 與代理設定後重試。',
      },
      'file.missingLocal': {
        title: '檔案不存在',
        cause: '該檔案在雲端已被刪除，或尚未下載到本機。',
        fix: '重新整理檔案樹；如仍需要可重新觸發同步。',
      },
      'ai.requestFailed': {
        title: 'AI 請求失敗',
        cause: '無法連線到 AI 服務（網路、代理或 API 位址問題）。',
        fix: '檢查網路、代理與 API 位址（Base URL）後重試。',
      },
      'ai.authFailed': {
        title: 'AI 驗證失敗',
        cause: 'API Key 無效、已過期或額度不足。',
        fix: '在 AI 設定中檢查 API Key 與額度。',
      },
    },
  },
}
