import { Badge, Button, EmptyState, Field, GlassCard, Input, Modal, PageHeader, Select, Textarea, orderStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import type { WorkOrderStatus } from "@/types";
import { cn } from "@/utils/cn";
import { addDays, formatCurrency, formatDate, formatDateTime, formatNumber } from "@/utils/format";
import { Calendar, CheckCircle2, Clock, HardHat, MapPin, Pause, Play, Plus, Users, X, XCircle, type LucideIcon } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

const flow: WorkOrderStatus[] = ["aguardando", "agendada", "em_andamento", "pausada", "concluida", "cancelada"];

export default function WorkOrdersPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { workOrders, clients, quotes, updateWorkOrderStatus, updateWorkOrder, createWorkOrder } = useAppStoreShallow((state) => ({ workOrders: state.workOrders, clients: state.clients, quotes: state.quotes, updateWorkOrderStatus: state.updateWorkOrderStatus, updateWorkOrder: state.updateWorkOrder, createWorkOrder: state.createWorkOrder }));
  const [filter, setFilter] = useState<"todas" | WorkOrderStatus>("todas");
  const [selected, setSelected] = useState<string | null>(id || null);
  const [statusModal, setStatusModal] = useState<WorkOrderStatus | null>(null);
  const [note, setNote] = useState("");
  const [newOpen, setNewOpen] = useState(false);
  const [editTeam, setEditTeam] = useState(false);

  useEffect(() => {
    setSelected(id ?? null);
    setStatusModal(null);
    setEditTeam(false);
  }, [id]);

  const list = useMemo(() => workOrders.filter((w) => filter === "todas" || w.status === filter), [workOrders, filter]);
  const wo = workOrders.find((w) => w.id === selected);

  const counts = flow.reduce((acc, s) => ({ ...acc, [s]: workOrders.filter((w) => w.status === s).length }), {} as Record<string, number>);

  const nextActions = (s: WorkOrderStatus): { status: WorkOrderStatus; label: string; icon: LucideIcon; variant: "primary" | "success" | "secondary" | "danger" }[] => {
    switch (s) {
      case "aguardando": return [{ status: "agendada", label: "Agendar", icon: Calendar, variant: "primary" }, { status: "cancelada", label: "Cancelar", icon: XCircle, variant: "danger" }];
      case "agendada": return [{ status: "em_andamento", label: "Iniciar obra", icon: Play, variant: "success" }, { status: "cancelada", label: "Cancelar", icon: XCircle, variant: "danger" }];
      case "em_andamento": return [{ status: "pausada", label: "Pausar", icon: Pause, variant: "secondary" }, { status: "concluida", label: "Concluir", icon: CheckCircle2, variant: "success" }];
      case "pausada": return [{ status: "em_andamento", label: "Retomar", icon: Play, variant: "success" }, { status: "cancelada", label: "Cancelar", icon: XCircle, variant: "danger" }];
      default: return [];
    }
  };

  return (
    <div>
      <PageHeader title="Obras / Ordens de Serviço" subtitle={`${workOrders.length} ordens · ${counts.em_andamento || 0} em andamento`} actions={<Button variant="gold" icon={Plus} onClick={() => setNewOpen(true)}>Nova OS</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        <button onClick={() => setFilter("todas")} className={cn("rounded-xl px-3.5 py-2 text-sm font-medium cursor-pointer", filter === "todas" ? "coffee-gradient text-white" : "glass text-main")}>Todas <span className="opacity-70">{workOrders.length}</span></button>
        {flow.map((s) => <button key={s} onClick={() => setFilter(s)} className={cn("rounded-xl px-3.5 py-2 text-sm font-medium cursor-pointer", filter === s ? "coffee-gradient text-white" : "glass text-main")}>{orderStatusMeta[s].label} <span className="opacity-70">{counts[s]}</span></button>)}
      </div>

      <div className="grid lg:grid-cols-5 gap-4">
        <div className="lg:col-span-2 space-y-2 lg:max-h-[75vh] lg:overflow-y-auto pr-1">
          {list.length === 0 ? <GlassCard><EmptyState icon={HardHat} title="Nenhuma obra encontrada." description="Aprove um orçamento para gerar uma OS automaticamente." action={<Button variant="gold" onClick={() => navigate("/orcamentos")}>Ver orçamentos</Button>} /></GlassCard> :
            list.map((w) => (
              <GlassCard key={w.id} hover className={cn("p-4 cursor-pointer", selected === w.id && "ring-2 ring-champagne-500/70")} onClick={() => { setSelected(w.id); navigate(`/obras/${w.id}`, { replace: true }); }}>
                <div className="flex items-start justify-between gap-2">
                  <div><p className="text-xs text-muted">{w.number} · Orç. #{w.quoteNumber}</p><p className="font-semibold text-main">{w.clientName}</p><p className="text-sm text-muted">{w.serviceName}</p></div>
                  <Badge tone={orderStatusMeta[w.status].tone} dot>{orderStatusMeta[w.status].label}</Badge>
                </div>
                <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-muted"><span className="flex items-center gap-1"><Users className="h-3 w-3" />{w.team}</span><span className="flex items-center gap-1"><Calendar className="h-3 w-3" />{formatDate(w.startDate)} → {formatDate(w.expectedEnd)}</span></div>
              </GlassCard>
            ))}
        </div>

        <div className="lg:col-span-3">
          {!wo ? <GlassCard className="h-full"><EmptyState icon={HardHat} title="Selecione uma obra" description="Clique em uma OS ao lado para ver detalhes, materiais e timeline." /></GlassCard> : (
            <GlassCard strong className="p-5 animate-fade-up">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.2em] text-muted">{wo.number}</p>
                  <h2 className="font-display text-2xl font-semibold text-main">{wo.clientName}</h2>
                  <p className="text-sm text-muted">{wo.serviceName}</p>
                </div>
                <Badge tone={orderStatusMeta[wo.status].tone} dot className="text-sm px-3 py-1">{orderStatusMeta[wo.status].label}</Badge>
              </div>

              <div className="grid sm:grid-cols-2 gap-3 mt-4 text-sm">
                <div className="glass-subtle rounded-2xl p-3"><p className="text-[10px] uppercase text-muted flex items-center gap-1"><MapPin className="h-3 w-3" />Endereço</p><p className="text-main">{wo.address}</p></div>
                <div className="glass-subtle rounded-2xl p-3 flex items-start justify-between gap-2"><div><p className="text-[10px] uppercase text-muted flex items-center gap-1"><Users className="h-3 w-3" />Equipe</p><p className="text-main">{wo.team}</p></div><Button size="sm" variant="ghost" onClick={() => setEditTeam(true)}>Editar</Button></div>
                <div className="glass-subtle rounded-2xl p-3"><p className="text-[10px] uppercase text-muted flex items-center gap-1"><Calendar className="h-3 w-3" />Início</p><p className="text-main">{formatDate(wo.startDate)}</p></div>
                <div className="glass-subtle rounded-2xl p-3"><p className="text-[10px] uppercase text-muted flex items-center gap-1"><Clock className="h-3 w-3" />Previsão de conclusão</p><p className="text-main">{formatDate(wo.expectedEnd)}</p></div>
                <div className="glass-subtle rounded-2xl p-3"><p className="text-[10px] uppercase text-muted">Orçamento</p><button className="text-coffee-700 dark:text-champagne-300 font-semibold cursor-pointer" onClick={() => wo.quoteId && navigate(`/orcamentos/${wo.quoteId}`)}>#{wo.quoteNumber} — {formatCurrency(wo.total)}</button></div>
                <div className="glass-subtle rounded-2xl p-3"><p className="text-[10px] uppercase text-muted">Criada em</p><p className="text-main">{formatDateTime(wo.createdAt)}</p></div>
              </div>

              {nextActions(wo.status).length > 0 && (
                <div className="flex flex-wrap gap-2 mt-4">
                  {nextActions(wo.status).map((a) => <Button key={a.status} variant={a.variant} icon={a.icon} onClick={() => { setStatusModal(a.status); setNote(""); }}>{a.label}</Button>)}
                </div>
              )}

              {/* Progress stepper */}
              <div className="mt-6">
                <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Progresso</p>
                <div className="flex items-center">
                  {(["aguardando", "agendada", "em_andamento", "concluida"] as WorkOrderStatus[]).map((s, i, arr) => {
                    const order = ["aguardando", "agendada", "em_andamento", "concluida"];
                    const cur = wo.status === "pausada" ? 2 : wo.status === "cancelada" ? -1 : order.indexOf(wo.status);
                    const done = i <= cur;
                    return (
                      <div key={s} className="flex items-center flex-1 last:flex-none">
                        <div className="flex flex-col items-center">
                          <div className={cn("h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold", done ? "gold-gradient text-coffee-950" : "glass-subtle text-muted")}>{done ? "✓" : i + 1}</div>
                          <span className="text-[10px] text-muted mt-1 whitespace-nowrap hidden sm:block">{orderStatusMeta[s].label}</span>
                        </div>
                        {i < arr.length - 1 && <div className={cn("h-1 flex-1 mx-1 rounded-full", i < cur ? "gold-gradient" : "bg-white/40 dark:bg-white/10")} />}
                      </div>
                    );
                  })}
                </div>
              </div>

              <div className="grid md:grid-cols-2 gap-4 mt-6">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Materiais reservados</p>
                  <div className="space-y-1.5">
                    {wo.materials.map((m, i) => <div key={i} className="glass-subtle rounded-xl px-3 py-2 flex justify-between text-sm"><span className="text-main">{m.productName}</span><span className="font-semibold text-main">{formatNumber(m.quantity, m.unit === "un" ? 0 : 2)} {m.unit}</span></div>)}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Timeline</p>
                  <ol className="relative border-l-2 border-champagne-400/50 ml-2 space-y-4">
                    {[...wo.timeline].reverse().map((ev) => (
                      <li key={ev.id} className="ml-4">
                        <span className={cn("absolute -left-[9px] h-4 w-4 rounded-full ring-4 ring-white/50", ev.status === "concluida" ? "bg-emerald-500" : ev.status === "cancelada" ? "bg-red-500" : ev.status === "pausada" ? "bg-amber-500" : "bg-champagne-500")} />
                        <p className="text-sm font-medium text-main">{ev.title}</p>
                        <p className="text-xs text-muted">{formatDateTime(ev.date)}</p>
                        {ev.description && <p className="text-xs text-muted mt-0.5">{ev.description}</p>}
                      </li>
                    ))}
                  </ol>
                </div>
              </div>
            </GlassCard>
          )}
        </div>
      </div>

      {wo && statusModal && (
        <Modal open onClose={() => setStatusModal(null)} title={`${orderStatusMeta[statusModal].label} — ${wo.number}`} description="Confirme a alteração de status. Você pode adicionar uma observação à timeline."
          footer={<><Button variant="secondary" onClick={() => setStatusModal(null)}>Cancelar</Button><Button variant={statusModal === "cancelada" ? "danger" : "success"} onClick={async () => { await updateWorkOrderStatus(wo.id, statusModal, note || undefined); setStatusModal(null); toast.success("Status atualizado", orderStatusMeta[statusModal].label); }}>Confirmar</Button></>}>
          <Field label="Observação (opcional)"><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: Cliente solicitou iniciar pela sala." /></Field>
        </Modal>
      )}

      {wo && editTeam && (
        <TeamModal initial={{ team: wo.team, startDate: wo.startDate.slice(0, 10), expectedEnd: wo.expectedEnd.slice(0, 10) }} onClose={() => setEditTeam(false)} onSave={async (d) => { await updateWorkOrder(wo.id, { team: d.team, startDate: new Date(d.startDate).toISOString(), expectedEnd: new Date(d.expectedEnd).toISOString() }); setEditTeam(false); toast.success("Obra atualizada"); }} />
      )}

      {newOpen && (
        <NewOrderModal onClose={() => setNewOpen(false)} clients={clients} quotes={quotes.filter((q) => q.status === "aprovado")} onSave={async (d) => {
          const client = clients.find((c) => c.id === d.clientId);
          const quote = quotes.find((q) => q.id === d.quoteId);
          const w = await createWorkOrder({
            quoteId: quote?.id, quoteNumber: quote?.number || "—", clientId: d.clientId, clientName: client?.name || "", address: client ? `${client.address}, ${client.number} — ${client.district}, ${client.city}/${client.state}` : "—",
            serviceName: quote ? quote.items.map((i) => i.serviceName).join(", ") : d.serviceName, team: d.team, startDate: new Date(d.startDate).toISOString(), expectedEnd: new Date(d.expectedEnd).toISOString(), status: "aguardando",
            materials: quote ? quote.items.flatMap((i) => i.materials.map((m) => ({ productName: m.productName, quantity: m.quantity, unit: m.unit }))) : [], total: quote?.total || 0, notes: d.notes,
          });
          setNewOpen(false); setSelected(w.id); toast.success("OS criada", w.number);
        }} />
      )}
    </div>
  );
}

