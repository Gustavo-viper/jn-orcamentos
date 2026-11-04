import { Badge, Button, ConfirmModal, EmptyState, Field, GlassCard, Input, Modal, PageHeader, Select, StatCard, Table, Td, Th, Tooltip, financeStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import type { FinanceCategory, FinanceEntry, FinanceStatus, FinanceType } from "@/types";
import { cn } from "@/utils/cn";
import { addDays, formatCurrency, formatDate } from "@/utils/format";
import { AlertCircle, ArrowDownCircle, ArrowUpCircle, CheckCircle2, Clock, Plus, Scale, Search, Trash2, Wallet, XCircle } from "lucide-react";
import { useMemo, useState } from "react";

const catLabel: Record<FinanceCategory, string> = { servico: "Serviço", material: "Material", combustivel: "Combustível", ferramentas: "Ferramentas", fornecedor: "Fornecedor", funcionario: "Funcionário", outros: "Outros" };

export default function FinancePage() {
  const { finance, clients, quotes, markPaid, updateFinance, createFinance, deleteFinance } = useAppStoreShallow((state) => ({ finance: state.finance, clients: state.clients, quotes: state.quotes, markPaid: state.markPaid, updateFinance: state.updateFinance, createFinance: state.createFinance, deleteFinance: state.deleteFinance }));
  const [tab, setTab] = useState<"todos" | "entrada" | "saida">("todos");
  const [status, setStatus] = useState("todos");
  const [search, setSearch] = useState("");
  const [newOpen, setNewOpen] = useState<FinanceType | null>(null);
  const [del, setDel] = useState<FinanceEntry | null>(null);
  const [payQuote, setPayQuote] = useState(quotes.find((q) => q.status === "pendente")?.id || quotes[0]?.id || "");
  const [downPct, setDownPct] = useState(50);

  // Atualiza status atrasado dinamicamente
  const entries = useMemo(() => finance.map((f) => (f.status === "pendente" && new Date(f.dueDate).getTime() < Date.now() - 86400000 ? { ...f, status: "atrasado" as FinanceStatus } : f)), [finance]);

  const stats = useMemo(() => {
    const paidIn = entries.filter((f) => f.type === "entrada" && f.status === "pago").reduce((s, f) => s + f.amount, 0);
    const paidOut = entries.filter((f) => f.type === "saida" && f.status === "pago").reduce((s, f) => s + f.amount, 0);
    const receivable = entries.filter((f) => f.type === "entrada" && (f.status === "pendente" || f.status === "atrasado")).reduce((s, f) => s + f.amount, 0);
    const late = entries.filter((f) => f.status === "atrasado").reduce((s, f) => s + f.amount, 0);
    return { paidIn, paidOut, balance: paidIn - paidOut, receivable, late };
  }, [entries]);

  const list = entries.filter((f) => (tab === "todos" || f.type === tab) && (status === "todos" || f.status === status) && (f.description.toLowerCase().includes(search.toLowerCase()) || (f.clientName || "").toLowerCase().includes(search.toLowerCase())));
  const expensesByCat = (["material", "combustivel", "ferramentas", "fornecedor", "funcionario", "outros"] as FinanceCategory[]).map((c) => ({ c, v: entries.filter((f) => f.type === "saida" && f.category === c).reduce((s, f) => s + f.amount, 0) }));
  const maxCat = Math.max(...expensesByCat.map((e) => e.v), 1);
  const pq = quotes.find((q) => q.id === payQuote);

  return (
    <div>
      <PageHeader title="Financeiro" subtitle="Entradas, saídas, recebíveis e despesas" actions={<><Button variant="secondary" icon={ArrowDownCircle} onClick={() => setNewOpen("saida")}>Nova despesa</Button><Button variant="gold" icon={Plus} onClick={() => setNewOpen("entrada")}>Nova entrada</Button></>} />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 mb-4">
        <StatCard icon={ArrowUpCircle} label="Entradas" value={formatCurrency(stats.paidIn)} tone="green" sub="recebido" />
        <StatCard icon={ArrowDownCircle} label="Saídas" value={formatCurrency(stats.paidOut)} tone="red" sub="pago" />
        <StatCard icon={Scale} label="Saldo" value={formatCurrency(stats.balance)} tone="gold" />
        <StatCard icon={Clock} label="A receber" value={formatCurrency(stats.receivable)} onClick={() => { setTab("entrada"); setStatus("pendente"); }} />
        <StatCard icon={AlertCircle} label="Atrasados" value={formatCurrency(stats.late)} tone={stats.late ? "red" : "coffee"} onClick={() => setStatus("atrasado")} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="p-4 sm:p-5 lg:col-span-2">
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <div className="flex gap-1 glass-subtle rounded-xl p-1">
              {(["todos", "entrada", "saida"] as const).map((t) => <button key={t} onClick={() => setTab(t)} className={cn("rounded-lg px-3 py-1.5 text-sm font-medium capitalize cursor-pointer", tab === t ? "coffee-gradient text-white" : "text-main")}>{t === "todos" ? "Todos" : t === "entrada" ? "Entradas" : "Saídas"}</button>)}
            </div>
            <div className="relative flex-1"><Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" /><Input className="pl-9" placeholder="Buscar…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
            <Select className="sm:w-40" value={status} onChange={(e) => setStatus(e.target.value)}><option value="todos">Todos status</option>{Object.entries(financeStatusMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}</Select>
          </div>
          {list.length === 0 ? <EmptyState icon={Wallet} title="Nenhum lançamento encontrado." /> : (
            <Table>
              <thead><tr><Th>Descrição</Th><Th>Cliente</Th><Th>Categoria</Th><Th className="text-right">Valor</Th><Th>Vencimento</Th><Th>Pagamento</Th><Th>Status</Th><Th className="text-right">Ações</Th></tr></thead>
              <tbody>
                {list.map((f) => (
                  <tr key={f.id} className="hover:bg-white/30 dark:hover:bg-white/5">
                    <Td><div className="flex items-center gap-2">{f.type === "entrada" ? <ArrowUpCircle className="h-4 w-4 text-emerald-600 shrink-0" /> : <ArrowDownCircle className="h-4 w-4 text-red-500 shrink-0" />}<span className="font-medium">{f.description}</span></div></Td>
                    <Td className="text-muted">{f.clientName || "—"}</Td>
                    <Td><Badge tone="coffee">{catLabel[f.category]}</Badge></Td>
                    <Td className={cn("text-right font-semibold", f.type === "entrada" ? "text-emerald-700 dark:text-emerald-400" : "text-red-600")}>{f.type === "entrada" ? "+" : "-"} {formatCurrency(f.amount)}</Td>
                    <Td className="text-muted">{formatDate(f.dueDate)}</Td>
                    <Td className="text-muted">{formatDate(f.paidAt)}</Td>
                    <Td><Badge tone={financeStatusMeta[f.status].tone} dot>{financeStatusMeta[f.status].label}</Badge></Td>
                    <Td><div className="flex justify-end gap-1">
                      {f.status !== "pago" && f.status !== "cancelado" && <Tooltip label={f.type === "entrada" ? "Marcar como recebido" : "Marcar como pago"}><Button size="sm" variant="ghost" onClick={async () => { await markPaid(f.id); toast.success(f.type === "entrada" ? "Pagamento recebido" : "Pagamento efetuado", formatCurrency(f.amount)); }}><CheckCircle2 className="h-4 w-4 text-emerald-600" /></Button></Tooltip>}
                      {f.status === "pago" && <Tooltip label="Estornar"><Button size="sm" variant="ghost" onClick={async () => { await updateFinance(f.id, { status: "pendente", paidAt: undefined }); toast.info("Lançamento estornado"); }}><Clock className="h-4 w-4 text-amber-600" /></Button></Tooltip>}
                      {f.status !== "cancelado" && <Tooltip label="Cancelar"><Button size="sm" variant="ghost" onClick={async () => { await updateFinance(f.id, { status: "cancelado" }); toast.info("Lançamento cancelado"); }}><XCircle className="h-4 w-4 text-muted" /></Button></Tooltip>}
                      <Tooltip label="Excluir"><Button size="sm" variant="ghost" onClick={() => setDel(f)}><Trash2 className="h-4 w-4 text-red-500" /></Button></Tooltip>
                    </div></Td>
                  </tr>
                ))}
              </tbody>
            </Table>
          )}
        </GlassCard>

        <div className="space-y-4">
          <GlassCard className="p-5">
            <h3 className="font-display text-lg font-semibold text-main mb-1">Simulador de pagamento</h3>
            <p className="text-xs text-muted mb-3">Configure entrada e saldo na conclusão.</p>
            <Field label="Orçamento"><Select value={payQuote} onChange={(e) => setPayQuote(e.target.value)}>{quotes.map((q) => <option key={q.id} value={q.id}>#{q.number} — {q.clientName} ({formatCurrency(q.total)})</option>)}</Select></Field>
            <div className="flex gap-2 mt-3">{[30, 40, 50, 100].map((p) => <button key={p} onClick={() => setDownPct(p)} className={cn("flex-1 rounded-xl py-2 text-xs font-medium cursor-pointer", downPct === p ? "coffee-gradient text-white" : "glass-subtle text-main")}>{p === 100 ? "À vista" : `${p}%`}</button>)}</div>
            {pq && (
              <div className="mt-4 space-y-2">
                <div className="glass-subtle rounded-xl p-3 flex justify-between"><span className="text-sm text-muted">Orçamento</span><span className="font-semibold text-main">{formatCurrency(pq.total)}</span></div>
                <div className="gold-gradient rounded-xl p-3 flex justify-between text-coffee-950"><span className="text-sm">Sinal ({downPct}%)</span><span className="font-bold">{formatCurrency(pq.total * downPct / 100)}</span></div>
                <div className="glass-subtle rounded-xl p-3 flex justify-between"><span className="text-sm text-muted">Restante na conclusão</span><span className="font-semibold text-main">{formatCurrency(pq.total * (100 - downPct) / 100)}</span></div>
                <Button variant="secondary" className="w-full" onClick={() => toast.info("Gateway de pagamento", "Será integrado na Fase 2 (PIX/cartão).")}>Gerar cobrança (simulado)</Button>
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <h3 className="font-display text-lg font-semibold text-main mb-3">Despesas por categoria</h3>
            <div className="space-y-2.5">
              {expensesByCat.map((e) => (
                <div key={e.c}>
                  <div className="flex justify-between text-xs mb-1"><span className="text-main">{catLabel[e.c]}</span><span className="font-semibold text-main">{formatCurrency(e.v)}</span></div>
                  <div className="h-2 rounded-full bg-white/40 dark:bg-white/10 overflow-hidden"><div className="h-full coffee-gradient rounded-full" style={{ width: `${(e.v / maxCat) * 100}%` }} /></div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>

      {newOpen && <EntryModal type={newOpen} clients={clients} onClose={() => setNewOpen(null)} onSave={async (d) => { await createFinance(d); setNewOpen(null); toast.success(newOpen === "entrada" ? "Entrada lançada" : "Despesa lançada"); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Excluir" title="Excluir lançamento?" description={del?.description} onConfirm={async () => { await deleteFinance(del!.id); setDel(null); toast.success("Lançamento excluído"); }} />
    </div>
  );
}

function EntryModal({ type, clients, onClose, onSave }: { type: FinanceType; clients: { id: string; name: string }[]; onClose: () => void; onSave: (d: Omit<FinanceEntry, "id">) => Promise<void> }) {
  const [f, setF] = useState({ description: "", clientId: "", category: (type === "entrada" ? "servico" : "material") as FinanceCategory, amount: "", dueDate: addDays(7).slice(0, 10), status: "pendente" as FinanceStatus });
  const [busy, setBusy] = useState(false);
  const cats: FinanceCategory[] = type === "entrada" ? ["servico", "outros"] : ["material", "combustivel", "ferramentas", "fornecedor", "funcionario", "outros"];
  return (
    <Modal open onClose={onClose} title={type === "entrada" ? "Nova entrada" : "Nova despesa"} footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="gold" loading={busy} onClick={async () => { const amount = parseFloat(f.amount.replace(",", ".")); if (!f.description || !amount) return toast.error("Preencha descrição e valor"); setBusy(true); const client = clients.find((c) => c.id === f.clientId); await onSave({ description: f.description, clientId: client?.id, clientName: client?.name, type, category: f.category, amount, dueDate: new Date(f.dueDate).toISOString(), status: f.status, paidAt: f.status === "pago" ? new Date().toISOString() : undefined }); setBusy(false); }}>Salvar</Button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Descrição" className="sm:col-span-2"><Input value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={type === "entrada" ? "Ex.: Sinal — forro sala" : "Ex.: Compra de gesso"} /></Field>
        <Field label="Categoria"><Select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value as FinanceCategory })}>{cats.map((c) => <option key={c} value={c}>{catLabel[c]}</option>)}</Select></Field>
        <Field label="Cliente (opcional)"><Select value={f.clientId} onChange={(e) => setF({ ...f, clientId: e.target.value })}><option value="">—</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select></Field>
        <Field label="Valor (R$)"><Input inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} placeholder="0,00" /></Field>
        <Field label="Vencimento"><Input type="date" value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} /></Field>
        <Field label="Status"><Select value={f.status} onChange={(e) => setF({ ...f, status: e.target.value as FinanceStatus })}><option value="pendente">Pendente</option><option value="pago">Pago</option></Select></Field>
      </div>
    </Modal>
  );
}

