/**
 * 通用「数据文件」同步：把一个 JSON 字符串同步到各 provider 的 `.data/<filename>`。
 *
 * 抽取自 mark store 的 provider 分支（github/gitee/gitlab/gitea/s3/webdav/fast-note-sync），
 * 供 records 以外的数据域（如 memories）复用，避免重复一大段 provider switch。
 */

import { Store } from '@tauri-apps/plugin-store'
import { uploadFile as uploadGithubFile, getFiles as githubGetFiles, decodeBase64ToString } from '@/lib/sync/github'
import { uploadFile as uploadGiteeFile, getFiles as giteeGetFiles } from '@/lib/sync/gitee'
import { uploadFile as uploadGitlabFile, getFiles as gitlabGetFiles, getFileContent as gitlabGetFileContent } from '@/lib/sync/gitlab'
import { uploadFile as uploadGiteaFile, getFiles as giteaGetFiles, getFileContent as giteaGetFileContent } from '@/lib/sync/gitea'
import { s3Upload, s3Delete, s3HeadObject, s3Download } from '@/lib/sync/s3'
import { webdavUpload, webdavDelete, webdavHeadObject, webdavDownload } from '@/lib/sync/webdav'
import { getSyncRepoName } from '@/lib/sync/repo-utils'
import { getRemoteFileContent, hasEmptyRemoteFileContent, isMissingRemoteFileError } from '@/lib/sync/remote-file'
import type { S3Config, WebDAVConfig } from '@/types/sync'

const DATA_PATH = '.data'

export interface DataFileDownloadOptions {
  allowMissingRemote?: boolean
}

type ShaCarrier = { sha?: string; name?: string }

/** 上传 JSON 内容到 `.data/<filename>`，返回是否成功 */
export async function uploadDataFile(filename: string, content: string): Promise<boolean> {
  const store = await Store.load('store.json')
  const primaryBackupMethod = await store.get<string>('primaryBackupMethod') || 'github'
  const fullPath = `${DATA_PATH}/${filename}`
  let res: unknown
  try {
    switch (primaryBackupMethod) {
      case 'github': {
        const repo = await getSyncRepoName('github')
        const files = await githubGetFiles({ path: fullPath, repo }) as ShaCarrier | undefined
        res = await uploadGithubFile({ file: content, repo, path: fullPath, sha: files?.sha })
        break
      }
      case 'gitee': {
        const repo = await getSyncRepoName('gitee')
        try {
          const files = await giteeGetFiles({ path: fullPath, repo }) as ShaCarrier | undefined
          res = await uploadGiteeFile({ file: content, repo, path: fullPath, sha: files?.sha })
        } catch (err) {
          console.error('[data-file-sync] Gitee upload error:', err)
        }
        break
      }
      case 'gitlab': {
        const repo = await getSyncRepoName('gitlab')
        let files: unknown
        try { files = await gitlabGetFiles({ path: DATA_PATH, repo }) } catch (e) { console.error('[data-file-sync] GitLab getFiles error:', e) }
        if (!files) {
          try { await uploadGitlabFile({ file: '', repo, path: DATA_PATH, filename: '.gitkeep', sha: '' }) } catch { /* ignore */ }
          files = await gitlabGetFiles({ path: DATA_PATH, repo })
        }
        const target = Array.isArray(files)
          ? (files as ShaCarrier[]).find((f) => f.name === filename)
          : ((files as ShaCarrier | undefined)?.name === filename ? files as ShaCarrier : undefined)
        try {
          res = await uploadGitlabFile({ file: content, repo, path: DATA_PATH, filename, sha: target?.sha || '' })
        } catch (e) { console.error('[data-file-sync] GitLab uploadFile error:', e) }
        break
      }
      case 'gitea': {
        const repo = await getSyncRepoName('gitea')
        const files = await giteaGetFiles({ path: DATA_PATH, repo })
        const target = Array.isArray(files)
          ? (files as ShaCarrier[]).find((f) => f.name === filename)
          : ((files as ShaCarrier | undefined)?.name === filename ? files as ShaCarrier : undefined)
        res = await uploadGiteaFile({ file: content, repo, path: DATA_PATH, filename, sha: target?.sha || '' })
        break
      }
      case 's3': {
        const cfg = await store.get<S3Config>('s3SyncConfig')
        if (cfg) {
          if (await s3HeadObject(cfg, fullPath)) await s3Delete(cfg, fullPath)
          res = await s3Upload(cfg, fullPath, content)
        }
        break
      }
      case 'webdav': {
        const cfg = await store.get<WebDAVConfig>('webdavSyncConfig')
        if (cfg) {
          if (await webdavHeadObject(cfg, fullPath)) await webdavDelete(cfg, fullPath)
          res = await webdavUpload(cfg, fullPath, content)
        }
        break
      }
      case 'fast-note-sync': {
        const { getFnsStorageConfig, fnsUpload } = await import('@/lib/sync/fns-storage')
        const cfg = await getFnsStorageConfig()
        if (cfg) res = await fnsUpload(cfg, fullPath, content)
        break
      }
    }
  } catch (error) {
    console.error('[data-file-sync] upload error:', filename, error)
  }
  return Boolean(res)
}

/** 下载 `.data/<filename>` 的 JSON 内容；远端缺失返回 null */
export async function downloadDataFile(filename: string, options: DataFileDownloadOptions = {}): Promise<string | null> {
  const store = await Store.load('store.json')
  const primaryBackupMethod = await store.get<string>('primaryBackupMethod') || 'github'
  const fullPath = `${DATA_PATH}/${filename}`
  let files: unknown
  switch (primaryBackupMethod) {
    case 'github': { const repo = await getSyncRepoName('github'); files = await githubGetFiles({ path: fullPath, repo }); break }
    case 'gitee': { const repo = await getSyncRepoName('gitee'); files = await giteeGetFiles({ path: fullPath, repo }); break }
    case 'gitlab': { const repo = await getSyncRepoName('gitlab'); files = await gitlabGetFileContent({ path: fullPath, ref: 'main', repo }); break }
    case 'gitea': { const repo = await getSyncRepoName('gitea'); files = await giteaGetFileContent({ path: fullPath, ref: 'main', repo }); break }
    case 's3': {
      const cfg = await store.get<S3Config>('s3SyncConfig')
      if (cfg) { const r = await s3Download(cfg, fullPath); if (r) return r.content }
      return null
    }
    case 'webdav': {
      const cfg = await store.get<WebDAVConfig>('webdavSyncConfig')
      if (cfg) { const r = await webdavDownload(cfg, fullPath); if (r) return r.content }
      return null
    }
    case 'fast-note-sync': {
      const { getFnsStorageConfig, fnsDownload } = await import('@/lib/sync/fns-storage')
      const cfg = await getFnsStorageConfig()
      if (cfg) { const r = await fnsDownload(cfg, fullPath); if (r) return r }
      return null
    }
  }
  // git 平台：解码 base64
  if (files) {
    try {
      if (!options.allowMissingRemote || !hasEmptyRemoteFileContent(files)) {
        return decodeBase64ToString(getRemoteFileContent(files, fullPath))
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'unknown error'
      if (!options.allowMissingRemote || !isMissingRemoteFileError(message)) throw error
    }
  }
  return null
}
