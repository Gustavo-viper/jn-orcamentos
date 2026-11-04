import { Badge, Button, Field, GlassCard, Input, PageHeader, StatCard, Table, Td, Th } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import { mockDashboard } from "@/mocks/dashboard";
import { cn } from "@/utils/cn";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { BarChart3, Download, FileSpreadsheet, FileText, HardHat, TrendingUp, Users, Wallet, Wrench } from "lucide-react";
import { useMemo, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Line, LineChart, Pie, PieChart, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";

type Period = "hoje" | "semana" | "mes" | "ano" | "custom";
type Report = "vendas" | "orcamentos" | "clientes" | "materiais" | "obras" | "financeiro" | "lucro";

const reports: { key: Report; label: string; icon: React.ElementType }[] = [
  { key: "vendas", label: "Vendas", icon: TrendingUp }, { key: "orcamentos", label: "Orçamentos", icon: FileText }, { key: "clientes", label: "Clientes", icon: Users },
  { key: "materiais", label: "Materiais", icon: Wrench }, { key: "obras", label: "Obras", icon: HardHat }, { key: "financeiro", label: "Financeiro", icon: Wallet }, { key: "lucro", label: "Lucro", icon: BarChart3 },
];
const tooltipStyle = { borderRadius: 16, border: "1px solid rgba(255,255,255,0.6)", background: "rgba(255,255,255,0.92)", color: "#2b1d14", fontSize: 12 };
const PALETTE = ["#c9a24a", "#8a6240", "#4f3625", "#d4bda1", "#a67c52", "#ebd29a", "#6e4c33"];

export default function ReportsPage() {
  const { quotes, clients, workOrders, finance } = useAppStore();
  const [report, setReport] = useState<Report>("vendas");
  const [period, setPeriod] = useState<Period>("mes");
  const [from, setFrom] = useState(new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const range = useMemo(() => {
    const now = new Date(); const start = new Date();
    if (period === "hoje") start.setHours(0, 0, 0, 0);
    else if (period === "semana") start.setDate(now.getDate() - 7);
    else if (period === "mes") start.setDate(now.getDate() - 30);
    else if (period === "ano") start.setFullYear(now.getFullYear() - 1);
    else return { start: new Date(from), end: new Date(to + "T23:59:59") };
    return { start, end: now };
  }, [period, from, to]);
  const inRange = (iso: string) => { const t = new Date(iso).getTime(); return t >= range.start.getTime() && t <= range.end.getTime(); };

  const fq = quotes.filter((q) => inRange(q.createdAt));
  const approved = fq.filter((q) => q.status === "aprovado");
  const ff = finance.filter((f) => inRange(f.dueDate));
  const fo = workOrders.filter((w) => inRange(w.createdAt));

  const exportCsv = () => {
    const rows = [["Relatorio", report], ["Periodo", `${formatDate(range.start.toISOString())} a ${formatDate(range.end.toISOString())}`], [], ["Numero", "Cliente", "Status", "Total"], ...fq.map((q) => [q.number, q.clientName, q.status, q.total.toFixed(2)])];
    const csv = rows.map((r) => r.join(";")).join("\n");
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = `relatorio-${report}.csv`; a.click();
    toast.success("CSV exportado", `relatorio-${report}.csv`);
  };

  // Agregações
  const matUse = useMemo(() => {
    const map = new Map<string, { name: string; qty: number; unit: string; cost: number }>();
    approved.forEach((q) => q.items.forEach((i) => i.materials.forEach((m) => { const c = map.get(m.productId); map.set(m.productId, { name: m.productName, unit: m.unit, qty: (c?.qty || 0) + m.quantity, cost: (c?.cost || 0) + m.total }); })));
    return Array.from(map.values()).sort((a, b) => b.cost - a.cost);
  }, [approved]);
  const byService = useMemo(() => { const m = new Map<string, number>(); approved.forEach((q) => q.items.forEach((i) => m.set(i.serviceName, (m.get(i.serviceName) || 0) + i.laborTotal + i.materialsCost))); return Array.from(m, ([name, value]) => ({ name, value })); }, [approved]);
  const byCity = useMemo(() => { const m = new Map<string, number>(); clients.forEach((c) => m.set(c.city, (m.get(c.city) || 0) + 1)); return Array.from(m, ([name, value]) => ({ name, value })); }, [clients]);

  const sales = approved.reduce((s, q) => s + q.total, 0);
  const profit = approved.reduce((s, q) => s + q.profit, 0);
  const costs = approved.reduce((s, q) => s + q.totalCost, 0);
  const paidIn = ff.filter((f) => f.type === "entrada" && f.status === "pago").reduce((s, f) => s + f.amount, 0);
  const paidOut = ff.filter((f) => f.type === "saida" && f.status === "pago").reduce((s, f) => s + f.amount, 0);

  return (
    <div>
      <PageHeader title="Relatórios" subtitle="Análises e exportações" actions={<><Button variant="secondary" icon={FileSpreadsheet} onClick={exportCsv}>Exportar CSV</Button><Button variant="gold" icon={Download} onClick={() => { toast.info("Gerando PDF…", "Use 'Salvar como PDF' na janela de impressão."); setTimeout(() => window.print(), 300); }}>Exportar PDF</Button></>} />

      <div className="grid lg:grid-cols-4 gap-4">
        <GlassCard className="p-3 space-y-1 no-print">
          {reports.map((r) => <button key={r.key} onClick={() => setReport(r.key)} className={cn("w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium cursor-pointer transition-all", report === r.key ? "coffee-gradient text-white shadow-md" : "text-main hover:bg-white/50 dark:hover:bg-white/10")}><r.icon className="h-4 w-4" />{r.label}</button>)}
        </GlassCard>

        <div className="lg:col-span-3 space-y-4">
          <GlassCard className="p-4 no-print">
            <div className="flex flex-wrap items-end gap-2">
              {(["hoje", "semana", "mes", "ano", "custom"] as Period[]).map((p) => <button key={p} onClick={() => setPeriod(p)} className={cn("rounded-xl px-3.5 py-2 text-sm font-medium cursor-pointer capitalize", period === p ? "gold-gradient text-coffee-950" : "glass-subtle text-main")}>{p === "custom" ? "Personalizado" : p === "mes" ? "Mês" : p}</button>)}
              {period === "custom" && <><Field label="De"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field><Field label="Até"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></>}
              <span className="ml-auto text-xs text-muted">{formatDate(range.start.toISOString())} → {formatDate(range.end.toISOString())}</span>
            </div>
          </GlassCard>

          <div className="print-area">
          <h2 className="font-display text-xl font-semibold text-main mb-3 capitalize">Relatório de {reports.find((r) => r.key === report)?.label}</h2>

          {report === "vendas" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"><StatCard icon={TrendingUp} label="Vendas" value={formatCurrency(sales)} tone="gold" /><StatCard icon={FileText} label="Aprovados" value={String(approved.length)} tone="green" /><StatCard icon={BarChart3} label="Ticket médio" value={formatCurrency(approved.length ? sales / approved.length : 0)} /><StatCard icon={Users} label="Conversão" value={`${fq.length ? Math.round(approved.length / fq.length * 100) : 0}%`} /></div>
            <GlassCard className="p-5"><p className="font-semibold text-main mb-3">Evolução mensal</p><div className="h-64"><ResponsiveContainer><LineChart data={mockDashboard.salesByMonth}><CartesianGrid strokeDasharray="3 3" stroke="rgba(120,90,60,0.12)" /><XAxis dataKey="month" tick={{ fontSize: 12 }} /><YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `${v / 1000}k`} width={40} /><RTooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} /><Line type="monotone" dataKey="value" stroke="#8a6240" strokeWidth={3} dot={{ fill: "#c9a24a", r: 5 }} /></LineChart></ResponsiveContainer></div></GlassCard>
            <GlassCard className="p-5 mt-4"><p className="font-semibold text-main mb-3">Vendas por serviço</p><div className="h-56"><ResponsiveContainer><BarChart data={byService}><XAxis dataKey="name" tick={{ fontSize: 10 }} interval={0} /><YAxis hide /><RTooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} /><Bar dataKey="value" radius={[8, 8, 0, 0]}>{byService.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Bar></BarChart></ResponsiveContainer></div></GlassCard>
          </>)}

          {report === "orcamentos" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{(["pendente", "aprovado", "recusado", "expirado"] as const).map((s) => <StatCard key={s} icon={FileText} label={s} value={String(fq.filter((q) => q.status === s).length)} tone={s === "aprovado" ? "green" : s === "recusado" ? "red" : s === "pendente" ? "gold" : "coffee"} />)}</div>
            <GlassCard className="p-5"><Table><thead><tr><Th>Nº</Th><Th>Cliente</Th><Th>Serviço</Th><Th>Data</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead><tbody>{fq.map((q) => <tr key={q.id}><Td>#{q.number}</Td><Td>{q.clientName}</Td><Td className="text-muted">{q.items.map((i) => i.serviceName).join(", ")}</Td><Td className="text-muted">{formatDate(q.createdAt)}</Td><Td className="text-right font-medium">{formatCurrency(q.total)}</Td><Td><Badge tone={q.status === "aprovado" ? "success" : q.status === "pendente" ? "warning" : q.status === "recusado" ? "danger" : "neutral"}>{q.status}</Badge></Td></tr>)}</tbody></Table></GlassCard>
          </>)}

          {report === "clientes" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3 mb-4"><StatCard icon={Users} label="Total" value={String(clients.length)} /><StatCard icon={Users} label="Novos no período" value={String(clients.filter((c) => inRange(c.createdAt)).length)} tone="gold" /><StatCard icon={Users} label="Ativos" value={String(clients.filter((c) => c.status === "ativo").length)} tone="green" /></div>
            <div className="grid md:grid-cols-2 gap-4">
              <GlassCard className="p-5"><p className="font-semibold text-main mb-3">Clientes por cidade</p><div className="h-56"><ResponsiveContainer><PieChart><Pie data={byCity} dataKey="value" nameKey="name" outerRadius={80} label={(e) => e.name}>{byCity.map((_, i) => <Cell key={i} fill={PALETTE[i % PALETTE.length]} />)}</Pie><RTooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer></div></GlassCard>
              <GlassCard className="p-5"><p className="font-semibold text-main mb-3">Top clientes (aprovados)</p>{clients.map((c) => ({ c, v: quotes.filter((q) => q.clientId === c.id && q.status === "aprovado").reduce((s, q) => s + q.total, 0) })).sort((a, b) => b.v - a.v).slice(0, 6).map(({ c, v }) => <div key={c.id} className="flex justify-between text-sm py-1.5 border-b border-white/30"><span className="text-main">{c.name}</span><span className="font-semibold text-main">{formatCurrency(v)}</span></div>)}</GlassCard>
            </div>
          </>)}


          {report === "materiais" && (
            <GlassCard className="p-5"><p className="font-semibold text-main mb-1">Consumo de materiais em orçamentos aprovados</p><p className="text-xs text-muted mb-3">{approved.length} orçamentos no período</p>
              {matUse.length === 0 ? <p className="text-sm text-muted">Sem dados no período.</p> : <><div className="h-56 mb-4"><ResponsiveContainer><BarChart data={matUse.slice(0, 8)} layout="vertical"><XAxis type="number" hide /><YAxis type="category" dataKey="name" width={160} tick={{ fontSize: 10 }} /><RTooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} /><Bar dataKey="cost" radius={[0, 8, 8, 0]} fill="#8a6240" /></BarChart></ResponsiveContainer></div>
              <Table><thead><tr><Th>Material</Th><Th className="text-right">Quantidade</Th><Th className="text-right">Custo</Th></tr></thead><tbody>{matUse.map((m) => <tr key={m.name}><Td>{m.name}</Td><Td className="text-right">{formatNumber(m.qty, m.unit === "un" ? 0 : 2)} {m.unit}</Td><Td className="text-right font-medium">{formatCurrency(m.cost)}</Td></tr>)}</tbody></Table></>}
            </GlassCard>
          )}

          {report === "obras" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">{(["aguardando", "agendada", "em_andamento", "concluida"] as const).map((s) => <StatCard key={s} icon={HardHat} label={s.replace("_", " ")} value={String(workOrders.filter((w) => w.status === s).length)} tone={s === "concluida" ? "green" : s === "em_andamento" ? "gold" : "coffee"} />)}</div>
            <GlassCard className="p-5"><Table><thead><tr><Th>OS</Th><Th>Cliente</Th><Th>Serviço</Th><Th>Equipe</Th><Th>Início</Th><Th>Previsão</Th><Th>Status</Th></tr></thead><tbody>{(fo.length ? fo : workOrders).map((w) => <tr key={w.id}><Td className="font-semibold">{w.number}</Td><Td>{w.clientName}</Td><Td className="text-muted">{w.serviceName}</Td><Td className="text-muted">{w.team}</Td><Td>{formatDate(w.startDate)}</Td><Td>{formatDate(w.expectedEnd)}</Td><Td><Badge tone={w.status === "concluida" ? "success" : w.status === "cancelada" ? "danger" : w.status === "em_andamento" ? "gold" : "neutral"}>{w.status.replace("_", " ")}</Badge></Td></tr>)}</tbody></Table></GlassCard>
          </>)}

          {report === "financeiro" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"><StatCard icon={Wallet} label="Entradas" value={formatCurrency(paidIn)} tone="green" /><StatCard icon={Wallet} label="Saídas" value={formatCurrency(paidOut)} tone="red" /><StatCard icon={Wallet} label="Saldo" value={formatCurrency(paidIn - paidOut)} tone="gold" /><StatCard icon={Wallet} label="Em aberto" value={formatCurrency(ff.filter((f) => f.status === "pendente" || f.status === "atrasado").reduce((s, f) => s + f.amount, 0))} /></div>
            <GlassCard className="p-5"><div className="h-56"><ResponsiveContainer><BarChart data={[{ name: "Entradas", value: paidIn }, { name: "Saídas", value: paidOut }, { name: "Saldo", value: paidIn - paidOut }]}><XAxis dataKey="name" /><YAxis hide /><RTooltip contentStyle={tooltipStyle} formatter={(v) => formatCurrency(Number(v))} /><Bar dataKey="value" radius={[8, 8, 0, 0]}><Cell fill="#10b981" /><Cell fill="#ef4444" /><Cell fill="#c9a24a" /></Bar></BarChart></ResponsiveContainer></div></GlassCard>
          </>)}

          {report === "lucro" && (<>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4"><StatCard icon={TrendingUp} label="Receita" value={formatCurrency(sales)} tone="gold" /><StatCard icon={Wallet} label="Custos" value={formatCurrency(costs)} tone="red" /><StatCard icon={BarChart3} label="Lucro estimado" value={formatCurrency(profit)} tone="green" /><StatCard icon={BarChart3} label="Margem média" value={`${approved.length ? Math.round(approved.reduce((s, q) => s + q.marginPercent, 0) / approved.length) : 0}%`} /></div>
            <GlassCard className="p-5"><Table><thead><tr><Th>Orçamento</Th><Th>Cliente</Th><Th className="text-right">Materiais</Th><Th className="text-right">Mão de obra</Th><Th className="text-right">Margem</Th><Th className="text-right">Lucro</Th><Th className="text-right">Total</Th></tr></thead><tbody>{approved.map((q) => <tr key={q.id}><Td>#{q.number}</Td><Td>{q.clientName}</Td><Td className="text-right text-muted">{formatCurrency(q.materialsCost)}</Td><Td className="text-right text-muted">{formatCurrency(q.laborCost)}</Td><Td className="text-right">{q.marginPercent}%</Td><Td className="text-right font-semibold text-emerald-700">{formatCurrency(q.profit)}</Td><Td className="text-right font-semibold">{formatCurrency(q.total)}</Td></tr>)}</tbody></Table></GlassCard>
          </>)}
          </div>
        </div>
      </div>
    </div>
  );
}
