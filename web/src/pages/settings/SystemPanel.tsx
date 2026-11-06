import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, CloudOff, Database, Download, HardDriveDownload, History, RefreshCw, RotateCcw, Server, Trash2, Upload } from 'lucide-react';
import { getDb } from '../../lib/db';
import { usePendingOps, useTable } from '../../lib/data';
import { useAuth, useSyncState } from '../../lib/auth';
import { api, errorMessage, NetworkError } from '../../lib/api';
import { syncNow } from '../../lib/sync';
import { uuid } from '../../lib/ids';
import { downloadBlob, fmtDateTime, relativeTime } from '../../lib/format';
import { Badge, Button, Card, CardHeader, confirmDialog, KeyValue, LoadMore, toast, usePaged } from '../../components/ui';

interface Status {
  database: string;
  serverSeq: number;
  realtimeClients: number;
  mailConfigured: boolean;
  serverTime: string;
  backups?: { name: string; createdAt: string }[];
}

export function SystemPanel() {
  const { user } = useAuth();
  const sync = useSyncState();
  const ops = usePendingOps();
  const [status, setStatus] = useState<Status | null>(null);
  const [statusErr, setStatusErr] = useState<string | null>(null);
  const isAdmin = user?.role === 'admin';
  const activities = useTable('activities');
  const sorted = [...(activities ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const { visible, more, loadMore, total } = usePaged(sorted, 25);
  const [cursor, setCursor] = useState(0);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await api<Status>('/admin/status'));
      setStatusErr(null);
    } catch (e) {
      setStatusErr(e instanceof NetworkError ? 'Servidor inacessível' : errorMessage(e));
    }
    setCursor(Number((await getDb().meta.get('cursor'))?.value ?? 0));
  }, []);
  useEffect(() => void loadStatus(), [loadStatus, sync.lastSync]);

  const pending = ops.filter((o) => o.status === 'pending');
  const errors = ops.filter((o) => o.status === 'error');

  const retry = async (seq: number) => {
    const e = await getDb().outbox.get(seq);
    if (!e) return;
    const opId = uuid(); // nova tentativa = nova operação (a anterior foi recusada em definitivo)
    await getDb().outbox.update(seq, { status: 'pending', error: undefined, opId, op: { ...e.op, opId } });
    void syncNow();
  };
  const dismiss = async (seq: number) => {
    if (!(await confirmDialog({ title: 'Descartar alteração rejeitada', message: 'A alteração recusada pelo servidor será removida da fila. Os dados do servidor permanecem como estão.', confirmLabel: 'Descartar' }))) return;
    await getDb().outbox.delete(seq);
  };

  /** Cópia de segurança dos dados deste aparelho (inclui alterações ainda não sincronizadas). */
  const exportLocal = async () => {
    const db = getDb();
    const out: Record<string, unknown[]> = {};
    for (const t of db.tables) out[t.name] = await t.toArray();
    downloadBlob(new Blob([JSON.stringify({ app: 'jn-orcamentos-local', createdAt: new Date().toISOString(), user: user?.email, tables: out })], { type: 'application/json' }), `jn-orcamentos-aparelho-${new Date().toISOString().slice(0, 10)}.json`);
  };

  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Conexão e sincronização" icon={<RefreshCw className="h-4 w-4" />} action={<Button size="sm" variant="outline" loading={sync.syncing} icon={<RefreshCw className="h-4 w-4" />} onClick={() => void syncNow()}>Sincronizar agora</Button>} />
        <dl className="grid grid-cols-2 gap-4 p-5">
          <KeyValue label="Conexão">{sync.online ? <span className="inline-flex items-center gap-1.5 text-emerald-600"><CheckCircle2 className="h-4 w-4" /> Online</span> : <span className="inline-flex items-center gap-1.5 text-amber-600"><CloudOff className="h-4 w-4" /> Offline</span>}</KeyValue>
          <KeyValue label="Sincronização">{sync.syncing ? 'Em andamento...' : sync.lastError ? <span className="text-red-600">{sync.lastError}</span> : 'Em dia'}</KeyValue>
          <KeyValue label="Última sincronização">{sync.lastSync ? `${fmtDateTime(sync.lastSync)} (${relativeTime(sync.lastSync)})` : 'Nunca'}</KeyValue>
          <KeyValue label="Alterações pendentes">{String(pending.length)}</KeyValue>
          <KeyValue label="Servidor">{statusErr ?? (status ? `${status.database === 'pglite' ? 'PostgreSQL embutido (PGlite)' : 'PostgreSQL'} · ${status.realtimeClients} conexão(ões) em tempo real` : '...')}</KeyValue>
          <KeyValue label="Posição de sincronização">{`${cursor} / ${status?.serverSeq ?? '?'}`}</KeyValue>
          <KeyValue label="Envio de e-mails">{status ? (status.mailConfigured ? 'Configurado' : 'Não configurado (SMTP)') : '—'}</KeyValue>
          <KeyValue label="Armazenamento local">IndexedDB (dados preservados em atualizações)</KeyValue>
        </dl>
        {pending.length > 0 && (
          <div className="border-t border-graphite-100 px-5 py-3 dark:border-white/5">
            <div className="label">Fila de envio</div>
            <ul className="space-y-1 text-sm">
              {pending.slice(0, 10).map((o) => <li key={o.seq} className="flex justify-between gap-2"><span className="truncate">{o.description}</span><span className="text-xs text-graphite-500">{relativeTime(o.createdAt)}</span></li>)}
            </ul>
          </div>
        )}
        {errors.length > 0 && (
          <div className="border-t border-graphite-100 px-5 py-3 dark:border-white/5">
            <div className="label flex items-center gap-1.5 text-red-600"><AlertTriangle className="h-4 w-4" /> Alterações rejeitadas pelo servidor</div>
            <ul className="space-y-2">
              {errors.map((o) => (
                <li key={o.seq} className="rounded-xl bg-red-50 p-3 text-sm dark:bg-red-500/10">
                  <div className="font-medium">{o.description}</div>
                  <div className="text-xs text-red-700 dark:text-red-300">{o.error}</div>
                  <div className="mt-2 flex gap-2">
                    <Button size="sm" variant="outline" icon={<RotateCcw className="h-3.5 w-3.5" />} onClick={() => retry(o.seq!)}>Tentar novamente</Button>
                    <Button size="sm" variant="ghost" icon={<Trash2 className="h-3.5 w-3.5" />} onClick={() => dismiss(o.seq!)}>Descartar</Button>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>

      <Card>
        <CardHeader title="Backup e exportação" icon={<Database className="h-4 w-4" />} />
        <div className="space-y-4 p-5 text-sm">
          <div>
            <div className="font-medium">Cópia dos dados deste aparelho</div>
            <p className="mb-2 text-xs text-graphite-500">Inclui alterações ainda não sincronizadas. Funciona offline.</p>
            <Button size="sm" variant="outline" icon={<HardDriveDownload className="h-4 w-4" />} onClick={exportLocal}>Baixar cópia local</Button>
          </div>
          {isAdmin && <ServerBackups onChange={loadStatus} />}
        </div>
      </Card>

      <Card className="lg:col-span-2">
        <CardHeader title="Histórico de operações" icon={<History className="h-4 w-4" />} />
        <ul className="divide-y divide-graphite-100 dark:divide-white/5">
          {visible.map((a) => (
            <li key={a.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
              <span className="min-w-0 flex-1">{a.summary}</span>
              <span className="shrink-0 text-xs text-graphite-500">{a.userName} · {fmtDateTime(a.createdAt)}</span>
            </li>
          ))}
        </ul>
        <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
      </Card>
      {isAdmin && <Logs />}
    </div>
  );
}

function ServerBackups({ onChange }: { onChange: () => void }) {
  const [list, setList] = useState<{ name: string; size: number; createdAt: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(() => api<{ backups: { name: string; size: number; createdAt: string }[] }>('/admin/backups').then((r) => setList(r.backups)).catch(() => setList(null)), []);
  useEffect(() => void load(), [load]);

  const create = async () => {
    setBusy(true);
    try {
      const r = await api<{ name: string }>('/admin/backups', { body: {} });
      toast(`Backup criado: ${r.name}`);
      await load();
      onChange();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const restore = async (opts: { backupName?: string; fileBase64?: string }, label: string) => {
    const ok = await confirmDialog({
      title: 'Restaurar backup',
      message: (
        <>
          Restaurar <b>{label}</b>? A restauração é <b>não destrutiva</b>: um backup de segurança do estado atual é criado antes, e somente registros que não existem mais são recuperados. Nada é apagado ou sobrescrito.
        </>
      ),
      typeToConfirm: 'RESTAURAR',
      confirmLabel: 'Restaurar',
    });
    if (!ok) return;
    try {
      const r = await api<{ safetyBackup: string; inserted: Record<string, number> }>('/admin/restore', { body: { ...opts, confirm: 'RESTAURAR' }, timeoutMs: 300_000 });
      const n = Object.values(r.inserted).reduce((s, x) => s + x, 0);
      toast(`Restauração concluída: ${n} registro(s) recuperado(s). Backup de segurança: ${r.safetyBackup}`);
      await load();
      void syncNow();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  if (!list) return <p className="text-xs text-graphite-500">Backups do servidor disponíveis quando conectado.</p>;
  return (
    <div className="space-y-3">
      <div>
        <div className="font-medium">Backups do servidor</div>
        <p className="mb-2 text-xs text-graphite-500">Backup automático diário e antes de cada migração do banco.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon={<Server className="h-4 w-4" />} loading={busy} onClick={create}>Criar backup agora</Button>
          <a href="/api/admin/export" download><Button size="sm" variant="outline" icon={<Download className="h-4 w-4" />}>Exportar todos os dados (JSON)</Button></a>
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-graphite-200 px-3 py-1.5 text-[13px] font-medium hover:bg-graphite-50 dark:border-white/10 dark:hover:bg-white/5">
            <Upload className="h-4 w-4" /> Restaurar de arquivo
            <input type="file" accept=".gz,.json" className="hidden" onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              const buf = new Uint8Array(await f.arrayBuffer());
              let bin = '';
              for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
              await restore({ fileBase64: btoa(bin) }, f.name);
              e.target.value = '';
            }} />
          </label>
        </div>
      </div>
      <ul className="max-h-56 space-y-1 overflow-y-auto">
        {list.map((b) => (
          <li key={b.name} className="flex items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-graphite-50 dark:hover:bg-white/5">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{b.name}</span>
            <Badge>{(b.size / 1024).toFixed(0)} KB</Badge>
            <a href={`/api/admin/backups/${b.name}`} className="text-xs text-navy-600 hover:underline dark:text-gold-300">baixar</a>
            <button className="text-xs text-graphite-500 hover:underline" onClick={() => restore({ backupName: b.name }, b.name)}>restaurar</button>
          </li>
        ))}
        {!list.length && <li className="text-xs text-graphite-500">Nenhum backup ainda.</li>}
      </ul>
    </div>
  );
}

function Logs() {
  const [data, setData] = useState<{ errors: { id: string; source: string; message: string; createdAt: string }[]; conflicts: { id: string; entity: string; entityId: string; resolution: string; createdAt: string }[] } | null>(null);
  useEffect(() => void api<typeof data>('/admin/logs').then(setData).catch(() => undefined), []);
  if (!data) return null;
  return (
    <Card className="lg:col-span-2">
      <CardHeader title="Registros técnicos" subtitle="Erros e conflitos de sincronização resolvidos automaticamente" icon={<AlertTriangle className="h-4 w-4" />} />
      <div className="grid gap-4 p-5 md:grid-cols-2">
        <div>
          <div className="label">Erros ({data.errors.length})</div>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {data.errors.map((e) => <li key={e.id} className="rounded-lg bg-graphite-50 p-2 dark:bg-white/[0.03]"><b>{e.source}</b> — {e.message}<div className="text-graphite-500">{fmtDateTime(e.createdAt)}</div></li>)}
            {!data.errors.length && <li className="text-graphite-500">Nenhum erro registrado.</li>}
          </ul>
        </div>
        <div>
          <div className="label">Conflitos ({data.conflicts.length})</div>
          <ul className="max-h-64 space-y-1 overflow-y-auto text-xs">
            {data.conflicts.map((c) => <li key={c.id} className="rounded-lg bg-graphite-50 p-2 dark:bg-white/[0.03]"><b>{c.entity}</b> — {c.resolution}<div className="text-graphite-500">{fmtDateTime(c.createdAt)}</div></li>)}
            {!data.conflicts.length && <li className="text-graphite-500">Nenhum conflito.</li>}
          </ul>
        </div>
      </div>
    </Card>
  );
}
