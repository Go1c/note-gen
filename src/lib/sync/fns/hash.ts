/**
 * fast-note-sync 哈希工具。
 *
 * 注意：服务端 / Obsidian 插件用的不是 sha256/md5，而是一个朴素的 JS 字符串哈希
 * （djb2 变体）。必须逐字节一致，否则 contentHash/pathHash 与其它端对不上，
 * 会导致同步反复触发或冲突误判。源出处：obsidian-fast-note-sync
 * src/lib/utils/helpers.ts 的 hashContent。
 */

/**
 * 对字符串内容求哈希（与插件 hashContent 完全一致）。
 * pathHash = hashContent(path)；contentHash = hashContent(content)。
 */
export function hashContent(content: string): string {
  let hash = 0
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash &= hash
  }
  return String(hash)
}

/**
 * 异步版本：大字符串分段让出主线程，避免卡 UI。结果与 hashContent 一致。
 */
export async function hashContentAsync(content: string): Promise<string> {
  let hash = 0
  const len = content.length
  const yieldSize = 256 * 1024
  for (let i = 0; i < len; i++) {
    const char = content.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash &= hash
    if (i > 0 && i % yieldSize === 0) {
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  }
  return String(hash)
}

/**
 * 路径哈希。
 */
export function hashPath(path: string): string {
  return hashContent(path)
}

/**
 * 二进制内容哈希（附件用）。把字节序列按 charCode 走同一套字符串哈希算法，
 * 与插件 hashArrayBuffer 对齐。
 *
 * TODO(联调): 插件对超大文件可能采用「采样」哈希（只取前若干字节）。需在端到端
 * 联调时对照真实服务核实附件 contentHash 的确切算法（是否采样、采样长度），
 * 再决定是否在此截断，以保证与服务端/其它端一致。当前实现为全量遍历。
 */
export function hashBinary(buffer: ArrayBuffer | Uint8Array): string {
  const view = buffer instanceof Uint8Array ? buffer : new Uint8Array(buffer)
  let hash = 0
  for (let i = 0; i < view.length; i++) {
    hash = (hash << 5) - hash + view[i]
    hash &= hash
  }
  return String(hash)
}
