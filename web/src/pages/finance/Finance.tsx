import { useEffect, useMemo, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, CheckCircle2, FileSpreadsheet, FileText, Pencil, Plus, Scale, Trash2, Wallet, AlertTriangle } from 'lucide-react';
import {
  FINANCE_IN_CATEGORIES,
  FINANCE_OUT_CATEGORIES,
  FINANCE_STATUS_LABEL,
  PAYMENT_METHODS,
  financeDisplayStatus,
  financeEntrySchema,
  formatJobNumber,
  formatQuoteNumber,
  todayISO,
  type FinanceEntry,
  type FinanceKind,
} from '@jn/shared';
import { getDb } from '../../lib/db';
import { deleteRecord, runCommand, saveRecord, useCompany, useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { fmtDate, formatBRL, isoToLocalDate, normalize } from '../../lib/format';
import { diffPatch, fieldErrors } from '../../lib/forms';
import { exportCsv, exportXlsx, reais } from '../../lib/export';
import { buildReportPdf } from '../../lib/pdf';
import { FinanceStatusBadge } from '../../lib/status';
import { inPeriod, PeriodFilter, periodFor, periodLabel, type Period } from '../../components/PeriodFilter';
import { Button, Card, confirmDialog, EmptyState, Field, Input, LoadingBlock, LoadMore, Modal, MoneyInput, PageHeader, SearchInput, Select, StatCard, Tabs, Textarea, toast, usePaged } from '../../components/ui';

const catLabel = (e: Pick<FinanceEntry, 'kind' | 'category'>) => (e.kind === 'in' ? FINANCE_IN_CATEGORIES : FINANCE_OUT_CATEGORIES)[e.category] ?? e.category;

export default function Finance() {
  const entries = useTable('financeEntries');
  const payments = useTable('payments');
  const clients = useTable('clients');
  const quotes = useTable('quotes');
  const jobs = useTable('jobs');
  const company = useCompany();
  const { can } = useAuth();
  const [tab, setTab] = useState<'all' | 'receivable' | 'payable' | 'overdue' | 'paid'>('all');
  const [period, setPeriod] = useState<Period>(periodFor('month'));
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [status, setStatus] = useState('');
  const [editing, setEditing] = useState<FinanceEntry | 'in' | 'out' | null>(null);
  const [paying, setPaying] = useState<FinanceEntry | null>(null);
  const clientMap = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);
  const today = todayISO();

  // indicadores (regime de caixa para recebidos/despesas; vencimento para a receber)
  const ind = useMemo(() => {
    const all = (entries ?? []).filter((e) => e.status !== 'cancelled');
    const entryMap = new Map(all.map((e) => [e.id, e]));
    let received = 0;
    let spent = 0;
    for (const p of payments ?? []) {
      const e = entryMap.get(p.entryId);
      if (!e || !inPeriod(isoToLocalDate(p.paidAt), period)) continue;
      if (e.kind === 'in') received += p.amount;
      else spent += p.amount;
    }
    const open = all.filter((e) => e.status === 'pending');
    const toReceive = open.filter((e) => e.kind === 'in').reduce((s, e) => s + e.amount - e.paidAmount, 0);
    const toPay = open.filter((e) => e.kind === 'out').reduce((s, e) => s + e.amount - e.paidAmount, 0);
    const overdue = open.filter((e) => e.kind === 'in' && e.dueDate < today).reduce((s, e) => s + e.amount - e.paidAmount, 0);
    const overduePay = open.filter((e) => e.kind === 'out' && e.dueDate < today).reduce((s, e) => s + e.amount - e.paidAmount, 0);
    // saldo acumulado: tudo que entrou menos tudo que saiu
    let balance = 0;
    for (const p of payments ?? []) {
      const e = entryMap.get(p.entryId);
      if (e) balance += e.kind === 'in' ? p.amount : -p.amount;
    }
    return { received, spent, result: received - spent, toReceive, toPay, overdue, overduePay, balance };
  }, [entries, payments, period, today]);

  const list = useMemo(() => {
    if (!entries) return undefined;
    const t = normalize(q);
    return entries
      .filter((e) => {
        const ds = financeDisplayStatus(e, today);
        if (tab === 'receivable' && !(e.kind === 'in' && e.status === 'pending')) return false;
        if (tab === 'payable' && !(e.kind === 'out' && e.status === 'pending')) return false;
        if (tab === 'overdue' && ds !== 'overdue') return false;
        if (tab === 'paid' && e.status !== 'paid') return false;
        if (status && ds !== status) return false;
        if (cat && e.category !== cat) return false;
        // contas em aberto aparecem sempre nas abas de vencimento; demais respeitam o período
        const ref = e.status === 'paid' && e.paidAt ? isoToLocalDate(e.paidAt) : e.dueDate;
        if (!['receivable', 'payable', 'overdue'].includes(tab) && !inPeriod(ref, period)) return false;
        if (t && !normalize(`${e.description} ${clientMap.get(e.clientId ?? '')?.name ?? ''} ${e.notes}`).includes(t)) return false;
        return true;
      })
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  }, [entries, tab, status, cat, period, q, clientMap, today]);
  const { visible, more, loadMore, total } = usePaged(list, 40);

  const exportRows = () =>
    (list ?? []).map((e) => [fmtDate(e.dueDate), e.kind === 'in' ? 'Entrada' : 'Saída', catLabel(e), e.description, clientMap.get(e.clientId ?? '')?.name ?? '', reais(e.amount), reais(e.paidAmount), FINANCE_STATUS_LABEL[financeDisplayStatus(e)], e.paidAt ? fmtDate(e.paidAt) : '']);
  const cols = ['Vencimento', 'Tipo', 'Categoria', 'Descrição', 'Cliente', 'Valor (R$)', 'Pago (R$)', 'Situação', 'Pagamento'];

  const markPaid = (e: FinanceEntry) => setPaying(e);
  const remove = async (e: FinanceEntry) => {
    if (!(await confirmDialog({ title: 'Excluir lançamento', message: <>Excluir <b>{e.description}</b> ({formatBRL(e.amount)})? Lançamentos com pagamentos não podem ser excluídos.</>, danger: true, confirmLabel: 'Excluir' }))) return;
    await deleteRecord('financeEntries', e.id, `Excluir lançamento ${e.description}`);
    toast('Exclusão enviada.');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Financeiro"
        subtitle={periodLabel(period)}
        actions={
          can('finance', 'create') && (
            <>
              <Button variant="outline" icon={<ArrowDownCircle className="h-4 w-4 text-emerald-600" />} onClick={() => setEditing('in')}>Entrada</Button>
              <Button icon={<ArrowUpCircle className="h-4 w-4" />} onClick={() => setEditing('out')}>Saída</Button>
            </>
          )
        }
      />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Total recebido (período)" value={formatBRL(ind.received)} icon={<ArrowDownCircle className="h-4 w-4" />} tone="green" />
        <StatCard label="Despesas pagas (período)" value={formatBRL(ind.spent)} icon={<ArrowUpCircle className="h-4 w-4" />} tone="red" />
        <StatCard label="Resultado do período" value={formatBRL(ind.result)} icon={<Scale className="h-4 w-4" />} tone={ind.result >= 0 ? 'blue' : 'red'} />
        <StatCard label="Saldo financeiro" value={formatBRL(ind.balance)} icon={<Wallet className="h-4 w-4" />} tone="gold" hint="Todas as entradas − saídas pagas" />
        <StatCard label="A receber" value={formatBRL(ind.toReceive)} tone="amber" onClick={() => setTab('receivable')} />
        <StatCard label="Recebimentos vencidos" value={formatBRL(ind.overdue)} icon={<AlertTriangle className="h-4 w-4" />} tone={ind.overdue ? 'red' : 'green'} onClick={() => setTab('overdue')} />
        <StatCard label="A pagar" value={formatBRL(ind.toPay)} tone="violet" onClick={() => setTab('payable')} />
        <StatCard label="Contas a pagar vencidas" value={formatBRL(ind.overduePay)} tone={ind.overduePay ? 'red' : 'green'} onClick={() => setTab('overdue')} />
      </div>

      <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ value: 'all', label: 'Lançamentos' }, { value: 'receivable', label: 'Contas a receber' }, { value: 'payable', label: 'Contas a pagar' }, { value: 'overdue', label: 'Vencidos' }, { value: 'paid', label: 'Pagos' }]} />
      <Card className="mb-4 flex flex-col gap-3 p-3 sm:p-4 lg:flex-row lg:flex-wrap lg:items-center">
        <PeriodFilter value={period} onChange={setPeriod} />
        <SearchInput className="lg:w-64" value={q} onChange={setQ} placeholder="Descrição ou cliente" />
        <Select className="lg:w-56" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          <optgroup label="Entradas">{Object.entries(FINANCE_IN_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
          <optgroup label="Saídas">{Object.entries(FINANCE_OUT_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</optgroup>
        </Select>
        <Select className="lg:w-40" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação">
          <option value="">Todas as situações</option>
          {Object.entries(FINANCE_STATUS_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
        </Select>
        <div className="flex gap-2 lg:ml-auto">
          <Button size="sm" variant="outline" icon={<FileText className="h-4 w-4" />} onClick={async () => (await buildReportPdf('Lançamentos financeiros', periodLabel(period), cols, exportRows().map((r) => r.map((c) => (typeof c === 'number' ? formatBRL(Math.round(c * 100)) : c ?? ''))), [['Recebido', formatBRL(ind.received)], ['Despesas', formatBRL(ind.spent)], ['Resultado', formatBRL(ind.result)], ['A receber', formatBRL(ind.toReceive)]], company, true)).save('financeiro.pdf')}>PDF</Button>
          <Button size="sm" variant="outline" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={() => exportXlsx('financeiro', cols, exportRows(), 'Financeiro')}>Excel</Button>
          <Button size="sm" variant="outline" onClick={() => exportCsv('financeiro', cols, exportRows())}>CSV</Button>
        </div>
      </Card>

      {!list ? (
        <LoadingBlock />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<Wallet className="h-6 w-6" />} title="Nenhum lançamento" description="Registre entradas e saídas, ou crie as contas a receber a partir de um orçamento aprovado." />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <ul className="divide-y divide-graphite-100 dark:divide-white/5">
            {visible.map((e) => {
              const remaining = e.amount - e.paidAmount;
              const quote = e.quoteId ? quotes?.find((x) => x.id === e.quoteId) : null;
              const job = e.jobId ? jobs?.find((x) => x.id === e.jobId) : null;
              return (
                <li key={e.id} className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    {e.kind === 'in' ? <ArrowDownCircle className="mt-0.5 h-5 w-5 shrink-0 text-emerald-500" /> : <ArrowUpCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-500" />}
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium">{e.description}</div>
                      <div className="truncate text-xs text-graphite-500">
                        {catLabel(e)} · vence {fmtDate(e.dueDate)}
                        {e.clientId && ` · ${clientMap.get(e.clientId)?.name ?? ''}`}
                        {quote && ` · ${formatQuoteNumber(quote.number)}`}
                        {job && ` · ${formatJobNumber(job.number)}`}
                        {e.paidAt && ` · pago em ${fmtDate(e.paidAt)}`}
                        {e._syncError && <span className="text-red-500"> · não sincronizado</span>}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 pl-8 sm:pl-0">
                    <div className="text-right">
                      <div className={`tabular text-sm font-semibold ${e.kind === 'in' ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'}`}>{e.kind === 'out' && '− '}{formatBRL(e.amount)}</div>
                      {e.paidAmount > 0 && e.status !== 'paid' && <div className="tabular text-[11px] text-graphite-500">restam {formatBRL(remaining)}</div>}
                    </div>
                    <FinanceStatusBadge entry={e} />
                    <div className="flex">
                      {can('finance', 'edit') && e.status === 'pending' && (
                        <Button size="sm" variant="ghost" icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />} onClick={() => markPaid(e)}>
                          <span className="hidden xl:inline">{e.kind === 'in' ? 'Receber' : 'Pagar'}</span>
                        </Button>
                      )}
                      {can('finance', 'edit') && <Button size="icon" variant="ghost" onClick={() => setEditing(e)} aria-label="Editar"><Pencil className="h-4 w-4" /></Button>}
                      {can('finance', 'delete') && e.paidAmount === 0 && <Button size="icon" variant="ghost" onClick={() => remove(e)} aria-label="Excluir"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
          <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
        </Card>
      )}
      {editing && <EntryModal entry={typeof editing === 'string' ? null : editing} kind={typeof editing === 'string' ? editing : editing.kind} onClose={() => setEditing(null)} />}
      {paying && <PayModal entry={paying} onClose={() => setPaying(null)} />}
    </div>
  );
}

type Form = { kind: FinanceKind; category: string; description: string; amount: number; dueDate: string; status: 'pending' | 'cancelled'; clientId: string | null; quoteId: string | null; jobId: string | null; method: string; notes: string };

export function EntryModal({ entry, kind, onClose }: { entry: FinanceEntry | null; kind: FinanceKind; onClose: () => void }) {
  const clients = useTable('clients');
  const quotes = useTable('quotes');
  const jobs = useTable('jobs');
  const [f, setF] = useState<Form>({ kind, category: kind === 'in' ? 'recebimento' : 'materiais', description: '', amount: 0, dueDate: todayISO(), status: 'pending', clientId: null, quoteId: null, jobId: null, method: '', notes: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (entry) setF({ kind: entry.kind, category: entry.category, description: entry.description, amount: entry.amount, dueDate: entry.dueDate, status: entry.status === 'cancelled' ? 'cancelled' : 'pending', clientId: entry.clientId, quoteId: entry.quoteId, jobId: entry.jobId, method: entry.method, notes: entry.notes });
  }, [entry]);
  const cats = f.kind === 'in' ? FINANCE_IN_CATEGORIES : FINANCE_OUT_CATEGORIES;
  const paid = entry?.status === 'paid';
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const data = { ...f, ...(paid ? { status: undefined } : {}) };
    const parsed = financeEntrySchema.safeParse(data);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (entry && f.amount < entry.paidAmount) return setErrors({ amount: 'O valor não pode ser menor que o já pago.' });
    const clean = parsed.data as Record<string, unknown>;
    if (paid) delete clean.status;
    const patch = diffPatch(entry as unknown as Record<string, unknown> | null, clean);
    if (entry && !Object.keys(patch).length) return onClose();
    await saveRecord('financeEntries', entry?.id ?? uuid(), patch as Partial<FinanceEntry>, `${entry ? 'Alterar' : 'Registrar'} lançamento ${f.description}`, entry ? undefined : { paidAmount: 0, paidAt: null, dedupeKey: null, status: 'pending' } as Partial<FinanceEntry>);
    toast(entry ? 'Lançamento atualizado.' : 'Lançamento registrado.');
    onClose();
  };

  const clientQuotes = (quotes ?? []).filter((q) => !f.clientId || q.clientId === f.clientId);
  const clientJobs = (jobs ?? []).filter((j) => !f.clientId || j.clientId === f.clientId);
  return (
    <Modal open onClose={onClose} size="lg" closeOnBackdrop={false} title={`${entry ? 'Editar' : 'Nova'} ${f.kind === 'in' ? 'entrada' : 'saída'}`} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-6">
        {!entry && (
          <Field className="sm:col-span-6" label="Tipo">
            <Tabs value={f.kind} onChange={(k) => setF({ ...f, kind: k, category: k === 'in' ? 'recebimento' : 'materiais' })} tabs={[{ value: 'in', label: 'Entrada' }, { value: 'out', label: 'Saída' }]} />
          </Field>
        )}
        <Field className="sm:col-span-4" label="Descrição" required error={errors.description}>
          <Input value={f.description} onChange={(e) => set('description', e.target.value)} autoFocus />
        </Field>
        <Field className="sm:col-span-2" label="Categoria" error={errors.category}>
          <Select value={f.category} onChange={(e) => set('category', e.target.value)}>
            {Object.entries(cats).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Valor" required error={errors.amount} hint={paid ? 'Lançamento quitado: valor bloqueado.' : undefined}>
          <MoneyInput value={f.amount} onChange={(v) => set('amount', v)} disabled={paid} />
        </Field>
        <Field className="sm:col-span-2" label="Vencimento" required error={errors.dueDate}>
          <Input type="date" value={f.dueDate} onChange={(e) => set('dueDate', e.target.value)} />
        </Field>
        <Field className="sm:col-span-2" label="Forma de pagamento">
          <Select value={f.method} onChange={(e) => set('method', e.target.value)}>
            <option value="">—</option>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Cliente relacionado">
          <Select value={f.clientId ?? ''} onChange={(e) => setF({ ...f, clientId: e.target.value || null, quoteId: null, jobId: null })}>
            <option value="">—</option>
            {[...(clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Orçamento relacionado">
          <Select value={f.quoteId ?? ''} onChange={(e) => set('quoteId', e.target.value || null)}>
            <option value="">—</option>
            {clientQuotes.filter((q) => q.number).map((q) => <option key={q.id} value={q.id}>{formatQuoteNumber(q.number)} — {formatBRL(q.total)}</option>)}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Obra relacionada">
          <Select value={f.jobId ?? ''} onChange={(e) => set('jobId', e.target.value || null)}>
            <option value="">—</option>
            {clientJobs.filter((j) => j.number).map((j) => <option key={j.id} value={j.id}>{formatJobNumber(j.number)}</option>)}
          </Select>
        </Field>
        {entry && !paid && (
          <Field className="sm:col-span-3" label="Situação">
            <Select value={f.status} onChange={(e) => set('status', e.target.value as Form['status'])} disabled={(entry?.paidAmount ?? 0) > 0}>
              <option value="pending">Pendente</option>
              <option value="cancelled">Cancelado</option>
            </Select>
          </Field>
        )}
        <Field className="sm:col-span-6" label="Observações">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        {!entry && <p className="text-xs text-graphite-500 sm:col-span-6">O lançamento é criado como pendente. Use "Receber/Pagar" para confirmar o pagamento — nada é marcado como pago automaticamente.</p>}
      </div>
    </Modal>
  );
}

export function PayModal({ entry, onClose }: { entry: FinanceEntry; onClose: () => void }) {
  const remaining = entry.amount - entry.paidAmount;
  const [amount, setAmount] = useState(remaining);
  const [date, setDate] = useState(todayISO());
  const [method, setMethod] = useState(entry.method || 'pix');
  const [notes, setNotes] = useState('');
  const { user } = useAuth();
  const submit = async () => {
    if (amount <= 0) return toast.error('Informe o valor.');
    if (amount > remaining) return toast.error(`O valor não pode passar do saldo em aberto (${formatBRL(remaining)}).`);
    const paymentId = uuid();
    await runCommand('finance.pay', { entryId: entry.id, paymentId, amount, paidAt: date, method, notes }, {
      targets: [entry.id, paymentId],
      description: `Pagamento de ${entry.description}`,
      optimistic: async () => {
        const db = getDb();
        const now = new Date().toISOString();
        const paidAmount = entry.paidAmount + amount;
        const done = paidAmount >= entry.amount;
        await db.payments.put({ id: paymentId, entryId: entry.id, amount, paidAt: new Date(`${date}T12:00:00`).toISOString(), method, notes, createdBy: user!.id, createdAt: now, updatedAt: now, version: 0, deletedAt: null });
        await db.financeEntries.update(entry.id, { paidAmount, status: done ? 'paid' : 'pending', paidAt: done ? new Date(`${date}T12:00:00`).toISOString() : entry.paidAt, method });
      },
    });
    toast(amount >= remaining ? 'Pagamento confirmado.' : 'Pagamento parcial registrado.');
    onClose();
  };
  return (
    <Modal open onClose={onClose} size="sm" title={entry.kind === 'in' ? 'Confirmar recebimento' : 'Confirmar pagamento'} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Confirmar</Button></>}>
      <div className="space-y-4">
        <div className="rounded-xl bg-graphite-50 p-3 text-sm dark:bg-white/[0.03]">
          <div className="font-medium">{entry.description}</div>
          <div className="text-graphite-500">Valor {formatBRL(entry.amount)} · em aberto <b>{formatBRL(remaining)}</b></div>
        </div>
        <Field label="Valor pago" hint="Pode ser parcial.">
          <MoneyInput value={amount} onChange={setAmount} />
        </Field>
        <Field label="Data do pagamento">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        <Field label="Forma de pagamento">
          <Select value={method} onChange={(e) => setMethod(e.target.value)}>
            {Object.entries(PAYMENT_METHODS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Select>
        </Field>
        <Field label="Observação">
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />
        </Field>
      </div>
    </Modal>
  );
}
