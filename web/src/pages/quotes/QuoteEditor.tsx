import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Calculator, ChevronDown, ChevronUp, Copy, History, Layers, Plus, RotateCcw, Save, Send, Trash2, UserPlus, X } from 'lucide-react';
import {
  addDaysISO,
  calculateQuote,
  formatQuoteNumber,
  quoteSchema,
  todayISO,
  type Client,
  type Deduction,
  type DiscountType,
  type EnvironmentInput,
  type EnvironmentResult,
  type Installment,
  type Quote,
  type Surface,
} from '@jn/shared';
import { getDb } from '../../lib/db';
import { saveRecord, useQuoteSettings, useRecord, useTable } from '../../lib/data';
import { useCatalog } from '../../lib/catalog';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { fmtDateTime, formatBRL, formatNumber, normalize } from '../../lib/format';
import { ClientFormModal } from '../../components/ClientForm';
import { QuoteSummary } from '../../components/QuoteSummary';
import { Badge, Button, Card, CardHeader, Checkbox, clsx, EmptyState, Field, Input, LoadingBlock, MoneyInput, NumberInput, PageHeader, Select, Textarea, toast } from '../../components/ui';

export interface QuoteDoc {
  clientId: string;
  title: string;
  issueDate: string;
  validUntil: string;
  marginPct: number;
  marginOnLabor: boolean;
  discountType: DiscountType;
  discountValue: number;
  installments: Installment[];
  paymentTerms: string;
  notes: string;
  environments: EnvironmentInput[];
}

const DOC_KEYS: (keyof QuoteDoc)[] = ['clientId', 'title', 'issueDate', 'validUntil', 'marginPct', 'marginOnLabor', 'discountType', 'discountValue', 'installments', 'paymentTerms', 'notes', 'environments'];
const pickDoc = (q: Quote): QuoteDoc => Object.fromEntries(DOC_KEYS.map((k) => [k, structuredClone(q[k])])) as unknown as QuoteDoc;

