import { Badge, Button, EmptyState, GlassCard, PageHeader, Table, Td, Th, quoteStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import { formatCurrency, formatDate } from "@/utils/format";
import { buildQuoteMessage, openWhatsApp, portalUrl } from "@/utils/whatsapp";
import { Copy, ExternalLink, Globe, MessageCircle } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function PortalIndexPage() {
  const { quotes, clients, settings } = useAppStoreShallow((state) => ({ quotes: state.quotes, clients: state.clients, settings: state.settings }));
  const navigate = useNavigate();
  const pending = quotes.filter((q) => q.status === "pendente");
  return (
    <div>
      <PageHeader title="Portal do Cliente" subtitle="Links públicos para seus clientes visualizarem e aprovarem orçamentos" />
      <GlassCard className="p-5 mb-4 flex flex-col sm:flex-row items-start sm:items-center gap-4">
        <div className="gold-gradient rounded-2xl p-3 text-coffee-950"><Globe className="h-6 w-6" /></div>
        <div className="flex-1">
          <p className="font-semibold text-main">Como funciona</p>
          <p className="text-sm text-muted">Cada orçamento gera um link público seguro. O cliente abre em qualquer celular ou computador, confere os valores e pode aprovar ou recusar. A aprovação registra a resposta e cria a ordem de serviço e os lançamentos financeiros automaticamente.</p>
        </div>
        <Button variant="gold" icon={ExternalLink} onClick={() => window.open(portalUrl(pending[0]?.token || quotes[0]?.token || "ABC123"), "_blank")}>Abrir exemplo</Button>
      </GlassCard>

      <GlassCard className="p-4 sm:p-5">
        <h3 className="font-display text-lg font-semibold text-main mb-3">Orçamentos aguardando aprovação ({pending.length})</h3>
        {pending.length === 0 ? <EmptyState icon={Globe} title="Nenhum orçamento pendente" description="Todos os orçamentos já foram respondidos." action={<Button variant="gold" onClick={() => navigate("/calculadora")}>Criar orçamento</Button>} /> : (
          <Table>
            <thead><tr><Th>Nº</Th><Th>Cliente</Th><Th className="text-right">Total</Th><Th>Validade</Th><Th>Status</Th><Th>Link</Th><Th className="text-right">Ações</Th></tr></thead>
            <tbody>
              {pending.map((q) => {
                const client = clients.find((c) => c.id === q.clientId);
                return (
                  <tr key={q.id} className="hover:bg-white/30 dark:hover:bg-white/5">
                    <Td className="font-semibold">#{q.number}</Td><Td>{q.clientName}</Td><Td className="text-right font-medium">{formatCurrency(q.total)}</Td><Td className="text-muted">{formatDate(q.validUntil)}</Td>
                    <Td><Badge tone={quoteStatusMeta[q.status].tone} dot>{quoteStatusMeta[q.status].label}</Badge></Td>
                    <Td><code className="text-xs bg-white/40 dark:bg-white/10 rounded px-1.5 py-0.5">/portal/orcamento/{q.token}</code></Td>
                    <Td><div className="flex justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={async () => { await navigator.clipboard?.writeText(portalUrl(q.token)); toast.success("Link copiado"); }}><Copy className="h-4 w-4" /></Button>
                      <Button size="sm" variant="ghost" onClick={() => openWhatsApp(client?.whatsapp || "", buildQuoteMessage(q, client, settings))}><MessageCircle className="h-4 w-4 text-emerald-600" /></Button>
                      <Button size="sm" variant="secondary" icon={ExternalLink} onClick={() => window.open(portalUrl(q.token), "_blank")}>Abrir</Button>
                    </div></Td>
                  </tr>
                );
              })}
            </tbody>
          </Table>
        )}
      </GlassCard>
    </div>
  );
}

