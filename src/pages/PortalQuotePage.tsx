import { Logo } from "@/components/Logo";
import { QuoteDocument } from "@/components/QuoteDocument";
import { QuoteLinesTable } from "@/components/QuoteLinesTable";
import { Badge, Button, GlassCard, Modal, quoteStatusMeta } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import { formatCurrency, formatDate, formatNumber } from "@/utils/format";
import { getQuoteLines } from "@/utils/quoteLines";
import { openWhatsApp } from "@/utils/whatsapp";
import { Check, CheckCircle2, Download, FileText, HardHat, MessageCircle, Package, ShieldCheck, Wallet, X } from "lucide-react";
import { useState } from "react";
import { Link, useParams } from "react-router-dom";

export default function PortalQuotePage() {
  const { token } = useParams();
  const { quotes, clients, settings, approveQuote, rejectQuote } = useAppStoreShallow((state) => ({ quotes: state.quotes, clients: state.clients, settings: state.settings, approveQuote: state.approveQuote, rejectQuote: state.rejectQuote }));
  const quote = quotes.find((q) => q.token.toUpperCase() === (token || "").toUpperCase());
  const client = clients.find((c) => c.id === quote?.clientId);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<{ os: string } | null>(null);
  const [showDoc, setShowDoc] = useState(false);

  if (!quote) {
    return (
      <PortalShell>
        <GlassCard strong className="p-10 text-center">
          <FileText className="h-10 w-10 mx-auto text-coffee-500 mb-3" />
          <h1 className="font-display text-2xl font-semibold text-main">Orçamento não encontrado</h1>
          <p className="text-sm text-muted mt-2">O link pode estar incorreto ou o orçamento foi removido. Entre em contato conosco.</p>
          <Button variant="whatsapp" icon={MessageCircle} className="mt-5" onClick={() => openWhatsApp(settings.whatsapp, "Olá! Não consegui acessar meu orçamento no portal.")}>Falar pelo WhatsApp</Button>
        </GlassCard>
      </PortalShell>
    );
  }

  const st = quoteStatusMeta[quote.status];
  const canAct = quote.status === "pendente" || quote.status === "rascunho";
  const first = quote.clientName.split(" ")[0];
  const down = quote.total * quote.downPaymentPercent / 100;
  const areaItems = quote.items.filter((item) => item.measureType === "area");
  const totalNetArea = areaItems.reduce((sum, item) => sum + item.measureValue, 0);
  const totalLinear = quote.items.filter((item) => item.measureType === "linear").reduce((sum, item) => sum + item.measureValue, 0);

  const doApprove = async () => {
    setBusy(true);
    try {
      const { workOrder } = await approveQuote(quote.id);
      setApproveOpen(false);
      setDone({ os: workOrder.number });
    } catch {
      toast.error("Não foi possível aprovar. Tente novamente.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <PortalShell>
      {done || quote.status === "aprovado" ? (
        <GlassCard strong className="p-8 sm:p-10 text-center animate-fade-up mb-4">
          <div className="mx-auto h-20 w-20 rounded-full bg-emerald-500/15 flex items-center justify-center mb-4"><CheckCircle2 className="h-10 w-10 text-emerald-600" /></div>
          <h1 className="font-display text-3xl font-semibold text-main">Orçamento aprovado com sucesso! 🎉</h1>
          <p className="text-muted mt-2">Obrigado, {first}! Em breve nossa equipe entrará em contato para agendar o início do serviço.</p>
          <div className="grid sm:grid-cols-3 gap-3 mt-6 text-left">
            <Step icon={Package} title="Metragem conferida" desc={`${formatNumber(totalNetArea)} m² líquidos${totalLinear ? ` · ${formatNumber(totalLinear)} m lineares` : ""}.`} />
            <Step icon={HardHat} title={done ? `Ordem de serviço ${done.os}` : "Ordem de serviço criada"} desc="Sua obra já está na nossa agenda de execução." />
            <Step icon={Wallet} title="Pagamento" desc={`Sinal de ${formatCurrency(down)} (${quote.downPaymentPercent}%) e restante na conclusão.`} />
          </div>
          <div className="flex flex-col sm:flex-row gap-2 justify-center mt-6">
            <Button variant="whatsapp" size="lg" icon={MessageCircle} onClick={() => openWhatsApp(settings.whatsapp, `Olá! Acabei de aprovar o orçamento #${quote.number}. Gostaria de combinar o pagamento do sinal.`)}>💬 Falar pelo WhatsApp</Button>
            <Button variant="secondary" size="lg" icon={Download} onClick={() => window.print()}>📄 Baixar PDF</Button>
          </div>
        </GlassCard>
      ) : (
        <GlassCard strong className="p-6 sm:p-8 animate-fade-up mb-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.25em] text-muted">Olá, {first} 👋</p>
              <h1 className="font-display text-2xl sm:text-3xl font-semibold text-main mt-1">Seu orçamento está pronto</h1>
              <p className="text-sm text-muted mt-1">Orçamento <b className="text-main">#{quote.number}</b> · emitido em {formatDate(quote.createdAt)}</p>
              <p className="text-sm text-muted mt-1">Cliente: <b className="text-main">{quote.clientName}</b></p>
            </div>
            <Badge tone={st.tone} dot className="text-sm px-3 py-1">{st.label}</Badge>
          </div>

          <QuoteLinesTable lines={getQuoteLines(quote)} total={quote.total} />

          <div className="mt-6 gold-gradient rounded-3xl p-6 text-coffee-950 flex flex-col sm:flex-row sm:items-end justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] font-semibold opacity-80">Valor total</p>
              <p className="font-display text-4xl font-bold">{formatCurrency(quote.total)}</p>
              {quote.discountAmount > 0 && <p className="text-sm opacity-80">Já com desconto de {formatCurrency(quote.discountAmount)}</p>}
            </div>
            <div className="text-sm sm:text-right">
              <p>Sinal ({quote.downPaymentPercent}%): <b>{formatCurrency(down)}</b></p>
              <p>Restante na conclusão: <b>{formatCurrency(quote.total - down)}</b></p>
              <p className="opacity-80 mt-1">Válido até {formatDate(quote.validUntil)}</p>
            </div>
          </div>

          {quote.notes && <div className="mt-4 glass-subtle rounded-2xl p-4 text-sm text-muted"><b className="text-main">Observações:</b> {quote.notes}</div>}
          <p className="mt-3 text-xs text-muted flex items-center gap-1"><ShieldCheck className="h-3.5 w-3.5" /> Condições: {quote.paymentTerms}</p>

          <div className="grid sm:grid-cols-2 gap-3 mt-6">
            {canAct ? (
              <>
                <Button variant="success" size="lg" icon={Check} onClick={() => setApproveOpen(true)} className="py-5 text-base">✅ APROVAR ORÇAMENTO</Button>
                <Button variant="danger" size="lg" icon={X} onClick={() => setRejectOpen(true)} className="py-5 text-base">❌ RECUSAR ORÇAMENTO</Button>
              </>
            ) : (
              <div className="sm:col-span-2 glass-subtle rounded-2xl p-4 text-center text-sm text-muted">Este orçamento está <b className="text-main">{st.label.toLowerCase()}</b>. Entre em contato para uma nova proposta.</div>
            )}
            <Button variant="secondary" size="lg" icon={Download} onClick={() => setShowDoc(true)} className="py-4">📄 BAIXAR PDF</Button>
            <Button variant="whatsapp" size="lg" icon={MessageCircle} onClick={() => openWhatsApp(settings.whatsapp, `Olá! Tenho uma dúvida sobre o orçamento #${quote.number}.`)} className="py-4">💬 FALAR PELO WHATSAPP</Button>
          </div>
        </GlassCard>
      )}

      <div className="no-print">
        <button onClick={() => setShowDoc((v) => !v)} className="text-sm text-coffee-700 dark:text-champagne-300 underline cursor-pointer mb-3">{showDoc ? "Ocultar" : "Ver"} orçamento detalhado</button>
      </div>
      {showDoc && (
        <div className="animate-fade-up">
          <div className="no-print flex justify-end mb-2"><Button variant="gold" icon={Download} onClick={() => window.print()}>Salvar PDF / Imprimir</Button></div>
          <QuoteDocument quote={quote} client={client} settings={settings} />
        </div>
      )}

      <Modal open={approveOpen} onClose={() => setApproveOpen(false)} title="Aprovar orçamento?" description="Você confirma a contratação deste serviço?" size="sm"
        footer={<><Button variant="secondary" onClick={() => setApproveOpen(false)}>Cancelar</Button><Button variant="success" loading={busy} onClick={doApprove}>Confirmar aprovação</Button></>}>
        <div className="glass-subtle rounded-2xl p-4 text-sm"><p className="text-muted">Serviço</p><p className="font-semibold text-main">{quote.items.map((i) => i.serviceName).join(", ")}</p><p className="text-muted mt-2">Valor</p><p className="font-display text-2xl font-bold text-main">{formatCurrency(quote.total)}</p></div>
      </Modal>
      <Modal open={rejectOpen} onClose={() => setRejectOpen(false)} title="Recusar orçamento?" description="Podemos ajustar a proposta. Que tal falar com a gente antes?" size="sm"
        footer={<><Button variant="whatsapp" icon={MessageCircle} onClick={() => openWhatsApp(settings.whatsapp, `Olá! Gostaria de negociar o orçamento #${quote.number}.`)}>Negociar</Button><Button variant="danger" loading={busy} onClick={async () => { setBusy(true); await rejectQuote(quote.id); setBusy(false); setRejectOpen(false); toast.info("Orçamento recusado", "Agradecemos o retorno."); }}>Recusar mesmo assim</Button></>} />
    </PortalShell>
  );
}

function Step({ icon: Icon, title, desc }: { icon: React.ElementType; title: string; desc: string }) {
  return (
    <div className="glass-subtle rounded-2xl p-4"><div className="gold-gradient h-9 w-9 rounded-xl flex items-center justify-center text-coffee-950 mb-2"><Icon className="h-4 w-4" /></div><p className="font-semibold text-main text-sm">{title}</p><p className="text-xs text-muted mt-0.5">{desc}</p></div>
  );
}

function PortalShell({ children }: { children: React.ReactNode }) {
  const { settings } = useAppStoreShallow((state) => ({ settings: state.settings }));
  return (
    <div className="portal-shell min-h-screen px-4 py-6 sm:py-10">
      <div className="max-w-3xl mx-auto">
        <div className="no-print flex items-center justify-between mb-6">
          <Logo size="md" />
          <Link to="/dashboard" className="text-xs text-muted hover:text-main">Área administrativa →</Link>
        </div>
        {children}
        <p className="no-print text-center text-xs text-muted mt-8">{settings.name} · {settings.whatsapp} · {settings.email}</p>
      </div>
    </div>
  );
}

