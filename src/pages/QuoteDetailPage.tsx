import { QuoteDocument } from "@/components/QuoteDocument";
import { Badge, Button, ConfirmModal, EmptyState, GlassCard, Modal, PageHeader, quoteStatusMeta } from "@/components/ui";
import { useAppStore } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import { formatCurrency } from "@/utils/format";
import { buildQuoteMessage, openWhatsApp, portalUrl } from "@/utils/whatsapp";
import { ArrowLeft, Check, Copy, Download, ExternalLink, Eye, FileText, Globe, MessageCircle, Pencil, Printer, Save, X } from "lucide-react";
import { useState } from "react";
import { useNavigate, useParams } from "react-router-dom";

export default function QuoteDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { quotes, clients, settings, approveQuote, rejectQuote, updateQuote } = useAppStore();
  const quote = quotes.find((q) => q.id === id);
  const client = clients.find((c) => c.id === quote?.clientId);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [pdfOpen, setPdfOpen] = useState(false);
  const [waOpen, setWaOpen] = useState(false);
  const [busy, setBusy] = useState(false);

  if (!quote) {
    return <EmptyState icon={FileText} title="Orçamento não encontrado" description="O orçamento pode ter sido excluído." action={<Button onClick={() => navigate("/orcamentos")}>Voltar para orçamentos</Button>} />;
  }

  const st = quoteStatusMeta[quote.status];
  const message = buildQuoteMessage(quote, client, settings);

  const doApprove = async () => {
    setBusy(true);
    try {
      const { workOrder } = await approveQuote(quote.id);
      setApproveOpen(false);
      toast.success("Orçamento aprovado com sucesso! 🎉", `${workOrder.number} criada e lançamentos financeiros gerados.`);
    } finally {
      setBusy(false);
    }
  };

  const print = () => {
    setPdfOpen(false);
    setTimeout(() => window.print(), 100);
  };

  const save = async () => {
    if (quote.status === "rascunho") {
      await updateQuote(quote.id, { status: "pendente" });
      toast.success("Orçamento salvo e enviado para aprovação");
    } else {
      toast.success("Orçamento salvo", "Todas as alterações estão persistidas localmente.");
    }
  };

  const copyLink = async () => {
    await navigator.clipboard?.writeText(portalUrl(quote.token));
    toast.success("Link do portal copiado!", portalUrl(quote.token));
  };

  return (
    <div>
      <div className="no-print">
        <PageHeader
          title={`Orçamento #${quote.number}`}
          subtitle={`${quote.clientName} · ${formatCurrency(quote.total)}`}
          actions={
            <>
              <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate("/orcamentos")}>Voltar</Button>
              <Badge tone={st.tone} dot className="self-center text-sm px-3 py-1">{st.label}</Badge>
            </>
          }
        />

        <GlassCard className="p-3 mb-4 flex flex-wrap gap-2">
          <Button variant="primary" icon={Save} onClick={save}>Salvar</Button>
          <Button variant="secondary" icon={Pencil} onClick={() => navigate(`/calculadora?edit=${quote.id}`)} disabled={quote.status === "aprovado"}>Editar</Button>
          <Button variant="secondary" icon={Printer} onClick={print}>Imprimir</Button>
          <Button variant="secondary" icon={Download} onClick={() => setPdfOpen(true)}>PDF</Button>
          <Button variant="whatsapp" icon={MessageCircle} onClick={() => setWaOpen(true)}>WhatsApp</Button>
          <Button variant="secondary" icon={Globe} onClick={() => window.open(portalUrl(quote.token), "_blank")}>Portal do Cliente</Button>
          <div className="flex-1" />
          {(quote.status === "pendente" || quote.status === "rascunho" || quote.status === "expirado") && (
            <>
              <Button variant="danger" icon={X} onClick={() => setRejectOpen(true)}>Recusar</Button>
              <Button variant="success" icon={Check} onClick={() => setApproveOpen(true)}>Aprovar</Button>
            </>
          )}
          {quote.status === "aprovado" && (
            <Button variant="gold" icon={ExternalLink} onClick={() => navigate("/obras")}>Ver ordem de serviço</Button>
          )}
        </GlassCard>

        <div className="glass-subtle rounded-2xl px-4 py-3 mb-4 flex flex-wrap items-center gap-3 text-sm">
          <Globe className="h-4 w-4 text-coffee-600" />
          <span className="text-muted">Link do portal:</span>
          <code className="text-xs text-main bg-white/40 dark:bg-white/10 rounded-lg px-2 py-1 break-all">{portalUrl(quote.token)}</code>
          <Button size="sm" variant="secondary" icon={Copy} onClick={copyLink}>Copiar</Button>
        </div>
      </div>

      <QuoteDocument quote={quote} client={client} settings={settings} />

      {/* Modal aprovação */}
      <ConfirmModal
        open={approveOpen}
        onClose={() => setApproveOpen(false)}
        onConfirm={doApprove}
        loading={busy}
        title="Aprovar orçamento?"
        description="Você confirma a contratação deste serviço? Isso irá criar uma ordem de serviço e os lançamentos financeiros."
        confirmLabel="Confirmar aprovação"
      />
      <ConfirmModal
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
        onConfirm={async () => { await rejectQuote(quote.id); setRejectOpen(false); toast.info("Orçamento marcado como recusado"); }}
        danger
        title="Recusar orçamento?"
        description="O orçamento será marcado como recusado."
        confirmLabel="Recusar"
      />

      {/* Modal PDF */}
      <Modal open={pdfOpen} onClose={() => setPdfOpen(false)} title="Gerar PDF" description="Pré-visualize e salve o orçamento em PDF usando a impressão do navegador (Destino: Salvar como PDF)." size="xl"
        footer={<>
          <Button variant="secondary" icon={Eye} onClick={() => { setPdfOpen(false); window.scrollTo({ top: 300, behavior: "smooth" }); }}>Visualizar PDF</Button>
          <Button variant="secondary" icon={Printer} onClick={print}>Imprimir</Button>
          <Button variant="gold" icon={Download} onClick={print}>Salvar PDF</Button>
        </>}>
        <div className="max-h-[55vh] overflow-y-auto rounded-2xl">
          <QuoteDocument quote={quote} client={client} settings={settings} />
        </div>
      </Modal>

      {/* Modal WhatsApp */}
      <Modal open={waOpen} onClose={() => setWaOpen(false)} title="Enviar pelo WhatsApp" description={`Para: ${client?.name} — ${client?.whatsapp || "sem número"}`}
        footer={<>
          <Button variant="secondary" icon={Copy} onClick={async () => { await navigator.clipboard?.writeText(message); toast.success("Mensagem copiada"); }}>Copiar mensagem</Button>
          <Button variant="whatsapp" icon={MessageCircle} onClick={() => { openWhatsApp(client?.whatsapp || "", message); setWaOpen(false); }}>Abrir WhatsApp</Button>
        </>}>
        <pre className="glass-subtle rounded-2xl p-4 text-sm whitespace-pre-wrap font-sans text-main">{message}</pre>
      </Modal>
    </div>
  );
}
