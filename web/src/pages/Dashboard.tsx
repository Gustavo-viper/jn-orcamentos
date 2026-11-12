import { useMemo, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  ArrowDownCircle,
  Calculator,
  Clock,
  HardHat,
  Hourglass,
  PiggyBank,
  Plus,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Wrench,
} from 'lucide-react';
import { QUOTE_STATUS_LABEL, quoteDisplayStatus, todayISO } from '@jn/shared';
import { useTable } from '../lib/data';
import { useAuth } from '../lib/auth';
import { formatBRL, isoToLocalDate, relativeTime } from '../lib/format';
import { BarsChart, lastMonths, monthLabel } from '../components/Charts';
import { Card, LoadingBlock } from '../components/ui';

const STATUS_KEYS = ['draft', 'pending', 'approved', 'refused', 'expired'] as const;

export default function Dashboard() {
  const { user, can } = useAuth();
  const navigate = useNavigate();
  const clients = useTable('clients');
  const quotes = useTable('quotes');
  const jobs = useTable('jobs');
  const entries = useTable('financeEntries');
  const payments = useTable('payments');
  const activities = useTable('activities');
  const services = useTable('services');
  const showFin = can('finance');

  const d = useMemo(() => {
    if (!clients || !quotes || !jobs) return null;
    const today = todayISO();
    const qs = quotes.map((q) => ({ ...q, ds: quoteDisplayStatus(q, today) }));
    const approved = qs.filter((q) => q.status === 'approved');
    const sold = approved.reduce((s, q) => s + q.total, 0);
    const ents = (entries ?? []).filter((e) => e.status !== 'cancelled');
    const entMap = new Map(ents.map((e) => [e.id, e]));
    let received = 0;
    let spentPaid = 0;
    for (const p of payments ?? []) {
      const e = entMap.get(p.entryId);
      if (!e) continue;
      if (e.kind === 'in') received += p.amount;
      else spentPaid += p.amount;
    }
    const toReceive = ents.filter((e) => e.kind === 'in' && e.status === 'pending').reduce((s, e) => s + e.amount - e.paidAmount, 0);
    const expenses = ents.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount, 0);
    const estimatedProfit = approved.reduce((s, q) => s + (q.calc?.estimatedProfit ?? 0), 0);
    const months = lastMonths(12);

    return {
      clients: clients.length,
      activeClients: clients.filter((c) => c.status === 'active').length,
      quotes: qs.length,
      pending: qs.filter((q) => q.ds === 'pending').length,
      approved: approved.length,
      jobsRunning: jobs.filter((j) => j.status === 'in_progress').length,
      jobsDone: jobs.filter((j) => j.status === 'completed').length,
      sold,
      received,
      toReceive,
      expenses,
      estimatedProfit,
      balance: received - spentPaid,
      salesChart: months.map((m) => ({
        label: monthLabel(m),
        vendas: approved.filter((q) => isoToLocalDate(q.decidedAt ?? q.updatedAt).startsWith(m)).reduce((s, q) => s + q.total, 0),
      })),
      statusChart: STATUS_KEYS.map((k) => ({ key: k, label: QUOTE_STATUS_LABEL[k], total: qs.filter((q) => q.ds === k).length })),
    };
  }, [clients, quotes, jobs, entries, payments]);

  const recent = useMemo(() => [...(activities ?? [])].filter((a) => !a.action.startsWith('auth.')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 5), [activities]);

  if (!d) return <LoadingBlock />;
  const first = !d.clients && !d.quotes && !(services ?? []).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';
  const today = new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' });

  const quick = [
    can('quotes', 'create') && { label: 'Orçamento', icon: <Calculator className="h-4 w-4" />, to: '/orcamentos/novo', primary: true },
    can('clients', 'create') && { label: 'Cliente', icon: <UserPlus className="h-4 w-4" />, to: '/clientes?novo=1' },
    can('services', 'create') && { label: 'Serviço', icon: <Wrench className="h-4 w-4" />, to: '/servicos' },
    can('finance', 'create') && { label: 'Financeiro', icon: <Receipt className="h-4 w-4" />, to: '/financeiro' },
    can('jobs', 'create') && { label: 'Material', icon: <HardHat className="h-4 w-4" />, to: '/obras' },
  ].filter(Boolean) as { label: string; icon: ReactNode; to: string; primary?: boolean }[];

  const tiles: TileProps[] = showFin
    ? [
        { label: 'Total vendido', value: formatBRL(d.sold), hint: `${d.approved} orçamentos aprovados`, icon: <TrendingUp className="h-4 w-4" />, tone: 'navy', to: '/orcamentos' },
        { label: 'Recebido', value: formatBRL(d.received), hint: `Lucro estimado ${formatBRL(d.estimatedProfit)}`, icon: <ArrowDownCircle className="h-4 w-4" />, tone: 'green', to: '/financeiro' },
        { label: 'A receber', value: formatBRL(d.toReceive), hint: `Despesas ${formatBRL(d.expenses)}`, icon: <Hourglass className="h-4 w-4" />, tone: 'amber', to: '/financeiro' },
        { label: 'Saldo em caixa', value: formatBRL(d.balance), hint: 'Recebido − pago', icon: <Wallet className="h-4 w-4" />, tone: 'gold', to: '/financeiro' },
      ]
    : [
        { label: 'Total vendido', value: formatBRL(d.sold), hint: `${d.approved} orçamentos aprovados`, icon: <TrendingUp className="h-4 w-4" />, tone: 'navy', to: '/orcamentos' },
        { label: 'Lucro estimado', value: formatBRL(d.estimatedProfit), hint: 'Sobre orçamentos aprovados', icon: <PiggyBank className="h-4 w-4" />, tone: 'green' },
        { label: 'Pendentes', value: String(d.pending), hint: `${d.quotes} orçamentos no total`, icon: <Clock className="h-4 w-4" />, tone: 'amber', to: '/orcamentos' },
        { label: 'Obras em andamento', value: String(d.jobsRunning), hint: `${d.jobsDone} concluídas`, icon: <HardHat className="h-4 w-4" />, tone: 'gold', to: '/obras' },
      ];

  const maxStatus = Math.max(1, ...d.statusChart.map((x) => x.total));

  return (
    <div className="animate-fade-in space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight sm:text-2xl">
            {greet}, <span className="text-gold-600 dark:text-gold-300">{user?.name.split(' ')[0]}</span>
          </h1>
          <p className="text-xs text-graphite-500 first-letter:uppercase">{today}</p>
        </div>
        {quick.length > 0 && (
          <div className="-mx-4 flex max-w-[calc(100%+2rem)] gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:max-w-full sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0">
            {quick.map((q) => (
              <button
                key={q.label}
                onClick={() => navigate(q.to)}
                className={`flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-xs font-semibold transition hover:-translate-y-0.5 active:scale-95 ${
                  q.primary
                    ? 'bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-md'
                    : 'border border-graphite-200 bg-white text-graphite-700 hover:border-gold-300 hover:text-gold-700 dark:border-white/10 dark:bg-white/[0.04] dark:text-graphite-200 dark:hover:text-gold-300'
                }`}
              >
                <Plus className="h-3 w-3 opacity-60" />
                {q.icon}
                {q.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {first && (
        <Link
          to="/configuracoes"
          className="flex items-center gap-3 rounded-2xl border border-gold-200 bg-gold-50/70 px-4 py-2.5 text-xs text-graphite-700 transition hover:border-gold-300 dark:border-gold-500/20 dark:bg-gold-500/5 dark:text-graphite-200"
        >
          <span className="shrink-0 rounded-lg bg-gold-400/20 p-1.5 text-gold-700 dark:text-gold-300">
            <Plus className="h-4 w-4" />
          </span>
          <span className="min-w-0">
            <b className="font-semibold">Comece configurando o sistema:</b> 1) dados da empresa em Configurações · 2) cadastre serviços · 3) cadastre clientes e faça o primeiro orçamento.
          </span>
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {tiles.map(({ to, ...t }) => (
          <Tile key={t.label} {...t} onClick={to ? () => navigate(to) : undefined} />
        ))}
      </div>

      <div className="grid gap-3 lg:grid-cols-3">
        <Card className="flex flex-col p-4 lg:col-span-2">
          <div className="mb-2 flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold">Vendas por mês</h2>
            <span className="text-[11px] text-graphite-500">Orçamentos aprovados · 12 meses</span>
          </div>
          {d.salesChart.some((x) => x.vendas) ? (
            <div className="h-44 lg:h-auto lg:min-h-[11rem] lg:flex-1">
              <BarsChart data={d.salesChart} keys={[{ key: 'vendas', name: 'Vendas' }]} money />
            </div>
          ) : (
            <div className="flex h-44 items-center justify-center text-sm text-graphite-500 lg:h-auto lg:min-h-[11rem] lg:flex-1">Nenhuma venda aprovada ainda.</div>
          )}
        </Card>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
          <Card className="p-3.5">
            <div className="mb-2 flex items-baseline justify-between">
              <h2 className="text-sm font-semibold">Orçamentos</h2>
              <Link to="/orcamentos" className="text-[11px] text-gold-600 hover:underline dark:text-gold-300">
                {d.quotes} no total →
              </Link>
            </div>
            <div className="space-y-1.5">
              {d.statusChart.map((x) => (
                <div key={x.key} className="flex items-center gap-2 text-xs">
                  <span className="w-20 shrink-0 truncate text-graphite-500">{x.label}</span>
                  <div className="h-2 flex-1 overflow-hidden rounded-full bg-graphite-100 dark:bg-white/10">
                    <div className={`h-full rounded-full ${BAR[x.key]}`} style={{ width: `${(x.total / maxStatus) * 100}%` }} />
                  </div>
                  <span className="tabular w-6 text-right font-semibold">{x.total}</span>
                </div>
              ))}
            </div>
            <div className="mt-2.5 flex flex-wrap gap-1.5 text-[11px]">
              <Link to="/clientes" className="flex items-center gap-1 rounded-full bg-graphite-100 px-2 py-0.5 text-graphite-600 hover:text-gold-700 dark:bg-white/5 dark:text-graphite-300">
                <Users className="h-3 w-3" /> {d.clients} clientes
              </Link>
              <Link to="/obras" className="flex items-center gap-1 rounded-full bg-graphite-100 px-2 py-0.5 text-graphite-600 hover:text-gold-700 dark:bg-white/5 dark:text-graphite-300">
                <HardHat className="h-3 w-3" /> {d.jobsRunning} em andamento · {d.jobsDone} concluídas
              </Link>
            </div>
          </Card>

          <Card className="p-3.5">
            <div className="mb-2 flex items-center gap-1.5">
              <ActivityIcon className="h-3.5 w-3.5 text-gold-500" />
              <h2 className="text-sm font-semibold">Atividades recentes</h2>
            </div>
            {recent.length ? (
              <ul className="space-y-1">
                {recent.map((a) => {
                  const to = linkFor(a.entity, a.entityId);
                  return (
                    <li key={a.id} className="flex items-center gap-2 text-xs">
                      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold-400" />
                      <span className="min-w-0 flex-1 truncate">
                        {to ? (
                          <Link to={to} className="hover:underline">
                            {a.summary}
                          </Link>
                        ) : (
                          a.summary
                        )}
                      </span>
                      <span className="shrink-0 text-[10px] text-graphite-500">{relativeTime(a.createdAt)}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="text-xs text-graphite-500">Nenhuma atividade ainda.</p>
            )}
          </Card>
        </div>
      </div>
    </div>
  );
}

const BAR: Record<string, string> = {
  draft: 'bg-graphite-400',
  pending: 'bg-gradient-to-r from-amber-300 to-amber-500',
  approved: 'bg-gradient-to-r from-emerald-400 to-emerald-600',
  refused: 'bg-gradient-to-r from-red-400 to-red-600',
  expired: 'bg-graphite-300 dark:bg-graphite-500',
};

const TILE_TONE = {
  navy: 'from-navy-800 to-navy-950 text-white',
  green: 'from-emerald-500 to-emerald-700 text-white',
  amber: 'from-amber-400 to-amber-600 text-white',
  gold: 'from-gold-300 to-gold-500 text-navy-950',
} as const;

type TileProps = { label: string; value: string; hint?: string; icon: ReactNode; tone: keyof typeof TILE_TONE; to?: string };

function Tile({ label, value, hint, icon, tone, onClick }: Omit<TileProps, 'to'> & { onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={`relative overflow-hidden rounded-2xl bg-gradient-to-br p-3.5 text-left shadow-md transition enabled:hover:-translate-y-0.5 enabled:hover:shadow-lg sm:p-4 ${TILE_TONE[tone]}`}
    >
      <span className="pointer-events-none absolute -top-6 -right-6 h-20 w-20 rounded-full bg-white/10" />
      <div className="relative flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-medium tracking-wide uppercase opacity-80">{label}</span>
        <span className="shrink-0 rounded-lg bg-white/15 p-1.5">{icon}</span>
      </div>
      <div className="tabular relative mt-1.5 truncate text-lg font-bold sm:text-2xl">{value}</div>
      {hint && <div className="relative mt-0.5 truncate text-[11px] opacity-75">{hint}</div>}
    </button>
  );
}

function linkFor(entity: string, id: string | null): string | null {
  if (!id) return null;
  return ({ clients: `/clientes/${id}`, quotes: `/orcamentos/${id}`, jobs: `/obras/${id}`, products: `/estoque/${id}`, financeEntries: '/financeiro' } as Record<string, string>)[entity] ?? null;
}
