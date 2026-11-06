import { Badge, Button, GlassCard, PageHeader, StatCard } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { formatCurrency, relativeTime } from "@/utils/format";
import { Activity, ArrowDownRight, ArrowUpRight, Calculator, CheckCircle2, Clock3, FileText, HardHat, Plus, TrendingUp, Users, Wallet } from "lucide-react";
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export default function DashboardPage(){
 const navigate=useNavigate();
 const {clients,quotes,workOrders,finance,activities}=useAppStoreShallow(s=>({clients:s.clients,quotes:s.quotes,workOrders:s.workOrders,finance:s.finance,activities:s.activities}));
 const stats=useMemo(()=>{
  const approved=quotes.filter(q=>q.status==="aprovado");
  const received=finance.filter(f=>f.type==="entrada"&&f.status==="pago").reduce((a,f)=>a+f.amount,0);
  const expenses=finance.filter(f=>f.type==="saida"&&f.status==="pago").reduce((a,f)=>a+f.amount,0);
  const pending=finance.filter(f=>f.type==="entrada"&&(f.status==="pendente"||f.status==="atrasado")).reduce((a,f)=>a+f.amount,0);
  return {approved:approved.length,sales:approved.reduce((a,q)=>a+q.total,0),profit:approved.reduce((a,q)=>a+q.profit,0),received,expenses,pending,active:workOrders.filter(w=>w.status==="em_andamento").length};
 },[quotes,finance,workOrders]);
 const chart=useMemo(()=>{
  const months=Array.from({length:6},(_,i)=>{const d=new Date();d.setMonth(d.getMonth()-5+i,1);return {key:d.toLocaleDateString("pt-BR",{month:"short"}),month:d.getMonth(),year:d.getFullYear(),value:0}});
  quotes.filter(q=>q.status==="aprovado").forEach(q=>{const d=new Date(q.createdAt);const m=months.find(x=>x.month===d.getMonth()&&x.year===d.getFullYear());if(m)m.value+=q.total});
  return months;
 },[quotes]);
 const recent=[...quotes].sort((a,b)=>new Date(b.createdAt).getTime()-new Date(a.createdAt).getTime()).slice(0,5);
 const shortcuts=[{label:"Criar orçamento",desc:"Simule materiais, medidas e valores",icon:Calculator,to:"/calculadora",primary:true},{label:"Cadastrar cliente",desc:"Organize sua carteira de clientes",icon:Users,to:"/clientes?novo=1"},{label:"Registrar movimentação",desc:"Atualize entradas e despesas",icon:Wallet,to:"/financeiro"}];
 return <div className="space-y-6">
  <PageHeader title="Painel de controle" subtitle="Acompanhe os indicadores e a operação da J&N em um só lugar." actions={<Button variant="gold" icon={Plus} onClick={()=>navigate("/calculadora")}>Novo orçamento</Button>}/>
  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border p-4" style={{background:"var(--surface)",borderColor:"var(--line)"}}>
   <div><p className="text-xs font-bold uppercase tracking-widest text-muted">Resumo operacional</p><p className="mt-1 text-sm text-main">Você tem <b>{quotes.filter(q=>q.status==="pendente").length} orçamentos aguardando retorno</b> e <b>{stats.active} obras em execução</b>.</p></div>
   <Badge tone="green" dot>Sistema operacional</Badge>
  </div>
  <div className="grid grid-cols-2 xl:grid-cols-4 gap-3">
   <StatCard icon={Users} label="Clientes cadastrados" value={String(clients.length)} sub="Base de clientes" onClick={()=>navigate("/clientes")}/>
   <StatCard icon={FileText} label="Orçamentos" value={String(quotes.length)} sub={quotes.filter(q=>q.status==="pendente").length+" aguardando"} tone="gold" onClick={()=>navigate("/orcamentos")}/>
   <StatCard icon={CheckCircle2} label="Aprovados" value={String(stats.approved)} sub="Negócios convertidos" tone="green" onClick={()=>navigate("/orcamentos?status=aprovado")}/>
   <StatCard icon={HardHat} label="Obras em andamento" value={String(stats.active)} sub={workOrders.length+" ordens registradas"} tone="blue" onClick={()=>navigate("/obras")}/>
  </div>
  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3">
   <StatCard icon={TrendingUp} label="Vendas aprovadas" value={formatCurrency(stats.sales)} sub="Valor contratado" tone="gold"/>
   <StatCard icon={ArrowDownRight} label="A receber" value={formatCurrency(stats.pending)} sub="Entradas em aberto"/>
   <StatCard icon={Wallet} label="Recebido" value={formatCurrency(stats.received)} sub="Pagamentos confirmados" tone="green"/>
   <StatCard icon={ArrowUpRight} label="Despesas pagas" value={formatCurrency(stats.expenses)} sub="Saídas confirmadas"/>
  </div>
  <div className="grid xl:grid-cols-[1.6fr_1fr] gap-4">
   <GlassCard className="p-5">
    <div className="mb-5 flex items-start justify-between"><div><h3 className="text-base font-bold text-main">Desempenho de vendas</h3><p className="text-xs text-muted mt-1">Orçamentos aprovados nos últimos seis meses</p></div><span className="rounded-lg px-3 py-1.5 text-xs font-semibold" style={{background:"var(--surface-2)",color:"var(--muted)"}}>6 meses</span></div>
    <div className="h-64"><ResponsiveContainer width="100%" height="100%"><AreaChart data={chart}><defs><linearGradient id="salesFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#c5a96d" stopOpacity={.28}/><stop offset="95%" stopColor="#c5a96d" stopOpacity={0}/></linearGradient></defs><CartesianGrid stroke="var(--line)" vertical={false}/><XAxis dataKey="key" axisLine={false} tickLine={false} tick={{fill:"var(--muted)",fontSize:11}}/><YAxis axisLine={false} tickLine={false} tick={{fill:"var(--muted)",fontSize:10}} tickFormatter={v=>v>=1000?"R$"+(v/1000).toFixed(0)+"k":String(v)}/><Tooltip formatter={(v)=>formatCurrency(Number(v))}/><Area type="monotone" dataKey="value" name="Vendas" stroke="#b49559" strokeWidth={2.5} fill="url(#salesFill)"/></AreaChart></ResponsiveContainer></div>
   </GlassCard>
   <GlassCard className="p-5"><div className="mb-4"><h3 className="text-base font-bold text-main">Ações rápidas</h3><p className="text-xs text-muted mt-1">Acesse as tarefas mais usadas</p></div><div className="space-y-2">{shortcuts.map(x=><button key={x.label} onClick={()=>navigate(x.to)} className="flex w-full items-center gap-3 rounded-xl border p-3 text-left transition hover:shadow-sm" style={{borderColor:"var(--line)",background:"var(--surface-2)"}}><span className="grid h-10 w-10 place-items-center rounded-xl" style={{background:x.primary?"var(--brand)":"var(--surface)",color:x.primary?"white":"var(--brand)"}}><x.icon size={19}/></span><span className="min-w-0 flex-1"><b className="block text-sm text-main">{x.label}</b><small className="block text-xs text-muted mt-1">{x.desc}</small></span><Plus size={16} className="text-muted"/></button>)}</div></GlassCard>
  </div>
  <div className="grid xl:grid-cols-[1.35fr_1fr] gap-4">
   <GlassCard className="overflow-hidden"><div className="flex items-center justify-between p-5"><div><h3 className="font-bold text-main">Orçamentos recentes</h3><p className="text-xs text-muted mt-1">Últimas movimentações comerciais</p></div><button className="text-xs font-semibold" style={{color:"var(--brand)"}} onClick={()=>navigate("/orcamentos")}>Ver todos →</button></div>
    {recent.length?recent.map(q=><button key={q.id} onClick={()=>navigate("/orcamentos/"+q.id)} className="flex w-full items-center gap-3 border-t px-5 py-3 text-left hover:bg-black/[.02]" style={{borderColor:"var(--line)"}}><span className="grid h-9 w-9 place-items-center rounded-lg" style={{background:"var(--surface-2)",color:"var(--brand)"}}><FileText size={17}/></span><span className="min-w-0 flex-1"><b className="block text-sm text-main">#{q.number} · {q.clientName}</b><small className="text-xs text-muted">{new Date(q.createdAt).toLocaleDateString("pt-BR")}</small></span><span className="text-sm font-bold text-main">{formatCurrency(q.total)}</span></button>):<p className="p-8 text-center text-sm text-muted">Nenhum orçamento cadastrado.</p>}
   </GlassCard>
   <GlassCard className="p-5"><div className="mb-4"><h3 className="font-bold text-main">Atividade recente</h3><p className="text-xs text-muted mt-1">Ações registradas no sistema</p></div><div className="space-y-4">{activities.slice(0,6).map(a=><div key={a.id} className="flex gap-3"><span className="mt-1 h-2 w-2 rounded-full bg-amber-500"/><div className="min-w-0"><p className="text-sm text-main">{a.message}</p><small className="text-xs text-muted">{relativeTime(a.date)}</small></div></div>)}{!activities.length&&<p className="text-sm text-muted">As atividades aparecerão aqui.</p>}</div></GlassCard>
  </div>
 </div>
}
