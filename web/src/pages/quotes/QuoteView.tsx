import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  FileDown,
  HardHat,
  Link2,
  MessageCircle,
  MessageSquare,
  Pencil,
  Printer,
  Send,
  Trash2,
  Undo2,
  Wallet,
  XCircle,
} from 'lucide-react';
import { QUOTE_STATUS_LABEL, formatJobNumber, formatQuoteNumber, quoteDisplayStatus, todayISO, type Quote } from '@jn/shared';
import { getDb } from '../../lib/db';
import { deleteRecord, runCommand, useCompany, useRecord, useTable, useWhere } from '../../lib/data';
import { useAuth, useSyncState } from '../../lib/auth';
import { secureToken, uuid } from '../../lib/ids';
import { fmtDate, fmtDateTime, formatBRL, formatNumber, whatsappLink } from '../../lib/format';
import { buildQuotePdf, printPdf } from '../../lib/pdf';
import { QuoteStatusBadge } from '../../lib/status';
import { QuoteSummary } from '../../components/QuoteSummary';
import { ChangeHistory } from '../../components/History';
import { Button, Card, CardHeader, Checkbox, confirmDialog, EmptyState, Field, Input, LoadingBlock, Modal, PageHeader, Tabs, Textarea, toast } from '../../components/ui';

