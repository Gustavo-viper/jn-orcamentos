import { Badge, Button, GlassCard, PageHeader, StatCard } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { mockDashboard } from "@/mocks/dashboard";
import { formatCurrency, relativeTime } from "@/utils/format";
import {
  Activity, ArrowDownRight, ArrowUpRight, Calculator, CheckCircle2, FileText, HardHat,
  TrendingUp, Users, Wallet, Plus,
} from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis, Legend,
} from "recharts";

const COLORS = { gold: "#c9a24a", coffee: "#8a6240", dark: "#4f3625", light: "#d4bda1", green: "#10b981", red: "#ef4444", amber: "#f59e0b", sky: "#0ea5e9", stone: "#a8a29e" };

const tooltipStyle = { borderRadius: 16, border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.9)", backdropFilter: "blur(12px)", color: "#2b1d14", fontSize: 12 };

export default function DashboardPage() {
  const navigate = useNavigate();
  const { clients, quotes, workOrders, finance, activities } = useAppStoreShallow((state) => ({ clients: state.clients, quotes: state.quotes, workOrders: state.workOrders, finance: state.finance, activities: state.activities }));

  const stats = useMemo(() => {
    const approved = quotes.filter((q) => q.status === "aprovado");
    const sales = approved.reduce((s, q) => s + q.total, 0);
    const receivable = finance.filter((f) => f.type === "entrada" && (f.status === "pendente" || f.status === "atrasado")).reduce((s, f) => s + f.amount, 0);
    const profit = approved.reduce((s, q) => s + q.profit, 0);
    const inProgress = workOrders.filter((w) => w.status === "em_andamento").length;
    const entradas = finance.filter((f) => f.type === "entrada" && f.status === "pago").reduce((s, f) => s + f.amount, 0);
    const saidas = finance.filter((f) => f.type === "saida" && f.status === "pago").reduce((s, f) => s + f.amount, 0);
    return { approved: approved.length, sales, receivable, profit, inProgress, entradas, saidas };
  }, [quotes, finance, workOrders]);

  const quoteChart = [
    { name: "Pendentes", value: quotes.filter((q) => q.status === "pendente").length, color: COLORS.amber },
    { name: "Aprovados", value: quotes.filter((q) => q.status === "aprovado").length, color: COLORS.green },
    { name: "Recusados", value: quotes.filter((q) => q.status === "recusado").length, color: COLORS.red },
    { name: "Expirados", value: quotes.filter((q) => q.status === "expirado").length, color: COLORS.stone },
  ];
  const financeChart = [
    { name: "Entradas", value: stats.entradas, color: COLORS.green },
    { name: "Saídas", value: stats.saidas, color: COLORS.red },
    { name: "Saldo", value: stats.entradas - stats.saidas, color: COLORS.gold },
  ];
  const orderChart = [
    { name: "Aguardando", value: workOrders.filter((w) => w.status === "aguardando").length, color: COLORS.stone },
    { name: "Agendadas", value: workOrders.filter((w) => w.status === "agendada").length, color: COLORS.sky },
    { name: "Em andamento", value: workOrders.filter((w) => w.status === "em_andamento").length, color: COLORS.gold },
    { name: "Concluídas", value: workOrders.filter((w) => w.status === "concluida").length, color: COLORS.green },
  ];

  // Vendas por mês: histórico mock + mês atual com dados reais
  const salesByMonth = useMemo(() => {
    const data = [...mockDashboard.salesByMonth];
    const last = data[data.length - 1];
    last.value = Math.round(stats.sales);
    return data;
  }, [stats.sales]);

  const actIcon = { quote: FileText, order: HardHat, finance: Wallet, client: Users };

  return (
    <div>
      <PageHeader
        title="Dashboard"
        subtitle="Visão geral da J & N Decorações em Gesso"
        actions={
          <>
            <Button variant="secondary" icon={Plus} onClick={() => navigate("/clientes?novo=1")}>Novo cliente</Button>
            <Button variant="gold" icon={Calculator} onClick={() => navigate("/calculadora")}>Novo orçamento</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4 animate-fade-up">
        <StatCard icon={Users} label="Clientes" value={String(clients.length)} sub={`${clients.filter((c) => c.status === "ativo").length} ativos`} onClick={() => navigate("/clientes")} />
        <StatCard icon={FileText} label="Orçamentos" value={String(quotes.length)} sub={`${quotes.filter((q) => q.status === "pendente").length} pendentes`} tone="gold" onClick={() => navigate("/orcamentos")} />
        <StatCard icon={CheckCircle2} label="Aprovados" value={String(stats.approved)} sub={`${quotes.length ? Math.round((stats.approved / quotes.length) * 100) : 0}% de conversão`} tone="green" onClick={() => navigate("/orcamentos?status=aprovado")} />
        <StatCard icon={HardHat} label="Obras em andamento" value={String(stats.inProgress)} sub={`${workOrders.length} obras no total`} tone="blue" onClick={() => navigate("/obras")} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4 mt-3 sm:mt-4 animate-fade-up">
        <StatCard icon={TrendingUp} label="Vendas" value={formatCurrency(stats.sales)} sub="orçamentos aprovados" tone="gold" onClick={() => navigate("/relatorios")} />
        <StatCard icon={ArrowDownRight} label="A receber" value={formatCurrency(stats.receivable)} sub="pendentes + atrasados" onClick={() => navigate("/financeiro")} />
        <StatCard icon={ArrowUpRight} label="Lucro estimado" value={formatCurrency(stats.profit)} sub="margem dos aprovados" tone="green" onClick={() => navigate("/relatorios")} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <GlassCard className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-display text-lg font-semibold text-main">Vendas por mês</h3>
              <p className="text-xs text-muted">Janeiro a Junho</p>
            </div>
            <Badge tone="gold" dot>+12% vs. semestre anterior</Badge>
          </div>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesByMonth}>
                <defs>
                  <linearGradient id="gold" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={COLORS.gold} stopOpacity={0.6} />
                    <stop offset="100%" stopColor={COLORS.gold} stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,90,60,0.12)" vertical={false} />
                <XAxis dataKey="month" tick={{ fontSize: 12, fill: "#7a6554" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "#7a6554" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000)}k`} width={36} />
                <RTooltip contentStyle={tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), "Vendas"]} />
                <Area type="monotone" dataKey="value" stroke={COLORS.coffee} strokeWidth={2.5} fill="url(#gold)" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="font-display text-lg font-semibold text-main mb-1">Orçamentos</h3>
          <p className="text-xs text-muted mb-2">Distribuição por status</p>
          <div className="h-48">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie data={quoteChart} dataKey="value" innerRadius={50} outerRadius={75} paddingAngle={3} stroke="none">
                  {quoteChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Pie>
                <RTooltip contentStyle={tooltipStyle} />
              </PieChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-2">
            {quoteChart.map((q) => (
              <div key={q.name} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: q.color }} />
                <span className="text-muted">{q.name}</span>
                <span className="ml-auto font-semibold text-main">{q.value}</span>
              </div>
            ))}
          </div>
        </GlassCard>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 mt-4">
        <GlassCard className="p-5">
          <h3 className="font-display text-lg font-semibold text-main mb-1">Financeiro</h3>
          <p className="text-xs text-muted mb-3">Realizado (pagos)</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={financeChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(120,90,60,0.12)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#7a6554" }} axisLine={false} tickLine={false} />
                <YAxis hide />
                <RTooltip contentStyle={tooltipStyle} formatter={(v) => [formatCurrency(Number(v)), ""]} />
                <Bar dataKey="value" radius={[10, 10, 0, 0]}>
                  {financeChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <h3 className="font-display text-lg font-semibold text-main mb-1">Obras</h3>
          <p className="text-xs text-muted mb-3">Situação atual</p>
          <div className="h-52">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={orderChart} layout="vertical" margin={{ left: 0 }}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11, fill: "#7a6554" }} axisLine={false} tickLine={false} width={90} />
                <RTooltip contentStyle={tooltipStyle} />
                <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={18}>
                  {orderChart.map((e, i) => <Cell key={i} fill={e.color} />)}
                </Bar>
                <Legend content={() => null} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>

        <GlassCard className="p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display text-lg font-semibold text-main">Atividades recentes</h3>
            <Activity className="h-4 w-4 text-muted" />
          </div>
          <div className="space-y-3 max-h-64 overflow-y-auto pr-1">
            {activities.slice(0, 8).map((a) => {
              const I = actIcon[a.type];
              return (
                <div key={a.id} className="flex items-start gap-3">
                  <div className="glass-subtle rounded-xl p-2 shrink-0"><I className="h-4 w-4 text-coffee-600 dark:text-champagne-300" /></div>
                  <div className="min-w-0">
                    <p className="text-sm text-main leading-snug">{a.message}</p>
                    <p className="text-xs text-muted">{relativeTime(a.date)}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </GlassCard>
      </div>
    </div>
  );
}

