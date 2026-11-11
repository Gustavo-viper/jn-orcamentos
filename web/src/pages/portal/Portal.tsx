import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { CheckCircle2, Download, Mail, MessageCircle, Phone, Send, XCircle } from 'lucide-react';
import { QUOTE_STATUS_LABEL, type CompanySettings, type EnvironmentInput, type QuoteStatus, type QuoteTotals } from '@jn/shared';
import { api, errorMessage } from '../../lib/api';
import { fmtDate, fmtDateTime, fmtPhone, formatBRL, formatNumber, whatsappLink } from '../../lib/format';
import { buildQuotePdf, type ClientLike } from '../../lib/pdf';
import { Badge, Button, Field, Input, LoadingBlock, Modal, Textarea, toast } from '../../components/ui';

interface PortalData {
  company: CompanySettings;
  client: ClientLike | null;
  quote: {
    number: number | null;
    numberLabel: string;
    title: string;
    status: QuoteStatus;
    issueDate: string;
    validUntil: string;
    paymentTerms: string;
    notes: string;
    decidedAt: string | null;
    clientComment: string;
    environments: EnvironmentInput[];
    calc: QuoteTotals;
  };
  events: { type: string; message: string; createdAt: string }[];
}

export default function Portal() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PortalData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [decision, setDecision] = useState<'approve' | 'refuse' | null>(null);
  const [comment, setComment] = useState('');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api<PortalData>(`/portal/${token}`)
      .then((d) => {
        setData(d);
        setName((n) => n || d.client?.name || '');
      })
      .catch((e) => setError(errorMessage(e)));
  }, [token]);
  useEffect(() => {
    document.documentElement.classList.remove('dark');
    load();
  }, [load]);

  if (error) return <Shell><div className="py-20 text-center"><h1 className="text-xl font-semibold">Orçamento indisponível</h1><p className="mt-2 text-sm text-graphite-500">{error}</p></div></Shell>;
  if (!data) return <Shell><LoadingBlock label="Carregando orçamento..." /></Shell>;
  const { company, client, quote } = data;
  const c = quote.calc;
  const open = quote.status === 'pending';
  const tone = { approved: 'green', refused: 'red', expired: 'violet', pending: 'amber', draft: 'gray' } as const;

  const pdf = async () => {
    const doc = await buildQuotePdf({ ...quote, calc: c }, client, company);
    doc.save(`Orcamento-${quote.numberLabel}.pdf`);
  };
  const decide = async () => {
    setBusy(true);
    try {
      await api(`/portal/${token}/decision`, { body: { decision, name, message: comment } });
      toast(decision === 'approve' ? 'Orçamento aprovado! A J&N entrará em contato.' : 'Resposta registrada. Obrigado!');
      setDecision(null);
      setComment('');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const sendComment = async () => {
    if (!comment.trim()) return;
    setBusy(true);
    try {
      await api(`/portal/${token}/comment`, { body: { name, message: comment } });
      toast('Mensagem enviada à J&N.');
      setComment('');
      load();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  const wa = whatsappLink(company.whatsapp || company.phone, `Olá! Tenho uma dúvida sobre o orçamento ${quote.numberLabel}.`);

  return (
    <Shell company={company}>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold tracking-widest text-gold-600 uppercase">Orçamento</div>
          <h1 className="text-2xl font-semibold">{quote.numberLabel}</h1>
          <p className="text-sm text-graphite-500">
            {client?.name} · emitido em {fmtDate(quote.issueDate)} · válido até {fmtDate(quote.validUntil)}
            {quote.title && ` · ${quote.title}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Badge tone={tone[quote.status]} dot>{QUOTE_STATUS_LABEL[quote.status]}</Badge>
          <Button variant="outline" icon={<Download className="h-4 w-4" />} onClick={pdf}>Baixar PDF</Button>
        </div>
      </div>

      {quote.status === 'approved' && <Notice tone="green" icon={<CheckCircle2 className="h-5 w-5" />}>Orçamento aprovado {quote.decidedAt && `em ${fmtDateTime(quote.decidedAt)}`}. Obrigado pela confiança!</Notice>}
      {quote.status === 'refused' && <Notice tone="red" icon={<XCircle className="h-5 w-5" />}>Orçamento recusado {quote.decidedAt && `em ${fmtDateTime(quote.decidedAt)}`}.</Notice>}
      {quote.status === 'expired' && <Notice tone="amber">A validade deste orçamento expirou. Fale com a J&N para receber uma proposta atualizada.</Notice>}

      <div className="relative">
      <Watermark src={company.logo || '/logo-jn.webp'} />
      <div className="card mb-5 overflow-hidden">
        <div className="border-b border-graphite-100 px-5 py-3 text-sm font-semibold">Serviços</div>
        <ul className="divide-y divide-graphite-100">
          {c.environments.map((e, i) => {
            return (
              <li key={i} className="flex flex-col gap-1 px-5 py-3 sm:flex-row sm:flex-wrap sm:items-center">
                <div className="flex-1">
                  <div className="font-medium">{e.name}</div>
                  <div className="text-xs text-graphite-500">
                    {e.serviceName} ·{' '}
                    {e.measurementType === 'm2' ? `${formatNumber(e.netArea, 2)} m²` : e.measurementType === 'ml' ? `${formatNumber(e.linear, 2)} m lineares` : `${formatNumber(e.quantity, 2)} ${e.chargeUnit}`}
                  </div>
                </div>
                <div className="tabular font-semibold">{formatBRL(e.addons?.length ? (e.basePrice ?? e.price) : e.price)}</div>
                {(e.addons ?? []).map((a) => (
                  <div key={a.id} className="flex w-full items-center gap-2 pl-4 text-sm text-graphite-600 sm:basis-full">
                    <span className="flex-1">+ {a.name} · <span className="text-xs text-graphite-500">{formatNumber(a.measure, 2)} {a.chargeUnit}</span></span>
                    <span className="tabular">{formatBRL(a.price)}</span>
                  </div>
                ))}
                {(e.addons?.length ?? 0) > 0 && (
                  <div className="flex w-full justify-between pl-4 text-sm font-semibold sm:basis-full"><span>Total {e.name}</span><span className="tabular">{formatBRL(e.price)}</span></div>
                )}
              </li>
            );
          })}
        </ul>
        <div className="space-y-1 border-t border-graphite-100 bg-graphite-50/60 px-5 py-4 text-sm">
          <div className="flex justify-between"><span className="text-graphite-500">Subtotal</span><span className="tabular">{formatBRL(c.subtotal)}</span></div>
          {c.discount > 0 && <div className="flex justify-between text-red-600"><span>Desconto</span><span className="tabular">− {formatBRL(c.discount)}</span></div>}
          <div className="flex items-baseline justify-between pt-1"><span className="font-semibold">Valor total</span><span className="tabular text-2xl font-semibold text-navy-800">{formatBRL(c.total)}</span></div>
        </div>
      </div>

      <div className="mb-5 grid gap-5 md:grid-cols-2">
        <div className="card p-5">
          <div className="mb-2 text-sm font-semibold">Condições de pagamento</div>
          {c.installments.map((i, k) => <div key={k} className="flex justify-between text-sm"><span>{i.label} ({formatNumber(i.pct, 2)}%)</span><b className="tabular">{formatBRL(i.amount)}</b></div>)}
          {quote.paymentTerms && <p className="mt-3 text-sm whitespace-pre-wrap text-graphite-600">{quote.paymentTerms}</p>}
        </div>
        <div className="card p-5">
          <div className="mb-2 text-sm font-semibold">Observações</div>
          <p className="text-sm whitespace-pre-wrap text-graphite-600">{quote.notes || '—'}</p>
        </div>
      </div>
      </div>

      <div className="card mb-5 p-5">
        <div className="mb-3 text-sm font-semibold">{open ? 'Sua resposta' : 'Enviar mensagem'}</div>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Seu nome"><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field className="sm:col-span-2" label="Observações (opcional)"><Textarea value={comment} onChange={(e) => setComment(e.target.value)} placeholder="Dúvidas, ajustes ou combinados..." className="min-h-[42px]" /></Field>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          {open && <Button variant="gold" size="lg" icon={<CheckCircle2 className="h-5 w-5" />} onClick={() => setDecision('approve')}>Aprovar orçamento</Button>}
          {open && <Button variant="outline" size="lg" icon={<XCircle className="h-5 w-5" />} onClick={() => setDecision('refuse')}>Recusar</Button>}
          <Button variant="ghost" size="lg" icon={<Send className="h-4 w-4" />} disabled={!comment.trim()} loading={busy && !decision} onClick={sendComment}>Enviar observação</Button>
        </div>
        {data.events.length > 0 && (
          <ul className="mt-4 space-y-1 border-t border-graphite-100 pt-3 text-xs text-graphite-500">
            {data.events.map((e, i) => <li key={i}>{fmtDateTime(e.createdAt)} — {e.message || e.type}</li>)}
          </ul>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-4 text-sm text-graphite-500">
        {wa && <a className="inline-flex items-center gap-1.5 hover:text-emerald-600" href={wa} target="_blank" rel="noreferrer"><MessageCircle className="h-4 w-4" /> WhatsApp</a>}
        {company.phone && <a className="inline-flex items-center gap-1.5" href={`tel:${company.phone}`}><Phone className="h-4 w-4" /> {fmtPhone(company.phone)}</a>}
        {company.email && <a className="inline-flex items-center gap-1.5" href={`mailto:${company.email}`}><Mail className="h-4 w-4" /> {company.email}</a>}
      </div>

      <Modal open={!!decision} onClose={() => setDecision(null)} size="sm" title={decision === 'approve' ? 'Confirmar aprovação' : 'Confirmar recusa'} footer={<><Button variant="outline" onClick={() => setDecision(null)}>Voltar</Button><Button variant={decision === 'approve' ? 'gold' : 'danger'} loading={busy} onClick={decide}>{decision === 'approve' ? 'Aprovar' : 'Recusar'}</Button></>}>
        <p className="text-sm">
          {decision === 'approve' ? <>Confirmo a aprovação do orçamento <b>{quote.numberLabel}</b> no valor de <b>{formatBRL(c.total)}</b>.</> : <>Confirmo que não desejo seguir com o orçamento <b>{quote.numberLabel}</b>.</>}
        </p>
        <p className="mt-2 text-xs text-graphite-500">A data, a hora e a identificação deste acesso serão registradas.</p>
      </Modal>
    </Shell>
  );
}

/** Logo da empresa como marca d'água (papel timbrado) sobre a "folha" do orçamento.
 * Fica por cima dos cartões (que são translúcidos) com opacidade baixa e sem capturar cliques/seleção. */
function Watermark({ src }: { src?: string }) {
  if (!src) return null;
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center overflow-hidden select-none print:flex">
      <img src={src} alt="" draggable={false} className="w-[85%] max-w-[560px] max-h-[80%] object-contain opacity-[0.06]" />
    </div>
  );
}

function Notice({ children, tone, icon }: { children: React.ReactNode; tone: 'green' | 'red' | 'amber'; icon?: React.ReactNode }) {
  const cls = { green: 'bg-emerald-50 text-emerald-800', red: 'bg-red-50 text-red-800', amber: 'bg-amber-50 text-amber-800' }[tone];
  return <div className={`mb-5 flex items-center gap-3 rounded-2xl p-4 text-sm ${cls}`}>{icon}{children}</div>;
}

function Shell({ children, company }: { children: React.ReactNode; company?: CompanySettings }) {
  return (
    <div className="min-h-dvh text-graphite-900">
      <header className="bg-gradient-to-r from-navy-900 to-navy-950">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-5 py-4">
          <img src={company?.logo || '/logo-jn.webp'} alt="" className="h-14 w-auto object-contain" />
          <div>
            <div className="font-semibold text-white">{company?.name || 'J&N Decorações em Gesso'}</div>
            <div className="text-xs text-gold-200/80">Portal do cliente</div>
          </div>
        </div>
        <div className="h-0.5 bg-gradient-to-r from-gold-400 via-gold-300 to-transparent" />
      </header>
      <main className="mx-auto max-w-4xl px-5 py-8">{children}</main>
    </div>
  );
}
