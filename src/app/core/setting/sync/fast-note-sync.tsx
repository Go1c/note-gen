'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CheckCircle, XCircle, Loader2, Save, Plug, Unplug } from 'lucide-react';
import { FastNoteSyncConfig } from '@/types/sync';
import { Store } from '@tauri-apps/plugin-store';
import { FNS_CONFIG_KEY } from '@/types/sync';
import useFnsSyncStore from '@/stores/fns-sync';
import { connectFns, disconnectFns, isValidConfig, saveFnsConfig, isFnsPrimary } from '@/lib/sync/fns/manager';

const PLACEHOLDER = `{
  "api": "https://fast-note.zeabur.app",
  "apiToken": "<从 web 面板复制的 token>",
  "vault": "Lumio"
}`;

export function FastNoteSync() {
  const { connected, authed, syncing, lastError, serverVersion } = useFnsSyncStore();
  const [raw, setRaw] = useState('');
  const [parseError, setParseError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  // 载入已保存配置；若配置有效且尚未连接则自动连接
  useEffect(() => {
    (async () => {
      const store = await Store.load('store.json');
      const cfg = await store.get<FastNoteSyncConfig>(FNS_CONFIG_KEY);
      if (cfg) {
        setRaw(JSON.stringify(cfg, null, 2));
        // 仅当 fast-note-sync 已是主后端时才自动连接，避免与其它后端重复上行
        if (isValidConfig(cfg) && !useFnsSyncStore.getState().connected && (await isFnsPrimary())) {
          void connectFns(cfg);
        }
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function parseConfig(): FastNoteSyncConfig | null {
    try {
      const obj = JSON.parse(raw);
      if (!isValidConfig(obj)) {
        setParseError('配置缺少 api / apiToken / vault 字段');
        return null;
      }
      setParseError(null);
      return obj;
    } catch {
      setParseError('不是合法的 JSON');
      return null;
    }
  }

  async function handleSave() {
    const cfg = parseConfig();
    if (!cfg) return;
    setIsSaving(true);
    try {
      await saveFnsConfig(cfg);
      // 设为主同步后端
      const store = await Store.load('store.json');
      await store.set('primaryBackupMethod', 'fast-note-sync');
      await store.save();
    } finally {
      setIsSaving(false);
    }
  }

  async function handleConnect() {
    const cfg = parseConfig();
    if (!cfg) return;
    setIsConnecting(true);
    try {
      await saveFnsConfig(cfg);
      // 显式连接即视为激活：设为主同步后端（旧后端的 push/pull 会被守卫 no-op）
      const store = await Store.load('store.json');
      await store.set('primaryBackupMethod', 'fast-note-sync');
      await store.save();
      await connectFns(cfg);
    } finally {
      setIsConnecting(false);
    }
  }

  function statusIcon() {
    if (syncing || isConnecting) return <Loader2 className="size-4 animate-spin text-blue-500" />;
    if (connected && authed) return <CheckCircle className="size-4 text-green-500" />;
    return <XCircle className="size-4 text-red-500" />;
  }

  function statusText() {
    if (isConnecting) return '连接中…';
    if (syncing) return '同步中…';
    if (connected && authed) return '已连接';
    if (connected && !authed) return '已连接，鉴权中…';
    return '未连接';
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Fast Note Sync（自建实时同步）</CardTitle>
        <CardDescription>
          粘贴自建服务 web 面板生成的配置 JSON（包含 api、apiToken、vault），即可与 Obsidian
          等其它设备实时多端同步笔记、附件与文件夹。
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 状态 */}
        <div className="flex items-center justify-between p-3 bg-muted rounded-lg">
          <span className="text-sm font-medium">连接状态</span>
          <div className="flex items-center gap-2">
            {statusIcon()}
            <span className="text-sm">{statusText()}</span>
            {serverVersion && <span className="text-xs text-muted-foreground">v{serverVersion}</span>}
          </div>
        </div>

        {lastError && (
          <div className="text-xs text-red-500 px-1">错误：{lastError}</div>
        )}

        <div className="space-y-2">
          <Label htmlFor="fns-config">配置 JSON</Label>
          <Textarea
            id="fns-config"
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder={PLACEHOLDER}
            rows={8}
            className="font-mono text-xs"
          />
          {parseError && <p className="text-xs text-red-500">{parseError}</p>}
        </div>

        <div className="flex gap-2 pt-2">
          <Button onClick={handleSave} disabled={isSaving} variant="outline">
            {isSaving ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Save className="size-4 mr-2" />}
            保存配置
          </Button>
          {connected ? (
            <Button onClick={() => disconnectFns()} variant="outline">
              <Unplug className="size-4 mr-2" />
              断开
            </Button>
          ) : (
            <Button onClick={handleConnect} disabled={isConnecting}>
              {isConnecting ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Plug className="size-4 mr-2" />}
              连接并同步
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
