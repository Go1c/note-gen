/**
 * 仅用于 `next dev` 的服务端渲染（SSR）健壮性垫片。
 *
 * 背景：本应用是 Tauri 静态导出（output: export），生产运行时在 webview 内执行（有真实
 * localStorage），不存在 SSR。但 `next dev` 会先在 Node 端做一次 SSR，而该环境里 `window`
 * 被部分 polyfill 为已定义、`localStorage` 却是残缺对象（缺少 getItem），导致全应用基于
 * `typeof window` 的守卫被击穿，SSR 抛 `localStorage.getItem is not a function` → 页面 500。
 *
 * 这里在服务进程启动时注入一个 no-op 的内存版 localStorage，使 SSR 期的读取安全返回 null
 * （走各组件的默认值分支）。仅影响 Node 端；浏览器/webview 使用真实 localStorage，不受影响。
 */
export function register() {
  const g = globalThis as unknown as { localStorage?: Storage; window?: { localStorage?: Storage } }

  const broken = !g.localStorage || typeof g.localStorage.getItem !== 'function'
  if (!broken) return

  const store = new Map<string, string>()
  const stub: Storage = {
    getItem: (k: string) => (store.has(k) ? (store.get(k) as string) : null),
    setItem: (k: string, v: string) => {
      store.set(k, String(v))
    },
    removeItem: (k: string) => {
      store.delete(k)
    },
    clear: () => store.clear(),
    key: (i: number) => Array.from(store.keys())[i] ?? null,
    get length() {
      return store.size
    },
  }

  try {
    g.localStorage = stub
    if (g.window && typeof g.window.localStorage?.getItem !== 'function') {
      g.window.localStorage = stub
    }
  } catch {
    // 忽略只读全局赋值失败
  }
}
