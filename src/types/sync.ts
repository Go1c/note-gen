export type SyncPlatform = 'github' | 'gitee' | 'gitlab' | 'gitea' | 's3' | 'webdav' | 'fast-note-sync'

export type SyncPlatformType = {
  platform: SyncPlatform
  name: string
  icon: string
}

export const SYNC_PLATFORMS: SyncPlatform[] = ['github', 'gitee', 'gitlab', 'gitea', 's3', 'webdav', 'fast-note-sync']

export const SYNC_PLATFORM_INFO: Record<SyncPlatform, SyncPlatformType> = {
  github: { platform: 'github', name: 'Github', icon: 'github' },
  gitee: { platform: 'gitee', name: 'Gitee', icon: 'gitee' },
  gitlab: { platform: 'gitlab', name: 'GitLab', icon: 'gitlab' },
  gitea: { platform: 'gitea', name: 'Gitea', icon: 'gitea' },
  s3: { platform: 's3', name: 'S3', icon: 's3' },
  webdav: { platform: 'webdav', name: 'WebDAV', icon: 'webdav' },
  'fast-note-sync': { platform: 'fast-note-sync', name: 'Fast Note Sync', icon: 'fast-note-sync' },
}

/**
 * fast-note-sync 自建服务配置（粘贴 web 面板生成的 JSON）
 * 例：{ "api": "https://fast-note.zeabur.app", "apiToken": "<JWT>", "vault": "Lumio" }
 */
export interface FastNoteSyncConfig {
  api: string        // 服务端基址（http/https），WS 时换成 ws/wss
  apiToken: string   // JWT 鉴权 token
  vault: string      // 仓库名
  /**
   * 客户端标识（WS 握手时作为 `client` 参数）。服务端会按 token 的 scope `c:` 校验。
   * 默认 'noteGen'；若 token 的 scope 限定了客户端（如 obsidian），需改成匹配值
   * （例如 'ObsidianPlugin'）。
   */
  client?: string
}

/** fast-note-sync 配置在 store.json 中的键 */
export const FNS_CONFIG_KEY = 'fnsSyncConfig'

export interface S3Config {
  accessKeyId: string
  secretAccessKey: string
  region: string
  bucket: string
  endpoint: string
  pathPrefix: string
  customDomain?: string
}

export interface WebDAVConfig {
  url: string
  username: string
  password: string
  pathPrefix: string
}