export default function QuoteView() {
  const { id } = useParams();
  const quote = useRecord('quotes', id);
  const client = useRecord('clients', quote?.clientId);
  const events = useWhere('portalEvents', 'quoteId', id);
  const jobs = useWhere('jobs', 'quoteId', id);
  const entries = useWhere('financeEntries', 'quoteId', id);
  const services = useTable('services');
  const company = useCompany();
  const { can } = useAuth();
  const sync = useSyncState();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'detail' | 'portal' | 'history'>('detail');
  const [approveOpen, setApproveOpen] = useState(false);
  const [jobOpen, setJobOpen] = useState(false);
  const [pdfBusy, setPdfBusy] = useState(false);

  const activeJob = (jobs ?? []).find((j) => j.status !== 'cancelled');
  const receivables = (entries ?? []).filter((e) => e.status !== 'cancelled');
  const svcDesc = useMemo(() => new Map((services ?? []).map((s) => [s.id, s.description])), [services]);

  if (quote === undefined) return <LoadingBlock />;
  if (!quote || quote.deletedAt) return <EmptyState title="Orçamento não encontrado" action={<Button onClick={() => navigate('/orcamentos')}>Voltar</Button>} />;

  const status = quoteDisplayStatus(quote);
  const editable = ['draft', 'pending', 'expired'].includes(quote.status);
  const calc = quote.calc;
  const portalUrl = quote.portalToken ? `${location.origin}/portal/${quote.portalToken}` : null;

  const setStatus = async (next: 'pending' | 'approved' | 'refused' | 'draft', extra: { createReceivables?: boolean; note?: string } = {}) => {
    await runCommand('quote.setStatus', { quoteId: quote.id, status: next, ...extra }, {
      targets: [quote.id],
      description: `Orçamento ${formatQuoteNumber(quote.number)}: ${QUOTE_STATUS_LABEL[next]}`,
      optimistic: async () => {
        await getDb().quotes.update(quote.id, { status: next, decidedAt: next === 'approved' || next === 'refused' ? new Date().toISOString() : null });
      },
    });
    toast(`Orçamento ${QUOTE_STATUS_LABEL[next].toLowerCase()}.`);
  };

  const ensurePortal = async (): Promise<string> => {
    if (quote.portalToken) return `${location.origin}/portal/${quote.portalToken}`;
    const token = secureToken();
    await runCommand('quote.portalLink', { quoteId: quote.id, token }, { targets: [quote.id], description: 'Gerar link do portal', optimistic: async () => void (await getDb().quotes.update(quote.id, { portalToken: token })) });
    return `${location.origin}/portal/${token}`;
  };

  const makePdf = async () => {
    if (!calc) throw new Error('Orçamento sem cálculo.');
    return buildQuotePdf({ ...quote, calc, environments: quote.environments }, client ?? null, company);
  };
  const fileName = `Orcamento-${formatQuoteNumber(quote.number)}-${(client?.name ?? '').replace(/[^\w]+/g, '-')}.pdf`;
  const downloadPdf = async () => {
    setPdfBusy(true);
    try {
      (await makePdf()).save(fileName);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPdfBusy(false);
    }
  };
  const print = async () => printPdf(await makePdf());

  const shareWhatsApp = async () => {
    const link = sync.online ? await ensurePortal() : portalUrl;
    const msg = `Olá, ${client?.name?.split(' ')[0] ?? ''}! Segue o orçamento ${formatQuoteNumber(quote.number)} da ${company.name}, no valor de ${formatBRL(quote.total)}, válido até ${fmtDate(quote.validUntil)}.${link ? `\n\nVocê pode visualizar, baixar o PDF e aprovar pelo link:\n${link}` : ''}`;
    // celular: compartilha o PDF diretamente, quando o aparelho permitir
    try {
      const pdf = await makePdf();
      const file = new File([pdf.output('blob')], fileName, { type: 'application/pdf' });
      if (navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file], text: msg, title: `Orçamento ${formatQuoteNumber(quote.number)}` });
        return;
      }
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
    const wa = whatsappLink(client?.whatsapp || client?.phone || '', msg) ?? `https://wa.me/?text=${encodeURIComponent(msg)}`;
    window.open(wa, '_blank', 'noopener');
  };

  const copyLink = async () => {
    const link = await ensurePortal();
    await navigator.clipboard?.writeText(link).catch(() => undefined);
    toast(quote.portalToken ? 'Link copiado.' : 'Link gerado e copiado. Ele fica ativo após a sincronização.');
  };
  const revokeLink = async () => {
    if (!(await confirmDialog({ title: 'Revogar link do portal', message: 'O cliente não conseguirá mais acessar o link atual. Um novo link poderá ser gerado depois.', danger: true, confirmLabel: 'Revogar' }))) return;
    await runCommand('quote.portalLink', { quoteId: quote.id, token: null }, { targets: [quote.id], description: 'Revogar link do portal', optimistic: async () => void (await getDb().quotes.update(quote.id, { portalToken: null })) });
    toast('Link revogado.');
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Excluir orçamento', message: <>Excluir o orçamento <b>{formatQuoteNumber(quote.number)}</b>? Orçamentos com ordem de serviço ou lançamentos financeiros não podem ser excluídos.</>, danger: true, confirmLabel: 'Excluir' }))) return;
    await deleteRecord('quotes', quote.id, `Excluir orçamento ${formatQuoteNumber(quote.number)}`);
    toast('Exclusão enviada.');
    navigate('/orcamentos');
  };

  const createReceivables = async () => {
    await runCommand('quote.createReceivables', { quoteId: quote.id }, { targets: [quote.id], description: `Contas a receber de ${formatQuoteNumber(quote.number)}` });
    toast('Contas a receber serão criadas na sincronização (sem duplicar).');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={
          <Link to="/orcamentos" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-500 hover:text-graphite-800">
            <ArrowLeft className="h-4 w-4" /> Orçamentos
          </Link>
        }
        title={
          <span className="flex flex-wrap items-center gap-3">
            {formatQuoteNumber(quote.number)}
            <QuoteStatusBadge quote={quote} />
          </span>
        }
        subtitle={
          <>
            {client ? <Link className="hover:underline" to={`/clientes/${client.id}`}>{client.name}</Link> : '—'} · emitido em {fmtDate(quote.issueDate)} · válido até {fmtDate(quote.validUntil)}
            {quote.title && ` · ${quote.title}`}
          </>
        }
        actions={
          <>
            <Button variant="outline" icon={<FileDown className="h-4 w-4" />} loading={pdfBusy} onClick={downloadPdf} disabled={!calc}>
              PDF
            </Button>
            <Button variant="outline" size="icon" onClick={print} aria-label="Imprimir" title="Imprimir" disabled={!calc}>
              <Printer className="h-4 w-4" />
            </Button>
            <Button variant="outline" icon={<MessageCircle className="h-4 w-4 text-emerald-600" />} onClick={shareWhatsApp} disabled={!calc || status === 'draft'}>
              WhatsApp
            </Button>
            {can('quotes', 'create') && (
              <Button variant="outline" size="icon" onClick={() => navigate(`/orcamentos/novo?duplicar=${quote.id}`)} aria-label="Duplicar" title="Duplicar">
                <Copy className="h-4 w-4" />
              </Button>
            )}
            {editable && can('quotes', 'edit') && (
              <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => navigate(`/orcamentos/${quote.id}/editar`)}>
                Editar
              </Button>
            )}
            {can('quotes', 'delete') && <Button variant="ghost" size="icon" onClick={remove} aria-label="Excluir"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </>
        }
      />
      {quote._syncError && <p className="mb-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">Não sincronizado: {quote._syncError}</p>}

      {/* Barra de ações por situação */}
      {can('quotes', 'edit') && (
        <Card className="mb-5 flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
          <div className="flex-1 text-sm">
            {status === 'draft' && 'Rascunho — gere o orçamento para enviar ao cliente.'}
            {status === 'pending' && 'Aguardando resposta do cliente. Registre a decisão ou envie o link do portal.'}
            {status === 'expired' && 'A validade expirou. Reenvie (a validade é renovada) ou registre a decisão.'}
            {status === 'approved' && <>Aprovado {quote.decidedAt && `em ${fmtDateTime(quote.decidedAt)}`} {quote.decidedBy && `por ${quote.decidedBy}`}.</>}
            {status === 'refused' && <>Recusado {quote.decidedAt && `em ${fmtDateTime(quote.decidedAt)}`} {quote.decidedBy && `por ${quote.decidedBy}`}.</>}
            {quote.clientComment && <div className="mt-1 text-graphite-500">Comentário do cliente: “{quote.clientComment}”</div>}
          </div>
          <div className="flex flex-wrap gap-2">
            {status === 'draft' && <Button icon={<Send className="h-4 w-4" />} onClick={() => setStatus('pending')} disabled={!calc || !!calc.errors.length}>Gerar orçamento</Button>}
            {(status === 'pending' || status === 'expired') && (
              <>
                {status === 'expired' && <Button variant="outline" icon={<Send className="h-4 w-4" />} onClick={() => setStatus('pending')}>Reenviar</Button>}
                <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={() => setStatus('draft')}>Voltar a rascunho</Button>
                <Button variant="outline" icon={<XCircle className="h-4 w-4 text-red-500" />} onClick={async () => (await confirmDialog({ title: 'Recusar orçamento', message: 'Registrar que o cliente recusou este orçamento?', confirmLabel: 'Recusar', danger: true })) && setStatus('refused')}>Recusado</Button>
                <Button icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setApproveOpen(true)}>Aprovado</Button>
              </>
            )}
            {status === 'approved' && (
              <>
                {can('finance', 'create') && !receivables.length && <Button variant="outline" icon={<Wallet className="h-4 w-4" />} onClick={createReceivables}>Criar contas a receber</Button>}
                {activeJob ? (
                  <Button variant="outline" icon={<HardHat className="h-4 w-4" />} onClick={() => navigate(`/obras/${activeJob.id}`)}>Ver {formatJobNumber(activeJob.number)}</Button>
                ) : (
                  can('jobs', 'create') && <Button icon={<HardHat className="h-4 w-4" />} onClick={() => setJobOpen(true)}>Gerar controle de material</Button>
                )}
              </>
            )}
            {status === 'refused' && <Button variant="outline" icon={<Undo2 className="h-4 w-4" />} onClick={() => setStatus('draft')}>Reabrir como rascunho</Button>}
          </div>
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0">
          <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ value: 'detail', label: 'Detalhes' }, { value: 'portal', label: 'Portal do cliente', count: (events ?? []).filter((e) => e.type !== 'viewed').length }, { value: 'history', label: 'Histórico' }]} />
          {tab === 'detail' && (
            <div className="space-y-4">
              {!calc ? (
                <Card className="p-6 text-sm text-graphite-500">Cálculo indisponível.</Card>
              ) : (
                calc.environments.map((r, i) => {
                  return (
                    <Card key={r.envId + i}>
                      <CardHeader title={r.name} subtitle={`${r.serviceName}${svcDesc.get(r.serviceId) ? ` — ${svcDesc.get(r.serviceId)}` : ''}`} action={<span className="tabular text-base font-semibold">{formatBRL(r.price)}</span>} />
                      <div className="grid grid-cols-2 gap-3 p-4 text-sm sm:grid-cols-4">
                        {r.measurementType === 'm2' && <Info label={r.serviceName} value={`${formatNumber(r.netArea, 2)} m²`} />}
                        {r.measurementType === 'ml' && <Info label={r.serviceName} value={`${formatNumber(r.linear, 2)} m`} />}
                        {r.measurementType === 'unit' && <Info label={r.serviceName} value={`${formatNumber(r.quantity, 2)} ${r.chargeUnit}`} />}
                        {r.plates > 0 && <Info label="Placas (1,80×1,20)" value={`${r.plates} placa${r.plates === 1 ? '' : 's'}`} />}
                        {r.measurementType !== 'unit' && <Info label="Negativo" value={`${formatNumber(r.perimeter, 2)} m`} />}
                        <Info label={(r.addons ?? []).length ? 'Serviço principal' : 'Total do serviço'} value={formatBRL(r.pricingMode === 'fixed' ? (r.basePrice ?? r.price) : r.laborCost - (r.addons ?? []).reduce((s, a) => s + a.laborCost, 0))} />
                      </div>
                      {(r.addons ?? []).length > 0 && (
                        <div className="space-y-1 border-t border-graphite-100 px-4 py-3 text-sm dark:border-white/5">
                          <div className="text-xs font-medium uppercase tracking-wide text-graphite-500">Adicionais</div>
                          {r.addons.map((a) => (
                            <div key={a.id} className="tabular flex justify-between gap-3 pl-3">
                              <span>+ {a.name} <span className="text-xs text-graphite-500">({formatNumber(a.measure, 2)} {a.chargeUnit} × {formatBRL(a.laborPrice)})</span></span>
                              <b>{formatBRL(r.pricingMode === 'fixed' ? a.price : a.laborCost)}</b>
                            </div>
                          ))}
                        </div>
                      )}
                    </Card>
                  );
                })
              )}
              {(quote.paymentTerms || quote.notes) && (
                <Card className="space-y-3 p-5 text-sm">
                  {quote.paymentTerms && (
                    <div>
                      <div className="label">Condições de pagamento</div>
                      <p className="whitespace-pre-wrap">{quote.paymentTerms}</p>
                    </div>
                  )}
                  {quote.notes && (
                    <div>
                      <div className="label">Observações</div>
                      <p className="whitespace-pre-wrap">{quote.notes}</p>
                    </div>
                  )}
                </Card>
              )}
            </div>
          )}
          {tab === 'portal' && (
            <Card className="p-5">
              <div className="mb-4 flex flex-col gap-3">
                <div className="min-w-0 flex-1 text-sm">
                  {portalUrl ? (
                    <>
                      <div className="font-medium">Link individual do cliente</div>
                      <div className="mt-1 truncate font-mono text-xs text-graphite-500">{portalUrl}</div>
                    </>
                  ) : (
                    'Gere um link seguro para o cliente visualizar, baixar o PDF e aprovar ou recusar o orçamento.'
                  )}
                </div>
                {can('quotes', 'edit') && status !== 'draft' && (
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" icon={<Link2 className="h-4 w-4" />} onClick={copyLink}>
                      {portalUrl ? 'Copiar link' : 'Gerar link'}
                    </Button>
                    {portalUrl && (
                      <>
                        <a href={portalUrl} target="_blank" rel="noreferrer">
                          <Button size="sm" variant="outline" icon={<ExternalLink className="h-4 w-4" />}>
                            Abrir
                          </Button>
                        </a>
                        <Button size="sm" variant="ghost" onClick={revokeLink}>
                          Revogar
                        </Button>
                      </>
                    )}
                  </div>
                )}
              </div>
              {status === 'draft' && <p className="mb-4 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Gere o orçamento (situação Pendente) para liberar o portal ao cliente.</p>}
              <div className="label">Eventos do portal</div>
              {(events ?? []).length ? (
                <ol className="space-y-2">
                  {[...(events ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((ev) => (
                    <li key={ev.id} className="flex items-start gap-3 rounded-xl bg-graphite-50 p-3 text-sm dark:bg-white/[0.03]">
                      {ev.type === 'approved' ? <CheckCircle2 className="h-4 w-4 text-emerald-500" /> : ev.type === 'refused' ? <XCircle className="h-4 w-4 text-red-500" /> : ev.type === 'comment' ? <MessageSquare className="h-4 w-4 text-navy-500" /> : <Download className="h-4 w-4 text-graphite-400" />}
                      <div className="flex-1">
                        <div className="font-medium">{{ viewed: 'Visualizado pelo cliente', approved: 'Aprovado pelo cliente', refused: 'Recusado pelo cliente', comment: 'Observação do cliente' }[ev.type]}</div>
                        {ev.message && <div className="text-graphite-600 dark:text-graphite-300">{ev.message}</div>}
                        <div className="text-xs text-graphite-500">{fmtDateTime(ev.createdAt)} · IP {ev.ip || '—'}</div>
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-graphite-500">Nenhum evento registrado.</p>
              )}
            </Card>
          )}
          {tab === 'history' && (
            <Card className="p-5">
              <ChangeHistory entity="quotes" id={quote.id} labels={{ status: 'Situação', total: 'Total', validUntil: 'Validade', marginPct: 'Margem', discountValue: 'Desconto', environments: 'Ambientes', notes: 'Observações', clientId: 'Cliente' }} />
            </Card>
          )}
        </div>
        <div>
          <Card className="p-5 xl:sticky xl:top-20">
            <h3 className="mb-3 text-sm font-semibold">Resumo</h3>
            {calc ? <QuoteSummary calc={calc} /> : <p className="text-sm text-graphite-500">—</p>}
            {receivables.length > 0 && can('finance') && (
              <div className="mt-4 border-t border-graphite-100 pt-3 text-xs text-graphite-500 dark:border-white/5">
                {receivables.length} conta(s) a receber vinculada(s) · <Link className="text-navy-600 hover:underline dark:text-gold-300" to="/financeiro">ver financeiro</Link>
              </div>
            )}
          </Card>
        </div>
      </div>

      <ApproveModal open={approveOpen} onClose={() => setApproveOpen(false)} canFinance={can('finance', 'create')} onConfirm={(createReceivables, note) => setStatus('approved', { createReceivables, note })} />
      <JobFromQuoteModal open={jobOpen} onClose={() => setJobOpen(false)} quote={quote} />
    </div>
  );
}

function Info({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div>
      <div className="text-xs text-graphite-500">{label}</div>
      <div className="tabular font-medium">{value}</div>
      {hint && <div className="tabular text-[11px] text-graphite-500">{hint}</div>}
    </div>
  );
}

function ApproveModal({ open, onClose, onConfirm, canFinance }: { open: boolean; onClose: () => void; onConfirm: (createReceivables: boolean, note: string) => Promise<void>; canFinance: boolean }) {
  const [rec, setRec] = useState(true);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title="Registrar aprovação"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button
            loading={busy}
            onClick={async () => {
              setBusy(true);
              await onConfirm(canFinance && rec, note);
              setBusy(false);
              onClose();
            }}
          >
            Confirmar aprovação
          </Button>
        </>
      }
    >
      <div className="space-y-4 text-sm">
        <p>O orçamento será marcado como aprovado e não poderá mais ser alterado.</p>
        {canFinance && <Checkbox checked={rec} onChange={setRec} label="Criar automaticamente as contas a receber conforme as condições de pagamento" />}
        <Field label="Observação (opcional)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ex.: aprovado por telefone" />
        </Field>
      </div>
    </Modal>
  );
}

function JobFromQuoteModal({ open, onClose, quote }: { open: boolean; onClose: () => void; quote: Quote }) {
  const navigate = useNavigate();
  const [team, setTeam] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (start && end && end < start) return toast.error('A previsão de conclusão não pode ser anterior ao início.');
    setBusy(true);
    const jobId = uuid();
    const client = await getDb().clients.get(quote.clientId);
    await runCommand('job.fromQuote', { jobId, quoteId: quote.id, team, startDate: start || null, expectedEnd: end || null, notes }, {
      targets: [jobId, quote.id],
      description: `Gerar OS do orçamento ${formatQuoteNumber(quote.number)}`,
      optimistic: async () => {
        const now = new Date().toISOString();
        await getDb().jobs.put({
          id: jobId, number: null, quoteId: quote.id, clientId: quote.clientId,
          address: client ? [client.address && `${client.address}${client.number ? `, ${client.number}` : ''}`, client.district, client.city].filter(Boolean).join(' — ') : '',
          servicesSummary: (quote.calc?.environments ?? []).map((e) => `${e.name}: ${e.serviceName} — ${e.measure} ${e.chargeUnit}`).join('\n'),
          team, startDate: start || null, expectedEnd: end || null, completedAt: null, status: start ? 'scheduled' : 'waiting', contractedValue: quote.total, notes,
          materials: (quote.calc?.materials ?? []).map((m) => ({ productId: m.productId, name: m.name, unit: m.unit, plannedQty: m.qty, consumedQty: 0 })),
          createdAt: now, updatedAt: now, version: 0, deletedAt: null,
        });
      },
    });
    setBusy(false);
    toast('Controle de material criado.');
    onClose();
    navigate(`/obras/${jobId}`);
  };
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Gerar controle de material"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button loading={busy} onClick={submit}>
            Gerar OS
          </Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Equipe responsável">
          <Input value={team} onChange={(e) => setTeam(e.target.value)} placeholder="Ex.: João e Pedro" />
        </Field>
        <Field label="Data de início" hint="Se informada, o controle fica Agendado.">
          <Input type="date" value={start} min={todayISO()} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Previsão de conclusão">
          <Input type="date" value={end} min={start || undefined} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field className="sm:col-span-2" label="Observações">
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
