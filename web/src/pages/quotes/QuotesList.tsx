import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Calculator, FileText, Plus } from 'lucide-react';
import { QUOTE_STATUS_LABEL, formatQuoteNumber, quoteDisplayStatus, type QuoteStatus } from '@jn/shared';
import { useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { fmtDate, formatBRL, normalize } from '../../lib/format';
import { QuoteStatusBadge } from '../../lib/status';
import { Button, Card, EmptyState, Input, LoadingBlock, LoadMore, PageHeader, SearchInput, Select, Tabs, usePaged } from '../../components/ui';

export default function QuotesList() {
  const quotes = useTable('quotes');
  const clients = useTable('clients');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [status, setStatus] = useState<QuoteStatus | 'all'>('all');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [sort, setSort] = useState<'desc' | 'asc' | 'value'>('desc');
  const clientMap = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, draft: 0, pending: 0, approved: 0, refused: 0, expired: 0 };
    (quotes ?? []).forEach((x) => {
      c.all++;
      c[quoteDisplayStatus(x)]++;
    });
    return c;
  }, [quotes]);

  const list = useMemo(() => {
    if (!quotes) return undefined;
    const term = normalize(q.trim());
    const num = q.replace(/\D/g, '');
    return quotes
      .filter((x) => status === 'all' || quoteDisplayStatus(x) === status)
      .filter((x) => !from || x.issueDate >= from)
      .filter((x) => !to || x.issueDate <= to)
      .filter((x) => {
        if (!term) return true;
        const c = clientMap.get(x.clientId);
        return (num && String(x.number ?? '').includes(String(Number(num)))) || normalize(c?.name ?? '').includes(term) || normalize(x.title).includes(term);
      })
      .sort((a, b) => (sort === 'value' ? b.total - a.total : sort === 'asc' ? a.createdAt.localeCompare(b.createdAt) : b.createdAt.localeCompare(a.createdAt)));
  }, [quotes, q, status, from, to, sort, clientMap]);
  const { visible, more, loadMore, total } = usePaged(list);

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Orçamentos"
        subtitle={list ? `${list.length} orçamento(s) · ${formatBRL(list.reduce((s, x) => s + x.total, 0))}` : undefined}
        actions={can('quotes', 'create') && <Button variant="gold" icon={<Calculator className="h-4 w-4" />} onClick={() => navigate('/orcamentos/novo')}>Novo orçamento</Button>}
      />
      <Tabs
        className="mb-3"
        value={status}
        onChange={setStatus}
        tabs={(['all', 'draft', 'pending', 'approved', 'refused', 'expired'] as const).map((s) => ({ value: s, label: s === 'all' ? 'Todos' : QUOTE_STATUS_LABEL[s], count: counts[s] }))}
      />
      <Card className="mb-4 grid grid-cols-2 gap-3 p-3 sm:p-4 md:grid-cols-5">
        <SearchInput className="col-span-2" value={q} onChange={setQ} placeholder="Número, cliente ou referência" />
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="De" title="Data inicial" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Até" title="Data final" />
        <Select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="Ordenar">
          <option value="desc">Mais recentes</option>
          <option value="asc">Mais antigos</option>
          <option value="value">Maior valor</option>
        </Select>
      </Card>
      {!list ? (
        <LoadingBlock />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<FileText className="h-6 w-6" />} title={quotes?.length ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento ainda'} description={quotes?.length ? 'Ajuste os filtros.' : 'Use a calculadora para criar o primeiro orçamento.'} action={!quotes?.length && can('quotes', 'create') ? <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/orcamentos/novo')}>Criar orçamento</Button> : undefined} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <table className="hidden w-full md:table">
            <thead className="border-b border-graphite-100 bg-graphite-50/60 dark:border-white/5 dark:bg-white/[0.02]">
              <tr>
                <th className="th">Número</th>
                <th className="th">Cliente</th>
                <th className="th">Criação</th>
                <th className="th">Validade</th>
                <th className="th text-right">Valor total</th>
                <th className="th">Situação</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100 dark:divide-white/5">
              {visible.map((x) => (
                <tr key={x.id} className="cursor-pointer hover:bg-graphite-50 dark:hover:bg-white/[0.03]" onClick={() => navigate(`/orcamentos/${x.id}`)}>
                  <td className="td font-medium">
                    {formatQuoteNumber(x.number)}
                    {x._syncError && <span className="ml-2 text-xs text-red-500">não sincronizado</span>}
                  </td>
                  <td className="td">
                    <div>{clientMap.get(x.clientId)?.name ?? '—'}</div>
                    {x.title && <div className="text-xs text-graphite-500">{x.title}</div>}
                  </td>
                  <td className="td text-graphite-500">{fmtDate(x.issueDate)}</td>
                  <td className="td text-graphite-500">{fmtDate(x.validUntil)}</td>
                  <td className="td tabular text-right font-semibold">{formatBRL(x.total)}</td>
                  <td className="td">
                    <QuoteStatusBadge quote={x} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="divide-y divide-graphite-100 md:hidden dark:divide-white/5">
            {visible.map((x) => (
              <li key={x.id}>
                <Link to={`/orcamentos/${x.id}`} className="block px-4 py-3 active:bg-graphite-50">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium">{formatQuoteNumber(x.number)}</span>
                    <QuoteStatusBadge quote={x} />
                  </div>
                  <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                    <span className="truncate text-graphite-600 dark:text-graphite-300">{clientMap.get(x.clientId)?.name ?? '—'}</span>
                    <span className="tabular font-semibold">{formatBRL(x.total)}</span>
                  </div>
                  <div className="text-xs text-graphite-500">{fmtDate(x.issueDate)} · validade {fmtDate(x.validUntil)}</div>
                </Link>
              </li>
            ))}
          </ul>
          <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
        </Card>
      )}
    </div>
  );
}