export default function QuoteEditor() {
  const { id: routeId } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const settings = useQuoteSettings();
  const catalog = useCatalog();
  const clients = useTable('clients');
  const existing = useRecord('quotes', routeId);
  const isEdit = !!routeId;

  const [quoteId] = useState(() => routeId ?? uuid());
  const draftKey = `quote:${isEdit ? quoteId : 'new'}`;
  const [doc, setDoc] = useState<QuoteDoc | null>(null);
  const [recoverable, setRecoverable] = useState<{ data: QuoteDoc; updatedAt: string } | null>(null);
  const [busy, setBusy] = useState<'draft' | 'pending' | null>(null);
  const [newClient, setNewClient] = useState(false);
  const [showSummary, setShowSummary] = useState(false);
  const initialized = useRef(false);

  // ---------- inicialização ----------
  useEffect(() => {
    if (initialized.current) return;
    if (isEdit && existing === undefined) return;
    if (!catalog.ready) return;
    (async () => {
      initialized.current = true;
      let base: QuoteDoc;
      if (isEdit) {
        if (!existing || existing.deletedAt) return setDoc(null);
        if (!['draft', 'pending', 'expired'].includes(existing.status)) {
          toast.warning('Orçamento aprovado ou recusado não pode ser editado. Use "Duplicar".');
          return navigate(`/orcamentos/${existing.id}`, { replace: true });
        }
        base = pickDoc(existing);
      } else {
        const dupId = params.get('duplicar');
        const dup = dupId ? await getDb().quotes.get(dupId) : null;
        const today = todayISO();
        base = dup
          ? { ...pickDoc(dup), issueDate: today, validUntil: addDaysISO(today, settings.validityDays), title: dup.title ? `${dup.title} (cópia)` : '', environments: dup.environments.map((e) => ({ ...structuredClone(e), id: uuid(), deductions: e.deductions.map((d) => ({ ...d, id: uuid() })) })) }
          : {
              clientId: params.get('cliente') ?? '',
              title: '',
              issueDate: today,
              validUntil: addDaysISO(today, settings.validityDays),
              marginPct: settings.marginPct,
              marginOnLabor: settings.marginOnLabor,
              discountType: 'none',
              discountValue: 0,
              installments: structuredClone(settings.installments),
              paymentTerms: settings.paymentTerms,
              notes: settings.defaultNotes,
              environments: [],
            };
      }
      setDoc(base);
      const draft = await getDb().drafts.get(draftKey);
      const dd = draft?.data as QuoteDoc | undefined;
      const meaningful = !!dd && (dd.environments.length > 0 || !!dd.clientId || !!dd.title);
      if (draft && meaningful && JSON.stringify(draft.data) !== JSON.stringify(base) && !params.get('duplicar')) setRecoverable({ data: draft.data as QuoteDoc, updatedAt: draft.updatedAt });
    })();
  }, [isEdit, existing, catalog.ready, params, settings, navigate, draftKey]);

  // ---------- salvamento automático da simulação (não perde dados ao atualizar/cair a conexão) ----------
  useEffect(() => {
    if (!doc || recoverable) return;
    const t = setTimeout(() => {
      void getDb().drafts.put({ id: draftKey, kind: 'quote', data: doc, updatedAt: new Date().toISOString() });
    }, 300);
    return () => clearTimeout(t);
  }, [doc, draftKey, recoverable]);

  const calc = useMemo(() => (doc ? calculateQuote(doc, catalog.calcServices, catalog.calcProducts) : null), [doc, catalog.calcServices, catalog.calcProducts]);
  const activeServices = useMemo(() => catalog.services.filter((s) => s.active).sort((a, b) => a.name.localeCompare(b.name)), [catalog.services]);

  if (!catalog.ready || (isEdit && existing === undefined) || (doc === null && !initialized.current)) return <LoadingBlock label="Carregando calculadora..." />;
  if (!doc || !calc) return <EmptyState title="Orçamento não encontrado" action={<Button onClick={() => navigate('/orcamentos')}>Voltar</Button>} />;

  const set = <K extends keyof QuoteDoc>(k: K, v: QuoteDoc[K]) => setDoc((d) => (d ? { ...d, [k]: v } : d));
  const setEnv = (i: number, patch: Partial<EnvironmentInput>) => setDoc((d) => (d ? { ...d, environments: d.environments.map((e, j) => (j === i ? { ...e, ...patch } : e)) } : d));
  const addEnv = (copyFrom?: EnvironmentInput) => {
    const svc = activeServices[0];
    const env: EnvironmentInput = copyFrom
      ? { ...structuredClone(copyFrom), id: uuid(), name: `${copyFrom.name} (cópia)`, deductions: copyFrom.deductions.map((d) => ({ ...d, id: uuid() })) }
      : { id: uuid(), name: `Ambiente ${doc.environments.length + 1}`, serviceId: svc?.id ?? '', width: 0, length: 0, height: 0, surface: 'floor', wastePct: settings.wastePct, laborPriceOverride: null, linearOverride: null, quantity: null, deductions: [] };
    set('environments', [...doc.environments, env]);
  };

  const client = clients?.find((c) => c.id === doc.clientId);

  const save = async (status: 'draft' | 'pending') => {
    if (!doc.clientId) return toast.error('Selecione o cliente do orçamento.');
    if (status === 'pending') {
      if (!doc.environments.length) return toast.error('Adicione pelo menos um ambiente.');
      if (calc.errors.length) return toast.error(calc.errors[0]);
    }
    const parsed = quoteSchema.safeParse({ ...doc, status });
    if (!parsed.success) return toast.error(parsed.error.issues[0]?.message ?? 'Verifique os dados do orçamento.');
    setBusy(status);
    try {
      const payload = { ...(parsed.data as unknown as QuoteDoc), status };
      await saveRecord('quotes', quoteId, payload as Partial<Quote>, `${status === 'pending' ? 'Gerar' : 'Salvar rascunho do'} orçamento`, {
        calc,
        total: calc.total,
        number: existing?.number ?? null,
        portalToken: existing?.portalToken ?? null,
        decidedAt: null,
        decidedBy: null,
        clientComment: existing?.clientComment ?? '',
        createdBy: existing?.createdBy ?? user!.id,
      } as Partial<Quote>);
      await getDb().drafts.delete(draftKey);
      toast(status === 'pending' ? 'Orçamento gerado.' : 'Rascunho salvo.');
      navigate(`/orcamentos/${quoteId}`, { replace: true });
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  const discardDraft = async () => {
    await getDb().drafts.delete(draftKey);
    setRecoverable(null);
  };

  return (
    <div className="animate-fade-in pb-24 xl:pb-0">
      <PageHeader
        back={
          <Link to={isEdit ? `/orcamentos/${quoteId}` : '/orcamentos'} className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-500 hover:text-graphite-800">
            <ArrowLeft className="h-4 w-4" /> {isEdit ? 'Voltar ao orçamento' : 'Orçamentos'}
          </Link>
        }
        title={
          <span className="flex items-center gap-2">
            <Calculator className="h-6 w-6 text-gold-500" />
            {isEdit ? `Editar ${formatQuoteNumber(existing?.number)}` : 'Calculadora de orçamento'}
          </span>
        }
        subtitle="Os dados digitados são salvos automaticamente neste aparelho."
        actions={
          <div className="hidden gap-2 xl:flex">
            <Button variant="outline" icon={<Save className="h-4 w-4" />} loading={busy === 'draft'} onClick={() => save('draft')}>
              Salvar rascunho
            </Button>
            <Button variant="gold" icon={<Send className="h-4 w-4" />} loading={busy === 'pending'} onClick={() => save('pending')}>
              Gerar orçamento
            </Button>
          </div>
        }
      />

      {recoverable && (
        <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-gold-300/60 bg-gold-50 p-4 sm:flex-row sm:items-center dark:border-gold-400/20 dark:bg-gold-400/5">
          <History className="h-5 w-5 shrink-0 text-gold-600" />
          <div className="flex-1 text-sm">
            <b>Simulação não finalizada encontrada</b> — salva em {fmtDateTime(recoverable.updatedAt)}. Deseja continuar de onde parou?
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={discardDraft}>
              Descartar
            </Button>
            <Button
              size="sm"
              variant="gold"
              icon={<RotateCcw className="h-4 w-4" />}
              onClick={() => {
                setDoc(recoverable.data);
                setRecoverable(null);
                toast('Simulação recuperada.');
              }}
            >
              Recuperar
            </Button>
          </div>
        </div>
      )}

      <div className="grid gap-5 xl:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-5">
          {/* Cliente e dados gerais */}
          <Card>
            <CardHeader title="Cliente e dados do orçamento" icon={<UserPlus className="h-4 w-4" />} />
            <div className="grid gap-4 p-5 sm:grid-cols-6">
              <Field className="sm:col-span-6" label="Cliente" required>
                <div className="flex gap-2">
                  <ClientPicker clients={clients ?? []} value={doc.clientId} onChange={(id) => set('clientId', id)} />
                  <Button variant="outline" className="h-[42px]" icon={<Plus className="h-4 w-4" />} onClick={() => setNewClient(true)}>
                    <span className="hidden sm:inline">Novo</span>
                  </Button>
                </div>
                {client && <p className="mt-1 text-xs text-graphite-500">{[client.phone || client.whatsapp, client.city].filter(Boolean).join(' · ')}</p>}
              </Field>
              <Field className="sm:col-span-6" label="Título / referência (opcional)">
                <Input value={doc.title} onChange={(e) => set('title', e.target.value)} placeholder="Ex.: Forro e sancas — apartamento 302" />
              </Field>
              <Field className="sm:col-span-2" label="Data">
                <Input type="date" value={doc.issueDate} onChange={(e) => set('issueDate', e.target.value)} />
              </Field>
              <Field className="sm:col-span-2" label="Validade">
                <Input type="date" value={doc.validUntil} min={doc.issueDate} onChange={(e) => set('validUntil', e.target.value)} />
              </Field>
              <Field className="sm:col-span-2" label="Margem de lucro" hint={<Checkbox checked={doc.marginOnLabor} onChange={(v) => set('marginOnLabor', v)} label="Aplicar também sobre a mão de obra" />}>
                <NumberInput value={doc.marginPct} onChange={(v) => set('marginPct', v ?? 0)} min={0} suffix="%" />
              </Field>
            </div>
          </Card>

          {/* Ambientes */}
          <div className="flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-semibold">
              <Layers className="h-5 w-5 text-navy-500 dark:text-gold-300" /> Ambientes <Badge tone="blue">{doc.environments.length}</Badge>
            </h2>
            <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => addEnv()} disabled={!activeServices.length}>
              Adicionar ambiente
            </Button>
          </div>
          {!activeServices.length && (
            <Card className="p-5 text-sm">
              Nenhum serviço ativo cadastrado. <Link to="/servicos" className="font-medium text-navy-600 underline dark:text-gold-300">Cadastre os serviços</Link> para usar a calculadora.
            </Card>
          )}
          {doc.environments.length === 0 && activeServices.length > 0 && (
            <Card>
              <EmptyState icon={<Layers className="h-6 w-6" />} title="Nenhum ambiente" description="Adicione os ambientes (sala, quarto, cozinha...) com as medidas e o serviço de cada um." action={<Button onClick={() => addEnv()}>Adicionar ambiente</Button>} />
            </Card>
          )}
          {doc.environments.map((env, i) => (
            <EnvironmentCard
              key={env.id}
              env={env}
              index={i}
              result={calc.environments[i]}
              services={catalog.services.filter((s) => s.active || s.id === env.serviceId)}
              onChange={(p) => setEnv(i, p)}
              onRemove={() => set('environments', doc.environments.filter((_, j) => j !== i))}
              onDuplicate={() => addEnv(env)}
              onMove={(dir) => {
                const arr = [...doc.environments];
                const j = i + dir;
                if (j < 0 || j >= arr.length) return;
                [arr[i], arr[j]] = [arr[j], arr[i]];
                set('environments', arr);
              }}
            />
          ))}

          {/* Desconto e pagamento */}
          <Card>
            <CardHeader title="Desconto comercial e condições de pagamento" />
            <div className="grid gap-4 p-5 sm:grid-cols-6">
              <Field className="sm:col-span-2" label="Tipo de desconto">
                <Select value={doc.discountType} onChange={(e) => setDoc({ ...doc, discountType: e.target.value as DiscountType, discountValue: 0 })}>
                  <option value="none">Sem desconto</option>
                  <option value="pct">Percentual (%)</option>
                  <option value="value">Valor (R$)</option>
                </Select>
              </Field>
              {doc.discountType === 'pct' && (
                <Field className="sm:col-span-2" label="Desconto (%)">
                  <NumberInput value={doc.discountValue} onChange={(v) => set('discountValue', v ?? 0)} min={0} suffix="%" />
                </Field>
              )}
              {doc.discountType === 'value' && (
                <Field className="sm:col-span-2" label="Desconto (R$)" hint={`Máximo: ${formatBRL(calc.subtotal)}`}>
                  <MoneyInput value={doc.discountValue} onChange={(v) => set('discountValue', v)} />
                </Field>
              )}
              {doc.discountType !== 'none' && (
                <div className="flex flex-col justify-end text-sm sm:col-span-2">
                  <span className="text-graphite-500">Antes: {formatBRL(calc.subtotal)}</span>
                  <span className="font-semibold">Final: {formatBRL(calc.total)}</span>
                </div>
              )}
              <div className="sm:col-span-6">
                <div className="mb-2 flex items-center justify-between">
                  <span className="label mb-0">Parcelas</span>
                  <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => set('installments', [...doc.installments, { label: `Parcela ${doc.installments.length + 1}`, pct: 0 }])}>
                    Parcela
                  </Button>
                </div>
                <div className="space-y-2">
                  {doc.installments.map((ins, i) => (
                    <div key={i} className="grid grid-cols-[1fr_110px_auto_auto] items-center gap-2">
                      <Input value={ins.label} onChange={(e) => set('installments', doc.installments.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} aria-label="Descrição da parcela" />
                      <NumberInput value={ins.pct} onChange={(v) => set('installments', doc.installments.map((x, j) => (j === i ? { ...x, pct: v ?? 0 } : x)))} min={0} suffix="%" aria-label="Percentual" />
                      <span className="tabular w-24 text-right text-sm font-medium">{formatBRL(calc.installments[i]?.amount ?? 0)}</span>
                      <Button variant="ghost" size="icon" disabled={doc.installments.length === 1} onClick={() => set('installments', doc.installments.filter((_, j) => j !== i))} aria-label="Remover parcela">
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              </div>
              <Field className="sm:col-span-6" label="Condições de pagamento (texto)">
                <Textarea value={doc.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} />
              </Field>
              <Field className="sm:col-span-6" label="Observações do orçamento">
                <Textarea value={doc.notes} onChange={(e) => set('notes', e.target.value)} />
              </Field>
            </div>
          </Card>
        </div>

        {/* Resumo (desktop: fixo na lateral) */}
        <div className="hidden xl:block">
          <div className="sticky top-20 space-y-3">
            <Card className="p-5">
              <h3 className="mb-3 text-sm font-semibold">Resumo automático</h3>
              <QuoteSummary calc={calc} />
              <Errors errors={calc.errors} />
            </Card>
          </div>
        </div>
      </div>

      {/* Resumo (celular: barra inferior expansível) */}
      <div className="fixed inset-x-0 bottom-16 z-20 lg:+bottom-0 lg:left-64 xl:hidden">
        {showSummary && (
          <div className="max-h-[60dvh] overflow-y-auto rounded-t-3xl border-t border-graphite-200 bg-white p-4 shadow-2xl dark:border-white/10 dark:bg-graphite-900">
            <QuoteSummary calc={calc} />
            <Errors errors={calc.errors} />
          </div>
        )}
        <div className="flex items-center gap-2 border-t border-graphite-200 bg-white/95 px-3 py-2 backdrop-blur dark:border-white/10 dark:bg-graphite-900/95">
          <button className="flex min-w-0 flex-1 items-center gap-2 text-left" onClick={() => setShowSummary((v) => !v)}>
            {showSummary ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
            <div className="min-w-0">
              <div className="text-[11px] text-graphite-500">Total {calc.errors.length > 0 && <span className="text-red-500">· {calc.errors.length} pendência(s)</span>}</div>
              <div className="tabular truncate text-lg font-semibold">{formatBRL(calc.total)}</div>
            </div>
          </button>
          <Button size="sm" variant="outline" loading={busy === 'draft'} onClick={() => save('draft')} aria-label="Salvar rascunho">
            <Save className="h-4 w-4" />
          </Button>
          <Button size="sm" variant="gold" loading={busy === 'pending'} onClick={() => save('pending')}>
            Gerar
          </Button>
        </div>
      </div>

      <ClientFormModal open={newClient} onClose={() => setNewClient(false)} onSaved={(c) => set('clientId', c.id)} />
    </div>
  );
}

function Errors({ errors }: { errors: string[] }) {
  if (!errors.length) return null;
  return (
    <ul className="mt-4 space-y-1 rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
      {errors.map((e, i) => (
        <li key={i}>• {e}</li>
      ))}
    </ul>
  );
}

function ClientPicker({ clients, value, onChange }: { clients: Client[]; value: string; onChange: (id: string) => void }) {
  const selected = clients.find((c) => c.id === value);
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const t = normalize(q);
    return clients
      .filter((c) => c.status !== 'inactive' || c.id === value)
      .filter((c) => !t || normalize(`${c.name} ${c.phone} ${c.whatsapp} ${c.document} ${c.city}`).includes(t))
      .sort((a, b) => a.name.localeCompare(b.name))
      .slice(0, 30);
  }, [clients, q, value]);
  return (
    <div className="relative flex-1">
      <Input
        value={open ? q : (selected?.name ?? '')}
        placeholder="Pesquisar cliente cadastrado..."
        onFocus={() => {
          setOpen(true);
          setQ('');
        }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => setQ(e.target.value)}
      />
      {open && (
        <ul className="absolute z-30 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-graphite-200 bg-white py-1 shadow-xl dark:border-white/10 dark:bg-graphite-800">
          {list.length ? (
            list.map((c) => (
              <li key={c.id}>
                <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => { onChange(c.id); setOpen(false); }} className={clsx('flex w-full flex-col px-3 py-2 text-left text-sm hover:bg-graphite-50 dark:hover:bg-white/5', c.id === value && 'bg-navy-50 dark:bg-white/5')}>
                  <span className="font-medium">{c.name}</span>
                  <span className="text-xs text-graphite-500">{[c.phone || c.whatsapp, c.city].filter(Boolean).join(' · ')}</span>
                </button>
              </li>
            ))
          ) : (
            <li className="px-3 py-3 text-sm text-graphite-500">Nenhum cliente encontrado. Use "Novo" para cadastrar.</li>
          )}
        </ul>
      )}
    </div>
  );
}

function EnvironmentCard({
  env,
  index,
  result,
  services,
  onChange,
  onRemove,
  onDuplicate,
  onMove,
}: {
  env: EnvironmentInput;
  index: number;
  result: EnvironmentResult | undefined;
  services: { id: string; name: string; measurementType: string; chargeUnit: string; laborPrice: number; pricingMode: string; active: boolean }[];
  onChange: (p: Partial<EnvironmentInput>) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const svc = services.find((s) => s.id === env.serviceId);
  const type = svc?.measurementType ?? 'm2';
  const [customLabor, setCustomLabor] = useState(env.laborPriceOverride != null);
  const setDed = (i: number, p: Partial<Deduction>) => onChange({ deductions: env.deductions.map((d, j) => (j === i ? { ...d, ...p } : d)) });

  return (
    <Card className="overflow-hidden">
      <div className="flex items-center gap-2 border-b border-graphite-100 bg-graphite-50/50 px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-navy-800 text-xs font-semibold text-white dark:bg-gold-400 dark:text-navy-950">{index + 1}</span>
        <Input className="h-9 flex-1 border-transparent bg-transparent font-semibold focus:bg-white dark:bg-transparent" value={env.name} onChange={(e) => onChange({ name: e.target.value })} aria-label="Nome do ambiente" />
        <div className="tabular hidden text-right text-sm font-semibold sm:block">{formatBRL(result?.price ?? 0)}</div>
        <Button variant="ghost" size="icon" onClick={() => onMove(-1)} aria-label="Mover para cima"><ChevronUp className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={() => onMove(1)} aria-label="Mover para baixo"><ChevronDown className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onDuplicate} aria-label="Duplicar ambiente" title="Duplicar ambiente"><Copy className="h-4 w-4" /></Button>
        <Button variant="ghost" size="icon" onClick={onRemove} aria-label="Remover ambiente"><Trash2 className="h-4 w-4 text-red-500" /></Button>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-6">
        <Field className="sm:col-span-4" label="Tipo de serviço">
          <Select value={env.serviceId} onChange={(e) => onChange({ serviceId: e.target.value, laborPriceOverride: null })}>
            <option value="">Selecione</option>
            {services.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name} — {formatBRL(s.laborPrice)}/{s.chargeUnit}
                {!s.active ? ' (inativo)' : ''}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Desperdício">
          <NumberInput value={env.wastePct} onChange={(v) => onChange({ wastePct: v ?? 0 })} min={0} suffix="%" />
        </Field>
        {type === 'm2' && (
          <Field className="sm:col-span-6" label="Superfície">
            <div className="flex gap-2">
              {(['floor', 'walls'] as Surface[]).map((s) => (
                <button key={s} type="button" onClick={() => onChange({ surface: s })} className={clsx('flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition', (env.surface ?? 'floor') === s ? 'border-navy-600 bg-navy-50 text-navy-800 dark:border-gold-400/60 dark:bg-gold-400/10 dark:text-gold-200' : 'border-graphite-200 text-graphite-600 hover:bg-graphite-50 dark:border-white/10 dark:text-graphite-300')}>
                  {s === 'floor' ? 'Teto / piso (L × C)' : 'Paredes (perímetro × altura)'}
                </button>
              ))}
            </div>
          </Field>
        )}
        {type !== 'unit' ? (
          <>
            <Field className="sm:col-span-2" label="Largura">
              <NumberInput value={env.width} onChange={(v) => onChange({ width: v ?? 0 })} decimals={3} min={0} suffix="m" />
            </Field>
            <Field className="sm:col-span-2" label="Comprimento">
              <NumberInput value={env.length} onChange={(v) => onChange({ length: v ?? 0 })} decimals={3} min={0} suffix="m" />
            </Field>
            <Field className="sm:col-span-2" label="Altura">
              <NumberInput value={env.height} onChange={(v) => onChange({ height: v ?? 0 })} decimals={3} min={0} suffix="m" />
            </Field>
          </>
        ) : (
          <Field className="sm:col-span-2" label="Quantidade">
            <NumberInput value={env.quantity ?? 1} onChange={(v) => onChange({ quantity: v ?? 0 })} decimals={2} min={0} suffix={svc?.chargeUnit} />
          </Field>
        )}
        {type === 'ml' && (
          <Field className="sm:col-span-3" label="Metragem linear manual (opcional)" hint="Se informada, substitui a medida calculada.">
            <NumberInput value={env.linearOverride} onChange={(v) => onChange({ linearOverride: v && v > 0 ? v : null })} decimals={3} min={0} suffix="m" />
          </Field>
        )}
        <div className="sm:col-span-3">
          <Checkbox
            checked={customLabor}
            onChange={(v) => {
              setCustomLabor(v);
              if (!v) onChange({ laborPriceOverride: null });
              else onChange({ laborPriceOverride: svc?.laborPrice ?? 0 });
            }}
            label="Preço personalizado da mão de obra"
          />
          {customLabor && (
            <div className="mt-2">
              <MoneyInput value={env.laborPriceOverride ?? 0} onChange={(v) => onChange({ laborPriceOverride: v })} />
            </div>
          )}
        </div>

        {/* Descontos de área */}
        {type !== 'unit' && (
          <div className="sm:col-span-6">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <span className="text-sm font-medium">Descontos de área</span>
                <span className="ml-2 text-xs text-graphite-500">{type === 'ml' ? 'Em metro linear, subtrai a largura de cada vão.' : 'Portas, janelas, vãos e recortes.'}</span>
              </div>
              <Button size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => onChange({ deductions: [...env.deductions, { id: uuid(), label: env.deductions.length ? 'Janela' : 'Porta', width: 0, length: 0, quantity: 1 }] })}>
                Desconto
              </Button>
            </div>
            {env.deductions.length > 0 && (
              <div className="space-y-2">
                {env.deductions.map((d, i) => (
                  <div key={d.id} className="grid grid-cols-2 gap-2 rounded-xl bg-graphite-50 p-2 sm:grid-cols-[1fr_110px_110px_80px_auto] dark:bg-white/[0.03]">
                    <Input className="col-span-2 sm:col-span-1" value={d.label} onChange={(e) => setDed(i, { label: e.target.value })} placeholder="Porta, janela, vão..." aria-label="Descrição" />
                    <NumberInput value={d.width} onChange={(v) => setDed(i, { width: v ?? 0 })} decimals={3} min={0} suffix="L" aria-label="Largura" />
                    <NumberInput value={d.length} onChange={(v) => setDed(i, { length: v ?? 0 })} decimals={3} min={0} suffix="C" aria-label="Comprimento" />
                    <NumberInput value={d.quantity ?? 1} onChange={(v) => setDed(i, { quantity: Math.max(1, Math.round(v ?? 1)) })} decimals={0} min={1} suffix="×" aria-label="Quantidade" />
                    <Button variant="ghost" size="icon" className="h-[42px]" onClick={() => onChange({ deductions: env.deductions.filter((_, j) => j !== i) })} aria-label="Remover desconto">
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Resultado do ambiente */}
      {result && svc && (
        <div className="border-t border-graphite-100 bg-navy-50/40 px-4 py-3 dark:border-white/5 dark:bg-white/[0.02]">
          <div className="tabular flex flex-wrap gap-x-5 gap-y-1 text-xs text-graphite-600 dark:text-graphite-300">
            {type === 'm2' && (
              <>
                <span>Área: <b>{formatNumber(result.grossArea, 2)} m²</b></span>
                {result.deductedArea > 0 && <span>Descontos: <b>−{formatNumber(result.deductedArea, 2)} m²</b></span>}
                <span>Líquida: <b>{formatNumber(result.netArea, 2)} m²</b></span>
              </>
            )}
            <span>Perímetro: <b>{formatNumber(result.perimeter, 2)} m</b></span>
            {type === 'ml' && <span>Metro linear: <b>{formatNumber(result.linear, 2)} m</b></span>}
            {result.plates > 0 && <span>Placas: <b>{result.plates}</b></span>}
            <span>Materiais: <b>{formatBRL(result.materialCost)}</b></span>
            {result.pricingMode === 'fixed' ? <span>Preço fixo: <b>{formatBRL(result.price)}</b></span> : <span>Mão de obra: <b>{formatBRL(result.laborCost)}</b></span>}
            <span className="sm:hidden">Total: <b>{formatBRL(result.price)}</b></span>
          </div>
          {result.materials.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {result.materials.map((m) => (
                <span key={m.productId} className="rounded-lg bg-white px-2 py-0.5 text-[11px] text-graphite-600 ring-1 ring-graphite-200 dark:bg-graphite-950 dark:text-graphite-300 dark:ring-white/10">
                  {m.name}: <b className="tabular">{formatNumber(m.qty, 3)} {m.unit}</b>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </Card>
  );
}
