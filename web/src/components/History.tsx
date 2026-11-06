import { useEffect, useState } from 'react';
import { History as HistoryIcon, WifiOff } from 'lucide-react';
import { api, errorMessage, NetworkError } from '../lib/api';
import { fmtDateTime } from '../lib/format';
import { EmptyState, Spinner } from './ui';

interface Row {
  id: string;
  action: string;
  userName: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  createdAt: string;
}

const IGNORE = new Set(['updatedAt', 'version', 'seq', 'calc', 'createdAt', '_syncError']);
const ACTION: Record<string, string> = { create: 'Cadastro', update: 'Alteração', delete: 'Exclusão', payment: 'Pagamento' };

function changedFields(r: Row): string[] {
  if (!r.before || !r.after) return [];
  return Object.keys(r.after).filter((k) => !IGNORE.has(k) && JSON.stringify(r.before![k]) !== JSON.stringify(r.after![k]));
}

/** Histórico de alterações de um registro (consultado no servidor). */
export function ChangeHistory({ entity, id, labels = {} }: { entity: string; id: string; labels?: Record<string, string> }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    api<{ history: Row[] }>(`/history/${entity}/${id}`)
      .then((r) => setRows(r.history))
      .catch((e) => setError(e instanceof NetworkError ? 'offline' : errorMessage(e)));
  }, [entity, id]);
  if (error === 'offline') return <EmptyState icon={<WifiOff className="h-6 w-6" />} title="Histórico indisponível offline" description="O histórico completo é consultado no servidor. Conecte-se à internet para visualizar." />;
  if (error) return <p className="p-4 text-sm text-red-600">{error}</p>;
  if (!rows) return <div className="flex justify-center p-8"><Spinner /></div>;
  if (!rows.length) return <EmptyState icon={<HistoryIcon className="h-6 w-6" />} title="Sem alterações registradas" />;
  return (
    <ol className="relative space-y-4 border-l border-graphite-200 pl-5 dark:border-white/10">
      {rows.map((r) => {
        const fields = changedFields(r);
        const base = r.action.split(':')[0];
        return (
          <li key={r.id} className="relative">
            <span className="absolute top-1.5 -left-[25px] h-2.5 w-2.5 rounded-full border-2 border-white bg-navy-500 dark:border-graphite-900 dark:bg-gold-400" />
            <div className="text-sm font-medium">
              {ACTION[base] ?? r.action} <span className="font-normal text-graphite-500">por {r.userName || 'Sistema'}</span>
            </div>
            <div className="text-xs text-graphite-500">{fmtDateTime(r.createdAt)}</div>
            {fields.length > 0 && (
              <ul className="mt-1.5 space-y-0.5 text-xs text-graphite-600 dark:text-graphite-300">
                {fields.slice(0, 12).map((f) => (
                  <li key={f}>
                    <span className="font-medium">{labels[f] ?? f}</span>: {fmtVal(r.before![f])} → {fmtVal(r.after![f])}
                  </li>
                ))}
              </ul>
            )}
          </li>
        );
      })}
    </ol>
  );
}

function fmtVal(v: unknown): string {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'sim' : 'não';
  if (typeof v === 'object') return Array.isArray(v) ? `${v.length} item(ns)` : '{…}';
  const s = String(v);
  return s.length > 60 ? `${s.slice(0, 60)}…` : s;
}
