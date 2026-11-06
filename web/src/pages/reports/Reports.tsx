import { useMemo, useState } from 'react';
import { BarChart3, FileSpreadsheet, FileText } from 'lucide-react';
import {
  CLIENT_STATUS_LABEL,
  FINANCE_STATUS_LABEL,
  JOB_STATUS_LABEL,
  QUOTE_STATUS_LABEL,
  STOCK_MOVEMENT_LABEL,
  financeDisplayStatus,
  formatJobNumber,
  formatQuoteNumber,
  quoteDisplayStatus,
} from '@jn/shared';
import { useCompany, useTable } from '../../lib/data';
import { fmtDate, formatBRL, formatNumber, isoToLocalDate } from '../../lib/format';
import { exportCsv, exportXlsx, type Cell } from '../../lib/export';
import { buildReportPdf } from '../../lib/pdf';
import { inPeriod, PeriodFilter, periodFor, periodLabel, type Period } from '../../components/PeriodFilter';
import { Button, Card, clsx, EmptyState, LoadingBlock, PageHeader } from '../../components/ui';

type Kind = 'sales' | 'quotes' | 'clients' | 'cities' | 'services' | 'jobs' | 'materials' | 'stock' | 'income' | 'expenses' | 'profit' | 'receivables';
const REPORTS: { id: Kind; label: string; desc: string }[] = [
  { id: 'sales', label: 'Vendas', desc: 'Orçamentos aprovados no período' },
  { id: 'quotes', label: 'Orçamentos', desc: 'Emitidos no período, por situação' },
  { id: 'clients', label: 'Clientes', desc: 'Cadastrados no período' },
  { id: 'cities', label: 'Clientes por cidade', desc: 'Quantidade e valor contratado' },
  { id: 'services', label: 'Serviços mais vendidos', desc: 'Medida e valor vendidos' },
  { id: 'jobs', label: 'Obras', desc: 'Ordens de serviço do período' },
  { id: 'materials', label: 'Materiais utilizados', desc: 'Consumo em obras' },
  { id: 'stock', label: 'Consumo de estoque', desc: 'Todas as movimentações' },
  { id: 'income', label: 'Entradas', desc: 'Recebimentos confirmados' },
  { id: 'expenses', label: 'Saídas', desc: 'Pagamentos confirmados' },
  { id: 'profit', label: 'Lucro estimado', desc: 'Custo × preço dos aprovados' },
  { id: 'receivables', label: 'Contas a receber', desc: 'Em aberto com vencimento no período' },
];

interface Col {
  name: string;
  money?: boolean;
  num?: number;
  right?: boolean;
}

