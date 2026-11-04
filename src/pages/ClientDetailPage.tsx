import { ClientFormModal } from "@/components/ClientForm";
import { Badge, Button, EmptyState, GlassCard, PageHeader, Table, Td, Th, clientStatusMeta, quoteStatusMeta, orderStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import { formatCurrency, formatDate } from "@/utils/format";
import { openWhatsApp } from "@/utils/whatsapp";
import { ArrowLeft, Calculator, Mail, MapPin, MessageCircle, Pencil, Phone, Users } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function ClientDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { clients, quotes, workOrders, finance, updateClient } = useAppStoreShallow((state) => ({ clients: state.clients, quotes: state.quotes, workOrders: state.workOrders, finance: state.finance, updateClient: state.updateClient }));
  const client = clients.find((c) => c.id === id);
  const [edit, setEdit] = useState(false);

  if (!client) return <EmptyState icon={Users} title="Cliente não encontrado" action={<Button onClick={() => navigate("/clientes")}>Voltar</Button>} />;

  const cq = quotes.filter((q) => q.clientId === client.id);
  const co = workOrders.filter((w) => w.clientId === client.id);
  const cf = finance.filter((f) => f.clientId === client.id);
  const total = cq.filter((q) => q.status === "aprovado").reduce((s, q) => s + q.total, 0);
  const open = cf.filter((f) => f.status !== "pago" && f.status !== "cancelado").reduce((s, f) => s + f.amount, 0);

  return (
    <div>
      <PageHeader title={client.name} subtitle={`Cliente desde ${formatDate(client.createdAt)}`}
        actions={<>
          <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate("/clientes")}>Voltar</Button>
          <Button variant="secondary" icon={Pencil} onClick={() => setEdit(true)}>Editar</Button>
          <Button variant="whatsapp" icon={MessageCircle} onClick={() => openWhatsApp(client.whatsapp, `Olá, ${client.name.split(" ")[0]}! Aqui é da J & N Decorações em Gesso.`)}>WhatsApp</Button>
          <Button variant="gold" icon={Calculator} onClick={() => navigate(`/calculadora?cliente=${client.id}`)}>Novo orçamento</Button>
        </>} />

      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="p-5">
          <div className="flex items-center gap-3 mb-4">
            <div className="coffee-gradient h-14 w-14 rounded-2xl text-white font-bold text-lg flex items-center justify-center">{client.name.split(" ").slice(0, 2).map((n) => n[0]).join("")}</div>
            <div><p className="font-semibold text-main">{client.name}</p><p className="text-xs text-muted">{client.document}</p><Badge tone={clientStatusMeta[client.status].tone} dot className="mt-1">{clientStatusMeta[client.status].label}</Badge></div>
          </div>
          <div className="space-y-2 text-sm text-main">
            <p className="flex items-center gap-2"><Phone className="h-4 w-4 text-muted" />{client.phone || "—"}</p>
            <p className="flex items-center gap-2"><MessageCircle className="h-4 w-4 text-muted" />{client.whatsapp}</p>
            <p className="flex items-center gap-2"><Mail className="h-4 w-4 text-muted" />{client.email || "—"}</p>
            <p className="flex items-start gap-2"><MapPin className="h-4 w-4 text-muted mt-0.5" /><span>{client.address}, {client.number} — {client.district}<br />{client.city}/{client.state} · CEP {client.zip}</span></p>
          </div>
          {client.notes && <div className="mt-4 glass-subtle rounded-xl p-3 text-xs text-muted">{client.notes}</div>}
          <div className="grid grid-cols-2 gap-2 mt-4">
            <div className="glass-subtle rounded-xl p-3"><p className="text-[10px] uppercase text-muted">Total contratado</p><p className="font-semibold text-main">{formatCurrency(total)}</p></div>
            <div className="glass-subtle rounded-xl p-3"><p className="text-[10px] uppercase text-muted">Em aberto</p><p className="font-semibold text-main">{formatCurrency(open)}</p></div>
          </div>
        </GlassCard>

        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-5">
            <h3 className="font-display text-lg font-semibold text-main mb-3">Orçamentos ({cq.length})</h3>
            {cq.length === 0 ? <p className="text-sm text-muted">Nenhum orçamento para este cliente.</p> : (
              <Table>
                <thead><tr><Th>Nº</Th><Th>Serviço</Th><Th>Data</Th><Th className="text-right">Total</Th><Th>Status</Th></tr></thead>
                <tbody>{cq.map((q) => (
                  <tr key={q.id} className="hover:bg-white/30 cursor-pointer" onClick={() => navigate(`/orcamentos/${q.id}`)}>
                    <Td className="font-semibold">#{q.number}</Td><Td>{q.items.map((i) => i.serviceName).join(", ")}</Td><Td className="text-muted">{formatDate(q.createdAt)}</Td><Td className="text-right font-medium">{formatCurrency(q.total)}</Td><Td><Badge tone={quoteStatusMeta[q.status].tone} dot>{quoteStatusMeta[q.status].label}</Badge></Td>
                  </tr>))}</tbody>
              </Table>
            )}
          </GlassCard>
          <GlassCard className="p-5">
            <h3 className="font-display text-lg font-semibold text-main mb-3">Obras ({co.length})</h3>
            {co.length === 0 ? <p className="text-sm text-muted">Nenhuma obra para este cliente.</p> : (
              <div className="space-y-2">{co.map((w) => (
                <div key={w.id} className="glass-subtle rounded-xl p-3 flex flex-wrap items-center justify-between gap-2 cursor-pointer" onClick={() => navigate(`/obras/${w.id}`)}>
                  <div><p className="font-medium text-main">{w.number} — {w.serviceName}</p><p className="text-xs text-muted">{w.team} · início {formatDate(w.startDate)}</p></div>
                  <Badge tone={orderStatusMeta[w.status].tone} dot>{orderStatusMeta[w.status].label}</Badge>
                </div>))}</div>
            )}
          </GlassCard>
        </div>
      </div>

      <ClientFormModal open={edit} onClose={() => setEdit(false)} initial={client} onSubmit={async (d) => { await updateClient(client.id, d); setEdit(false); toast.success("Cliente atualizado"); }} />
    </div>
  );
}

