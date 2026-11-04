import { Badge, Button, ConfirmModal, EmptyState, GlassCard, Input, PageHeader, Select, Table, Td, Th, Tooltip, quoteStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import { formatCurrency, formatDate } from "@/utils/format";
import { buildQuoteMessage, openWhatsApp } from "@/utils/whatsapp";
import { Calculator, Eye, FileText, MessageCircle, Pencil, Plus, Search, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

export default function QuotesPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { quotes, clients, settings, deleteQuote } = useAppStoreShallow((state) => ({ quotes: state.quotes, clients: state.clients, settings: state.settings, deleteQuote: state.deleteQuote }));
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState(params.get("status") || "todos");
  const [del, setDel] = useState<string | null>(null);

  useEffect(() => {
    setStatus(params.get("status") || "todos");
  }, [params]);

  const list = useMemo(
    () =>
      quotes.filter(
        (q) =>
          (status === "todos" || q.status === status) &&
          (q.number.includes(search) || q.clientName.toLowerCase().includes(search.toLowerCase()) || q.items.some((i) => i.serviceName.toLowerCase().includes(search.toLowerCase())))
      ),
    [quotes, search, status]
  );

  const counts = {
    todos: quotes.length,
    pendente: quotes.filter((q) => q.status === "pendente").length,
    aprovado: quotes.filter((q) => q.status === "aprovado").length,
    recusado: quotes.filter((q) => q.status === "recusado").length,
    expirado: quotes.filter((q) => q.status === "expirado").length,
    rascunho: quotes.filter((q) => q.status === "rascunho").length,
  };

  return (
    <div>
      <PageHeader title="Orçamentos" subtitle={`${quotes.length} orçamentos · ${formatCurrency(quotes.filter((q) => q.status === "aprovado").reduce((s, q) => s + q.total, 0))} aprovados`}
        actions={<Button variant="gold" icon={Plus} onClick={() => navigate("/calculadora")}>Novo orçamento</Button>} />

      <div className="flex flex-wrap gap-2 mb-4">
        {(Object.keys(counts) as (keyof typeof counts)[]).map((k) => (
          <button key={k} onClick={() => setStatus(k)} className={`rounded-xl px-3.5 py-2 text-sm font-medium capitalize cursor-pointer transition-all ${status === k ? "coffee-gradient text-white shadow-md" : "glass text-main hover:bg-white/60"}`}>
            {k === "todos" ? "Todos" : quoteStatusMeta[k].label} <span className="opacity-70 ml-1">{counts[k]}</span>
          </button>
        ))}
      </div>

      <GlassCard className="p-4 sm:p-5">
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
            <Input className="pl-9" placeholder="Buscar por número, cliente ou serviço…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <Select className="sm:w-44" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="todos">Todos os status</option>
            {Object.entries(quoteStatusMeta).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </div>

        {list.length === 0 ? (
          <EmptyState icon={FileText} title="Nenhum orçamento encontrado." description="Crie seu primeiro orçamento para começar." action={<Button variant="gold" icon={Calculator} onClick={() => navigate("/calculadora")}>+ Novo orçamento</Button>} />
        ) : (
          <Table>
            <thead>
              <tr><Th>Nº</Th><Th>Cliente</Th><Th>Serviço</Th><Th>Data</Th><Th>Validade</Th><Th className="text-right">Total</Th><Th>Status</Th><Th className="text-right">Ações</Th></tr>
            </thead>
            <tbody>
              {list.map((q) => {
                const st = quoteStatusMeta[q.status];
                const client = clients.find((c) => c.id === q.clientId);
                return (
                  <tr key={q.id} className="hover:bg-white/30 dark:hover:bg-white/5 transition-colors">
                    <Td><button className="font-semibold text-coffee-700 dark:text-champagne-300 cursor-pointer" onClick={() => navigate(`/orcamentos/${q.id}`)}>#{q.number}</button></Td>
                    <Td>{q.clientName}</Td>
                    <Td className="text-muted">{[...new Set(q.items.map((i) => i.serviceName))].join(", ")}</Td>
                    <Td className="text-muted">{formatDate(q.createdAt)}</Td>
                    <Td className="text-muted">{formatDate(q.validUntil)}</Td>
                    <Td className="text-right font-semibold">{formatCurrency(q.total)}</Td>
                    <Td><Badge tone={st.tone} dot>{st.label}</Badge></Td>
                    <Td>
                      <div className="flex justify-end gap-1">
                        <Tooltip label="Visualizar"><Button size="sm" variant="ghost" onClick={() => navigate(`/orcamentos/${q.id}`)}><Eye className="h-4 w-4" /></Button></Tooltip>
                        <Tooltip label="Editar"><Button size="sm" variant="ghost" onClick={() => navigate(`/calculadora?edit=${q.id}`)}><Pencil className="h-4 w-4" /></Button></Tooltip>
                        <Tooltip label="WhatsApp"><Button size="sm" variant="ghost" onClick={() => openWhatsApp(client?.whatsapp || "", buildQuoteMessage(q, client, settings))}><MessageCircle className="h-4 w-4 text-emerald-600" /></Button></Tooltip>
                        <Tooltip label="Excluir"><Button size="sm" variant="ghost" onClick={() => setDel(q.id)}><Trash2 className="h-4 w-4 text-red-500" /></Button></Tooltip>
                      </div>
                    </Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </GlassCard>

      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Excluir" title="Excluir orçamento?" description="Esta ação não poderá ser desfeita."
        onConfirm={async () => { await deleteQuote(del!); setDel(null); toast.success("Orçamento excluído"); }} />
    </div>
  );
}

