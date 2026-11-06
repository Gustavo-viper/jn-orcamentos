import { useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  Activity as ActivityIcon,
  ArrowDownCircle,
  Calculator,
  CheckCircle2,
  Clock,
  FileText,
  HardHat,
  PiggyBank,
  Plus,
  Receipt,
  TrendingUp,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  XCircle,
  Hourglass,
  CircleDollarSign,
} from 'lucide-react';
import { JOB_STATUS_LABEL, QUOTE_STATUS_LABEL, quoteDisplayStatus, todayISO } from '@jn/shared';
import { useTable } from '../lib/data';
import { useAuth } from '../lib/auth';
import { formatBRL, isoToLocalDate, relativeTime } from '../lib/format';
import { BarsChart, ChartFrame, LinesChart, lastMonths, monthLabel } from '../components/Charts';
import { Card, CardHeader, EmptyState, LoadingBlock, PageHeader, StatCard } from '../components/ui';

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
    const byMonth = (pick: (ym: string) => number) => months.map((m) => pick(m));
    const salesMonth = byMonth((m) => approved.filter((q) => isoToLocalDate(q.decidedAt ?? q.updatedAt).startsWith(m)).reduce((s, q) => s + q.total, 0));
    const inMonth = byMonth((m) => (payments ?? []).filter((p) => entMap.get(p.entryId)?.kind === 'in' && isoToLocalDate(p.paidAt).startsWith(m)).reduce((s, p) => s + p.amount, 0));
    const outMonth = byMonth((m) => (payments ?? []).filter((p) => entMap.get(p.entryId)?.kind === 'out' && isoToLocalDate(p.paidAt).startsWith(m)).reduce((s, p) => s + p.amount, 0));
    let acc = 0;
    const revenueEvolution = months.map((m, i) => ({ label: monthLabel(m), acumulado: (acc += inMonth[i]) }));

    const svcTotals = new Map<string, number>();
    approved.forEach((q) => q.calc?.environments.forEach((e) => svcTotals.set(e.serviceName, (svcTotals.get(e.serviceName) ?? 0) + e.price)));
    const cityCount = new Map<string, number>();
    clients.forEach((c) => cityCount.set(c.city || 'Não informada', (cityCount.get(c.city || 'Não informada') ?? 0) + 1));

    return {
      clients: clients.length,
      activeClients: clients.filter((c) => c.status === 'active').length,
      quotes: qs.length,
      pending: qs.filter((q) => q.ds === 'pending').length,
      approved: approved.length,
      refused: qs.filter((q) => q.ds === 'refused').length,
      expired: qs.filter((q) => q.ds === 'expired').length,
      jobsRunning: jobs.filter((j) => j.status === 'in_progress').length,
      jobsDone: jobs.filter((j) => j.status === 'completed').length,
      sold,
      received,
      toReceive,
      expenses,
      estimatedProfit,
      balance: received - spentPaid,
      salesChart: months.map((m, i) => ({ label: monthLabel(m), vendas: salesMonth[i] })),
      cashChart: months.slice(-6).map((m, i) => ({ label: monthLabel(m), entradas: inMonth[i + 6], saidas: outMonth[i + 6] })),
      revenueEvolution,
      statusChart: (['draft', 'pending', 'approved', 'refused', 'expired'] as const).map((s) => ({ label: QUOTE_STATUS_LABEL[s], total: qs.filter((q) => q.ds === s).length })),
      servicesChart: [...svcTotals.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6).map(([label, valor]) => ({ label, valor })),
      citiesChart: [...cityCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 7).map(([label, clientes]) => ({ label, clientes })),
      jobsChart: (['waiting', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled'] as const).map((s) => ({ label: JOB_STATUS_LABEL[s], obras: jobs.filter((j) => j.status === s).length })),
    };
  }, [clients, quotes, jobs, entries, payments]);

  const recent = useMemo(() => [...(activities ?? [])].filter((a) => !a.action.startsWith('auth.')).sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 12), [activities]);

  if (!d) return <LoadingBlock />;
  const first = !d.clients && !d.quotes && !(services ?? []).length;
  const hour = new Date().getHours();
  const greet = hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite';

  const quick = [
    can('clients', 'create') && { label: 'Novo cliente', icon: <UserPlus className="h-5 w-5" />, to: '/clientes?novo=1' },
    can('quotes', 'create') && { label: 'Novo orçamento', icon: <Calculator className="h-5 w-5" />, to: '/orcamentos/novo' },
    can('services', 'create') && { label: 'Novo serviço', icon: <Wrench className="h-5 w-5" />, to: '/servicos' },
    can('finance', 'create') && { label: 'Movimentação financeira', icon: <Receipt className="h-5 w-5" />, to: '/financeiro' },
    can('jobs', 'create') && { label: 'Nova ordem de serviço', icon: <HardHat className="h-5 w-5" />, to: '/obras' },
  ].filter(Boolean) as { label: string; icon: React.ReactNode; to: string }[];

  return (
    <div className="animate-fade-in space-y-6">
      <PageHeader title={`${greet}, ${user?.name.split(' ')[0]}`} subtitle="Visão geral da J&N Decorações em Gesso — dados atualizados em tempo real." />

      {quick.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-5 sm:px-0">
          {quick.map((q) => (
            <button key={q.label} onClick={() => navigate(q.to)} className="card flex min-w-[140px] items-center gap-3 px-4 py-3 text-left text-sm font-medium transition hover:-translate-y-0.5 hover:shadow-lg">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gold-100 text-gold-700 dark:bg-gold-400/10 dark:text-gold-300">{q.icon}</span>
              {q.label}
            </button>
          ))}
        </div>
      )}

      {first && (
        <Card>
          <EmptyState
            icon={<Plus className="h-6 w-6" />}
            title="Comece configurando o sistema"
            description="1) Preencha os dados da empresa em Configurações · 2) Cadastre produtos e serviços · 3) Cadastre clientes e faça o primeiro orçamento."
          />
        </Card>
      )}

      <section>
        <h2 className="mb-3 text-xs font-semibold tracking-wide text-graphite-500 uppercase">Comercial</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          <StatCard label="Total de clientes" value={d.clients} icon={<Users className="h-4 w-4" />} hint={`${d.activeClients} ativos`} onClick={() => navigate('/clientes')} />
          <StatCard label="Total de orçamentos" value={d.quotes} icon={<FileText className="h-4 w-4" />} onClick={() => navigate('/orcamentos')} />
          <StatCard label="Pendentes" value={d.pending} icon={<Clock className="h-4 w-4" />} tone="amber" />
          <StatCard label="Aprovados" value={d.approved} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
          <StatCard label="Recusados / expirados" value={`${d.refused} / ${d.expired}`} icon={<XCircle className="h-4 w-4" />} tone="red" />
          <StatCard label="Obras em andamento" value={d.jobsRunning} icon={<HardHat className="h-4 w-4" />} tone="gold" onClick={() => navigate('/obras')} />
          <StatCard label="Obras concluídas" value={d.jobsDone} icon={<CheckCircle2 className="h-4 w-4" />} tone="green" />
          <StatCard label="Total vendido" value={formatBRL(d.sold)} icon={<TrendingUp className="h-4 w-4" />} tone="blue" hint="Orçamentos aprovados" />
          <StatCard label="Lucro estimado" value={formatBRL(d.estimatedProfit)} icon={<PiggyBank className="h-4 w-4" />} tone="violet" hint="Sobre orçamentos aprovados" />
          {showFin && <StatCard label="Total recebido" value={formatBRL(d.received)} icon={<ArrowDownCircle className="h-4 w-4" />} tone="green" onClick={() => navigate('/financeiro')} />}
          {showFin && <StatCard label="A receber" value={formatBRL(d.toReceive)} icon={<Hourglass className="h-4 w-4" />} tone="amber" />}
          {showFin && <StatCard label="Despesas" value={formatBRL(d.expenses)} icon={<Receipt className="h-4 w-4" />} tone="red" />}
          {showFin && <StatCard label="Saldo financeiro" value={formatBRL(d.balance)} icon={<Wallet className="h-4 w-4" />} tone="gold" />}
          {showFin && <StatCard label="Resultado (vendido − despesas)" value={formatBRL(d.sold - d.expenses)} icon={<CircleDollarSign className="h-4 w-4" />} />}
        </div>
      </section>

      <section className="grid gap-4 lg:grid-cols-2">
        <ChartFrame title="Vendas por mês" subtitle="Orçamentos aprovados — últimos 12 meses" empty={!d.salesChart.some((x) => x.vendas)}>
          <BarsChart data={d.salesChart} keys={[{ key: 'vendas', name: 'Vendas' }]} money />
        </ChartFrame>
        <ChartFrame title="Orçamentos por situação" empty={!d.quotes}>
          <BarsChart data={d.statusChart} keys={[{ key: 'total', name: 'Orçamentos' }]} horizontal />
        </ChartFrame>
        {showFin && (
          <ChartFrame title="Entradas e saídas" subtitle="Pagamentos confirmados — últimos 6 meses" empty={!d.cashChart.some((x) => x.entradas || x.saidas)}>
            <BarsChart data={d.cashChart} keys={[{ key: 'entradas', name: 'Entradas' }, { key: 'saidas', name: 'Saídas' }]} money />
          </ChartFrame>
        )}
        {showFin && (
          <ChartFrame title="Evolução do faturamento" subtitle="Recebimentos acumulados — 12 meses" empty={!d.revenueEvolution.some((x) => x.acumulado)}>
            <LinesChart data={d.revenueEvolution} keys={[{ key: 'acumulado', name: 'Faturamento acumulado' }]} money />
          </ChartFrame>
        )}
        <ChartFrame title="Desempenho dos serviços" subtitle="Valor vendido por serviço (aprovados)" empty={!d.servicesChart.length}>
          <BarsChart data={d.servicesChart} keys={[{ key: 'valor', name: 'Vendido' }]} money horizontal />
        </ChartFrame>
        <ChartFrame title="Clientes por cidade" empty={!d.clients}>
          <BarsChart data={d.citiesChart} keys={[{ key: 'clientes', name: 'Clientes' }]} horizontal />
        </ChartFrame>
        <ChartFrame title="Obras por situação" empty={!(jobs ?? []).length}>
          <BarsChart data={d.jobsChart} keys={[{ key: 'obras', name: 'Obras' }]} />
        </ChartFrame>
        <Card>
          <CardHeader title="Atividades recentes" icon={<ActivityIcon className="h-4 w-4" />} />
          {recent.length ? (
            <ul className="max-h-[17rem] divide-y divide-graphite-100 overflow-y-auto dark:divide-white/5">
              {recent.map((a) => (
                <li key={a.id} className="flex items-start gap-3 px-5 py-2.5">
                  <span className="mt-1.5 h-2 w-2 shrink-0 rounded-full bg-gold-400" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm">{linkFor(a.entity, a.entityId) ? <Link to={linkFor(a.entity, a.entityId)!} className="hover:underline">{a.summary}</Link> : a.summary}</div>
                    <div className="text-xs text-graphite-500">{a.userName} · {relativeTime(a.createdAt)}</div>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-5 text-sm text-graphite-500">Nenhuma atividade ainda.</p>
          )}
        </Card>
      </section>
    </div>
  );
}

function linkFor(entity: string, id: string | null): string | null {
  if (!id) return null;
  return ({ clients: `/clientes/${id}`, quotes: `/orcamentos/${id}`, jobs: `/obras/${id}`, products: `/estoque/${id}`, financeEntries: '/financeiro' } as Record<string, string>)[entity] ?? null;
}