function TeamModal({ initial, onClose, onSave }: { initial: { team: string; startDate: string; expectedEnd: string }; onClose: () => void; onSave: (d: typeof initial) => Promise<void> }) {
  const [f, setF] = useState(initial);
  return (
    <Modal open onClose={onClose} title="Equipe e datas" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="gold" onClick={() => onSave(f)}>Salvar</Button></>}>
      <div className="space-y-4">
        <Field label="Equipe"><Select value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}><option>A definir</option><option>Equipe A — Marcos e Júlio</option><option>Equipe B — Rafael e Tiago</option><option>Equipe C — Ednaldo e Pedro</option></Select></Field>
        <div className="grid grid-cols-2 gap-4"><Field label="Início"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field><Field label="Previsão"><Input type="date" value={f.expectedEnd} onChange={(e) => setF({ ...f, expectedEnd: e.target.value })} /></Field></div>
      </div>
    </Modal>
  );
}

function NewOrderModal({ onClose, clients, quotes, onSave }: { onClose: () => void; clients: { id: string; name: string }[]; quotes: { id: string; number: string; clientId: string; clientName: string }[]; onSave: (d: { clientId: string; quoteId: string; serviceName: string; team: string; startDate: string; expectedEnd: string; notes: string }) => Promise<void> }) {
  const [f, setF] = useState({ clientId: clients[0]?.id || "", quoteId: "", serviceName: "", team: "A definir", startDate: addDays(1).slice(0, 10), expectedEnd: addDays(7).slice(0, 10), notes: "" });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={onClose} title="Nova ordem de serviço" size="lg" footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="gold" loading={busy} onClick={async () => { if (!f.clientId) return toast.error("Selecione o cliente"); setBusy(true); await onSave(f); setBusy(false); }}>Criar OS</Button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Cliente"><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value, quoteId: "" })}>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Orçamento aprovado (opcional)"><Select value={f.quoteId} onChange={(e) => setF({ ...f, quoteId: e.target.value })}><option value="">Sem vínculo</option>{quotes.filter((q) => q.clientId === f.clientId).map((q) => <option key={q.id} value={q.id}>#{q.number}</option>)}</Select></Field>
        {!f.quoteId && <Field label="Serviço" className="sm:col-span-2"><Input value={f.serviceName} onChange={(e) => setF({ ...f, serviceName: e.target.value })} placeholder="Ex.: Forro de gesso — sala" /></Field>}
        <Field label="Equipe"><Select value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })}><option>A definir</option><option>Equipe A — Marcos e Júlio</option><option>Equipe B — Rafael e Tiago</option><option>Equipe C — Ednaldo e Pedro</option></Select></Field>
        <div className="grid grid-cols-2 gap-4"><Field label="Início"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field><Field label="Previsão"><Input type="date" value={f.expectedEnd} onChange={(e) => setF({ ...f, expectedEnd: e.target.value })} /></Field></div>
        <Field label="Observações" className="sm:col-span-2"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="min-h-[60px]" /></Field>
      </div>
      <p className="text-xs text-muted mt-3 flex items-center gap-1"><X className="h-3 w-3" /> OS vinculadas a orçamentos aprovados já são geradas automaticamente.</p>
    </Modal>
  );
}