export default function Reports() {
  const [kind, setKind] = useState<Kind>('sales');
  const [period, setPeriod] = useState<Period>(periodFor('month'));
  const company = useCompany();
  const clients = useTable('clients');
  const quotes = useTable('quotes');
  const jobs = useTable('jobs');
  const products = useTable('products');
  const movements = useTable('stockMovements');
  const entries = useTable('financeEntries');
  const payments = useTable('payments');

  const ready = !!(clients && quotes && jobs && products && movements && entries && payments);
  const report = useMemo(() => {
    if (!ready) return null;
    const cname = new Map(clients!.map((c) => [c.id, c.name]));
    const pmap = new Map(products!.map((p) => [p.id, p]));
    const emap = new Map(entries!.map((e) => [e.id, e]));
    const approvedIn = quotes!.filter((q) => q.status === 'approved' && inPeriod(isoToLocalDate(q.decidedAt ?? q.updatedAt), period));
    let cols: Col[] = [];
    let rows: Cell[][] = [];
    let summary: [string, string][] = [];
    const sum = (i: number) => rows.reduce((s, r) => s + (Number(r[i]) || 0), 0);

    switch (kind) {
      case 'sales':
        cols = [{ name: 'Número' }, { name: 'Cliente' }, { name: 'Aprovado em' }, { name: 'Valor', money: true }, { name: 'Lucro estimado', money: true }];
        rows = approvedIn.map((q) => [formatQuoteNumber(q.number), cname.get(q.clientId) ?? '', fmtDate(q.decidedAt), q.total, q.calc?.estimatedProfit ?? 0]);
        summary = [['Vendas', String(rows.length)], ['Total vendido', formatBRL(sum(3))], ['Ticket médio', formatBRL(rows.length ? Math.round(sum(3) / rows.length) : 0)]];
        break;
      case 'quotes': {
        const list = quotes!.filter((q) => inPeriod(q.issueDate, period));
        cols = [{ name: 'Número' }, { name: 'Cliente' }, { name: 'Emissão' }, { name: 'Validade' }, { name: 'Situação' }, { name: 'Valor', money: true }];
        rows = list.map((q) => [formatQuoteNumber(q.number), cname.get(q.clientId) ?? '', fmtDate(q.issueDate), fmtDate(q.validUntil), QUOTE_STATUS_LABEL[quoteDisplayStatus(q)], q.total]);
        const by = (s: string) => list.filter((q) => quoteDisplayStatus(q) === s).length;
        const decided = by('approved') + by('refused');
        summary = [['Emitidos', String(list.length)], ['Aprovados / recusados / pendentes', `${by('approved')} / ${by('refused')} / ${by('pending')}`], ['Taxa de aprovação', decided ? `${formatNumber((by('approved') / decided) * 100, 1)}%` : '—'], ['Valor total', formatBRL(sum(5))]];
        break;
      }
      case 'clients': {
        const list = clients!.filter((c) => inPeriod(isoToLocalDate(c.createdAt), period));
        cols = [{ name: 'Cliente' }, { name: 'CPF/CNPJ' }, { name: 'Telefone' }, { name: 'Cidade' }, { name: 'Situação' }, { name: 'Orçamentos', num: 0, right: true }, { name: 'Contratado', money: true }];
        rows = list.map((c) => {
          const qs = quotes!.filter((q) => q.clientId === c.id);
          return [c.name, c.document, c.whatsapp || c.phone, c.city, CLIENT_STATUS_LABEL[c.status], qs.length, qs.filter((q) => q.status === 'approved').reduce((s, q) => s + q.total, 0)];
        });
        summary = [['Novos clientes', String(rows.length)], ['Total contratado', formatBRL(sum(6))]];
        break;
      }
      case 'cities': {
        const m = new Map<string, { n: number; v: number }>();
        clients!.forEach((c) => {
          const k = c.city ? `${c.city}${c.state ? `/${c.state}` : ''}` : 'Não informada';
          const cur = m.get(k) ?? { n: 0, v: 0 };
          cur.n++;
          cur.v += quotes!.filter((q) => q.clientId === c.id && q.status === 'approved' && inPeriod(isoToLocalDate(q.decidedAt ?? q.updatedAt), period)).reduce((s, q) => s + q.total, 0);
          m.set(k, cur);
        });
        cols = [{ name: 'Cidade' }, { name: 'Clientes', num: 0, right: true }, { name: 'Vendido no período', money: true }];
        rows = [...m.entries()].sort((a, b) => b[1].n - a[1].n).map(([k, v]) => [k, v.n, v.v]);
        summary = [['Cidades', String(rows.length)], ['Clientes', String(sum(1))]];
        break;
      }
      case 'services': {
        const m = new Map<string, { unit: string; measure: number; value: number; n: number }>();
        approvedIn.forEach((q) => q.calc?.environments.forEach((e) => {
          const cur = m.get(e.serviceName) ?? { unit: e.chargeUnit, measure: 0, value: 0, n: 0 };
          cur.measure += e.measure;
          cur.value += e.price;
          cur.n++;
          m.set(e.serviceName, cur);
        }));
        cols = [{ name: 'Serviço' }, { name: 'Ambientes', num: 0, right: true }, { name: 'Medida vendida', num: 2, right: true }, { name: 'Unidade' }, { name: 'Valor', money: true }];
        rows = [...m.entries()].sort((a, b) => b[1].value - a[1].value).map(([k, v]) => [k, v.n, Math.round(v.measure * 100) / 100, v.unit, v.value]);
        summary = [['Total vendido', formatBRL(sum(4))]];
        break;
      }
      case 'jobs': {
        const list = jobs!.filter((j) => inPeriod(j.startDate ?? isoToLocalDate(j.createdAt), period) || inPeriod(j.completedAt ? isoToLocalDate(j.completedAt) : null, period));
        cols = [{ name: 'OS' }, { name: 'Cliente' }, { name: 'Situação' }, { name: 'Início' }, { name: 'Previsão' }, { name: 'Conclusão' }, { name: 'Valor', money: true }];
        rows = list.map((j) => [formatJobNumber(j.number), cname.get(j.clientId) ?? '', JOB_STATUS_LABEL[j.status], fmtDate(j.startDate), fmtDate(j.expectedEnd), fmtDate(j.completedAt), j.contractedValue]);
        summary = [['Obras', String(rows.length)], ['Concluídas', String(list.filter((j) => j.status === 'completed').length)], ['Valor contratado', formatBRL(sum(6))]];
        break;
      }
      case 'materials': {
        const m = new Map<string, { q: number; c: number }>();
        movements!.filter((mv) => mv.jobId && mv.type === 'out' && inPeriod(isoToLocalDate(mv.createdAt), period)).forEach((mv) => {
          const cur = m.get(mv.productId) ?? { q: 0, c: 0 };
          cur.q += -mv.delta;
          cur.c += Math.round(-mv.delta * mv.unitCost);
          m.set(mv.productId, cur);
        });
        cols = [{ name: 'Material' }, { name: 'Quantidade', num: 3, right: true }, { name: 'Unidade' }, { name: 'Custo', money: true }];
        rows = [...m.entries()].sort((a, b) => b[1].c - a[1].c).map(([id, v]) => [pmap.get(id)?.name ?? '?', Math.round(v.q * 1000) / 1000, pmap.get(id)?.unit ?? '', v.c]);
        summary = [['Custo dos materiais consumidos', formatBRL(sum(3))]];
        break;
      }
      case 'stock': {
        const list = movements!.filter((mv) => inPeriod(isoToLocalDate(mv.createdAt), period)).sort((a, b) => b.createdAt.localeCompare(a.createdAt));
        cols = [{ name: 'Data' }, { name: 'Produto' }, { name: 'Tipo' }, { name: 'Variação', num: 3, right: true }, { name: 'Saldo', num: 3, right: true }, { name: 'Motivo' }, { name: 'Usuário' }];
        rows = list.map((mv) => [fmtDate(mv.createdAt), pmap.get(mv.productId)?.name ?? '?', STOCK_MOVEMENT_LABEL[mv.type], mv.delta, mv.balanceAfter, mv.reason, mv.createdByName]);
        const stockValue = products!.filter((p) => p.active).reduce((s, p) => s + Math.max(0, p.quantity) * p.unitCost, 0);
        summary = [['Movimentações', String(rows.length)], ['Custo total do estoque atual', formatBRL(Math.round(stockValue))], ['Produtos abaixo do mínimo', String(products!.filter((p) => p.active && p.minStock > 0 && p.quantity <= p.minStock).length)]];
        break;
      }
      case 'income':
      case 'expenses': {
        const k = kind === 'income' ? 'in' : 'out';
        const list = payments!.filter((p) => emap.get(p.entryId)?.kind === k && emap.get(p.entryId)?.status !== 'cancelled' && inPeriod(isoToLocalDate(p.paidAt), period)).sort((a, b) => a.paidAt.localeCompare(b.paidAt));
        cols = [{ name: 'Data' }, { name: 'Descrição' }, { name: 'Cliente' }, { name: 'Forma' }, { name: 'Valor', money: true }];
        rows = list.map((p) => {
          const e = emap.get(p.entryId)!;
          return [fmtDate(p.paidAt), e.description, cname.get(e.clientId ?? '') ?? '', p.method, p.amount];
        });
        summary = [[kind === 'income' ? 'Total recebido' : 'Total pago', formatBRL(sum(4))], ['Lançamentos', String(rows.length)]];
        break;
      }
      case 'profit':
        cols = [{ name: 'Número' }, { name: 'Cliente' }, { name: 'Valor', money: true }, { name: 'Custo', money: true }, { name: 'Lucro', money: true }, { name: 'Margem real', num: 1, right: true }];
        rows = approvedIn.map((q) => {
          const cost = q.calc?.totalCost ?? 0;
          const profit = q.total - cost;
          return [formatQuoteNumber(q.number), cname.get(q.clientId) ?? '', q.total, cost, profit, q.total ? Math.round((profit / q.total) * 1000) / 10 : 0];
        });
        summary = [['Receita', formatBRL(sum(2))], ['Custo', formatBRL(sum(3))], ['Lucro estimado', formatBRL(sum(4))], ['Margem média', sum(2) ? `${formatNumber((sum(4) / sum(2)) * 100, 1)}%` : '—']];
        break;
      case 'receivables': {
        const list = entries!.filter((e) => e.kind === 'in' && e.status === 'pending' && (period.preset === 'all' || inPeriod(e.dueDate, period) || financeDisplayStatus(e) === 'overdue')).sort((a, b) => a.dueDate.localeCompare(b.dueDate));
        cols = [{ name: 'Vencimento' }, { name: 'Descrição' }, { name: 'Cliente' }, { name: 'Situação' }, { name: 'Em aberto', money: true }];
        rows = list.map((e) => [fmtDate(e.dueDate), e.description, cname.get(e.clientId ?? '') ?? '', FINANCE_STATUS_LABEL[financeDisplayStatus(e)], e.amount - e.paidAmount]);
        summary = [['Total a receber', formatBRL(sum(4))], ['Vencidos', formatBRL(list.filter((e) => financeDisplayStatus(e) === 'overdue').reduce((s, e) => s + e.amount - e.paidAmount, 0))]];
        break;
      }
    }
    return { cols, rows, summary };
  }, [ready, kind, period, clients, quotes, jobs, products, movements, entries, payments]);

  const meta = REPORTS.find((r) => r.id === kind)!;
  const display = (c: Col, v: Cell) => (c.money ? formatBRL(Number(v) || 0) : c.num !== undefined ? formatNumber(Number(v) || 0, c.num) : String(v ?? ''));
  // exportação: valores monetários em reais (número)
  const excelRows = () => report!.rows.map((r) => r.map((v, i) => (report!.cols[i].money ? (Number(v) || 0) / 100 : v)));
  const colNames = () => report!.cols.map((c) => (c.money ? `${c.name} (R$)` : c.name));
  const file = `relatorio-${meta.label.toLowerCase().replace(/\s+/g, '-')}`;

  return (
    <div className="animate-fade-in">
      <PageHeader title="Relatórios" subtitle="Gerados a partir dos dados reais do sistema." />
      <div className="grid gap-5 lg:grid-cols-[260px_1fr]">
        <Card className="h-fit p-2">
          <nav className="flex gap-1 overflow-x-auto lg:flex-col">
            {REPORTS.map((r) => (
              <button key={r.id} onClick={() => setKind(r.id)} className={clsx('shrink-0 rounded-xl px-3 py-2 text-left transition', kind === r.id ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-950' : 'hover:bg-graphite-100 dark:hover:bg-white/5')}>
                <div className="text-sm font-medium">{r.label}</div>
                <div className={clsx('hidden text-[11px] lg:block', kind === r.id ? 'opacity-80' : 'text-graphite-500')}>{r.desc}</div>
              </button>
            ))}
          </nav>
        </Card>
        <div className="min-w-0">
          <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:items-center sm:p-4">
            <PeriodFilter value={period} onChange={setPeriod} />
            <div className="flex gap-2 sm:ml-auto">
              <Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />} disabled={!report?.rows.length} onClick={async () => (await buildReportPdf(`Relatório de ${meta.label}`, periodLabel(period), report!.cols.map((c) => c.name), report!.rows.map((r) => r.map((v, i) => display(report!.cols[i], v))), report!.summary, company, report!.cols.length > 5)).save(`${file}.pdf`)}>
                PDF
              </Button>
              <Button size="sm" variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} disabled={!report?.rows.length} onClick={() => exportXlsx(file, colNames(), excelRows(), meta.label.slice(0, 30))}>
                Excel
              </Button>
              <Button size="sm" variant="outline" disabled={!report?.rows.length} onClick={() => exportCsv(file, colNames(), excelRows())}>
                CSV
              </Button>
            </div>
          </Card>
          {!report ? (
            <LoadingBlock />
          ) : (
            <Card className="overflow-hidden">
              <div className="border-b border-graphite-100 px-5 py-4 dark:border-white/5">
                <h2 className="font-semibold">{meta.label}</h2>
                <p className="text-xs text-graphite-500">{meta.desc} · {periodLabel(period)}</p>
                {report.summary.length > 0 && (
                  <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2">
                    {report.summary.map(([l, v]) => (
                      <div key={l}>
                        <div className="text-[11px] text-graphite-500">{l}</div>
                        <div className="tabular text-sm font-semibold">{v}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {!report.rows.length ? (
                <EmptyState icon={<BarChart3 className="h-6 w-6" />} title="Sem dados no período" description="Altere o período ou o relatório." />
              ) : (
                <div className="max-h-[65vh] overflow-auto">
                  <table className="w-full min-w-[640px]">
                    <thead className="sticky top-0 bg-graphite-50 dark:bg-graphite-900">
                      <tr>
                        {report.cols.map((c) => (
                          <th key={c.name} className={clsx('th', (c.money || c.right) && 'text-right')}>{c.name}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-graphite-100 dark:divide-white/5">
                      {report.rows.map((r, i) => (
                        <tr key={i}>
                          {r.map((v, j) => (
                            <td key={j} className={clsx('td', (report.cols[j].money || report.cols[j].right) && 'tabular text-right')}>{display(report.cols[j], v)}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
