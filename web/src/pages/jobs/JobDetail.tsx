import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarClock, CheckCircle2, MessageSquarePlus, Package, Pause, Pencil, Play, Plus, Trash2, X, XCircle } from 'lucide-react';
import { JOB_EVENT_LABEL, JOB_TRANSITIONS, formatJobNumber, formatQuoteNumber, roundTo, todayISO, type Job, type JobMaterial, type JobStatus } from '@jn/shared';
import { getDb } from '../../lib/db';
import { deleteRecord, runCommand, saveRecord, useRecord, useTable, useWhere } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { fmtDate, fmtDateTime, formatBRL, formatNumber } from '../../lib/format';
import { FinanceStatusBadge, JobStatusBadge } from '../../lib/status';
import { Button, Card, CardHeader, Checkbox, confirmDialog, EmptyState, Field, Input, KeyValue, LoadingBlock, Modal, MoneyInput, NumberInput, PageHeader, Select, Textarea, toast } from '../../components/ui';

interface Line {
  productId: string;
  quantity: number | null;
}

export default function JobDetail() {
  const { id } = useParams();
  const job = useRecord('jobs', id);
  const client = useRecord('clients', job?.clientId);
  const quote = useRecord('quotes', job?.quoteId ?? undefined);
  const events = useWhere('jobEvents', 'jobId', id);
  const entries = useWhere('financeEntries', 'jobId', id);
  const products = useTable('products');
  const { can, user } = useAuth();
  const navigate = useNavigate();
  const [note, setNote] = useState('');
  const [consumeOpen, setConsumeOpen] = useState(false);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [scheduleOpen, setScheduleOpen] = useState(false);
  const [pauseOpen, setPauseOpen] = useState(false);
  const timeline = useMemo(() => [...(events ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [events]);

  if (job === undefined) return <LoadingBlock />;
  if (!job || job.deletedAt) return <EmptyState title="Controle de material não encontrado" action={<Button onClick={() => navigate('/obras')}>Voltar</Button>} />;
  const canEdit = can('jobs', 'edit');
  const closed = job.status === 'completed' || job.status === 'cancelled';
  const allowed = JOB_TRANSITIONS[job.status];

  const optimisticEvent = async (type: keyof typeof JOB_EVENT_LABEL, text: string, statusTo: JobStatus | null, eventId: string) => {
    const now = new Date().toISOString();
    await getDb().jobEvents.put({ id: eventId, jobId: job.id, type, note: text, statusTo, createdBy: user!.id, createdByName: user!.name, createdAt: now, updatedAt: now, version: 0, deletedAt: null });
  };

  const changeStatus = async (status: Exclude<JobStatus, 'completed'>, opts: { date?: string; note?: string } = {}) => {
    if (status === 'cancelled' && !(await confirmDialog({ title: 'Cancelar obra', message: 'A ordem de serviço será cancelada e não poderá ser reaberta.', danger: true, confirmLabel: 'Cancelar obra' }))) return;
    const eventId = uuid();
    const type = status === 'scheduled' ? 'scheduled' : status === 'in_progress' ? (job.status === 'paused' ? 'resumed' : 'started') : status === 'paused' ? 'paused' : status === 'cancelled' ? 'cancelled' : 'updated';
    await runCommand('job.setStatus', { jobId: job.id, eventId, status, note: opts.note ?? '', ...(opts.date ? { date: opts.date } : {}) }, {
      targets: [job.id, eventId],
      description: `${formatJobNumber(job.number)}: ${status}`,
      optimistic: async () => {
        await getDb().jobs.update(job.id, { status, ...(opts.date && (status === 'scheduled' || status === 'in_progress') ? { startDate: opts.date } : status === 'in_progress' && !job.startDate ? { startDate: todayISO() } : {}) });
        await optimisticEvent(type, opts.note ?? '', status, eventId);
      },
    });
    toast('Situação da obra atualizada.');
  };

  const addNote = async () => {
    if (!note.trim()) return;
    const eventId = uuid();
    await runCommand('job.addNote', { jobId: job.id, eventId, note: note.trim() }, { targets: [job.id, eventId], description: 'Atualização da obra', optimistic: () => optimisticEvent('note', note.trim(), null, eventId) });
    setNote('');
  };

  const remove = async () => {
    if (!(await confirmDialog({ title: 'Excluir controle', message: 'Excluir este controle de material? Ele some da lista (o histórico de estoque é mantido).', danger: true, confirmLabel: 'Excluir' }))) return;
    await deleteRecord('jobs', job.id, `Excluir ${formatJobNumber(job.number)}`);
    navigate('/obras');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={<Link to="/obras" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-500 hover:text-graphite-800"><ArrowLeft className="h-4 w-4" /> Controle de material</Link>}
        title={<span className="flex flex-wrap items-center gap-3">{formatJobNumber(job.number)} <JobStatusBadge status={job.status} /></span>}
        subtitle={<>{client ? <Link className="hover:underline" to={`/clientes/${client.id}`}>{client.name}</Link> : '—'}{quote && <> · origem <Link className="hover:underline" to={`/orcamentos/${quote.id}`}>{formatQuoteNumber(quote.number)}</Link></>}</>}
        actions={
          <>
            {canEdit && !closed && <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditOpen(true)}>Editar</Button>}
            {can('jobs', 'delete') && <Button variant="ghost" size="icon" onClick={remove} aria-label="Excluir"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </>
        }
      />

      {canEdit && !closed && (
        <Card className="mb-5 flex flex-wrap items-center gap-2 p-4">
          <span className="mr-auto text-sm text-graphite-500">Ações da obra</span>
          {allowed.includes('scheduled') && <Button variant="outline" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setScheduleOpen(true)}>Agendar</Button>}
          {allowed.includes('in_progress') && <Button icon={<Play className="h-4 w-4" />} onClick={() => changeStatus('in_progress')}>{job.status === 'paused' ? 'Retomar' : 'Iniciar obra'}</Button>}
          {allowed.includes('paused') && <Button variant="outline" icon={<Pause className="h-4 w-4" />} onClick={() => setPauseOpen(true)}>Pausar</Button>}
          {(job.status === 'in_progress' || job.status === 'paused') && <Button variant="gold" icon={<CheckCircle2 className="h-4 w-4" />} onClick={() => setCompleteOpen(true)}>Concluir obra</Button>}
          {allowed.includes('cancelled') && <Button variant="ghost" icon={<XCircle className="h-4 w-4 text-red-500" />} onClick={() => changeStatus('cancelled')}>Cancelar</Button>}
        </Card>
      )}

      <div className="grid gap-5 xl:grid-cols-[360px_1fr]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Dados da obra" />
            <dl className="grid grid-cols-2 gap-4 p-5">
              <KeyValue className="col-span-2" label="Endereço">{job.address}</KeyValue>
              <KeyValue label="Início">{fmtDate(job.startDate)}</KeyValue>
              <KeyValue label="Previsão de conclusão">{fmtDate(job.expectedEnd)}</KeyValue>
              {job.completedAt && <KeyValue label="Concluída em">{fmtDate(job.completedAt)}</KeyValue>}
              <KeyValue label="Valor contratado">{formatBRL(job.contractedValue)}</KeyValue>
              <KeyValue className="col-span-2" label="Equipe responsável">{job.team}</KeyValue>
              <KeyValue className="col-span-2" label="Serviços contratados">{job.servicesSummary && <span className="whitespace-pre-wrap">{job.servicesSummary}</span>}</KeyValue>
              <KeyValue className="col-span-2" label="Observações">{job.notes && <span className="whitespace-pre-wrap">{job.notes}</span>}</KeyValue>
            </dl>
          </Card>
          {can('finance') && (entries ?? []).length > 0 && (
            <Card>
              <CardHeader title="Recebimentos" />
              <ul className="divide-y divide-graphite-100 dark:divide-white/5">
                {(entries ?? []).map((e) => (
                  <li key={e.id} className="flex items-center gap-2 px-4 py-2.5 text-sm">
                    <span className="min-w-0 flex-1 truncate">{e.description}</span>
                    <span className="tabular font-medium">{formatBRL(e.amount)}</span>
                    <FinanceStatusBadge entry={e} />
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        <div className="min-w-0 space-y-5">
          <Card>
            <CardHeader title="Material de drywall" subtitle="Previsto × consumido (uso interno)" icon={<Package className="h-4 w-4" />} action={canEdit && !closed && <Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setConsumeOpen(true)}>Registrar consumo</Button>} />
            {job.materials.length ? (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[480px]">
                  <thead>
                    <tr className="border-b border-graphite-100 dark:border-white/5">
                      <th className="th">Material</th>
                      <th className="th text-right">Previsto</th>
                      <th className="th text-right">Consumido</th>
                      <th className="th text-right">Diferença</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-graphite-100 dark:divide-white/5">
                    {job.materials.map((m) => {
                      const diff = roundTo(m.consumedQty - m.plannedQty, 3);
                      return (
                        <tr key={m.productId}>
                          <td className="td">{m.name}</td>
                          <td className="td tabular text-right">{formatNumber(m.plannedQty, 3)} {m.unit}</td>
                          <td className="td tabular text-right font-medium">{formatNumber(m.consumedQty, 3)} {m.unit}</td>
                          <td className={`td tabular text-right ${diff > 0 ? 'text-red-600' : 'text-graphite-500'}`}>{diff > 0 ? '+' : ''}{formatNumber(diff, 3)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="p-5 text-sm text-graphite-500">Nenhum material previsto.</p>
            )}
          </Card>

          <Card>
            <CardHeader title="Linha do tempo" />
            <div className="p-5">
              {canEdit && (
                <div className="mb-5 flex gap-2">
                  <Input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Registrar atualização, observação ou ocorrência..." onKeyDown={(e) => e.key === 'Enter' && void addNote()} />
                  <Button icon={<MessageSquarePlus className="h-4 w-4" />} onClick={addNote} disabled={!note.trim()}>
                    <span className="hidden sm:inline">Registrar</span>
                  </Button>
                </div>
              )}
              {timeline.length ? (
                <ol className="relative space-y-4 border-l border-graphite-200 pl-5 dark:border-white/10">
                  {timeline.map((ev) => (
                    <li key={ev.id} className="relative">
                      <span className={`absolute top-1 -left-[26px] h-3 w-3 rounded-full border-2 border-white dark:border-graphite-900 ${ev.type === 'completed' ? 'bg-emerald-500' : ev.type === 'cancelled' ? 'bg-red-500' : ev.type === 'paused' ? 'bg-amber-500' : 'bg-navy-500 dark:bg-gold-400'}`} />
                      <div className="text-sm font-medium">{JOB_EVENT_LABEL[ev.type] ?? ev.type}</div>
                      {ev.note && <p className="text-sm whitespace-pre-wrap text-graphite-600 dark:text-graphite-300">{ev.note}</p>}
                      <div className="text-xs text-graphite-500">{fmtDateTime(ev.createdAt)} · {ev.createdByName || 'Sistema'}</div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="text-sm text-graphite-500">Sem eventos.</p>
              )}
            </div>
          </Card>
        </div>
      </div>

      {consumeOpen && <ConsumeModal job={job} products={products ?? []} mode="consume" onClose={() => setConsumeOpen(false)} />}
      {completeOpen && <ConsumeModal job={job} products={products ?? []} mode="complete" onClose={() => setCompleteOpen(false)} />}
      {editOpen && <EditJobModal job={job} onClose={() => setEditOpen(false)} />}
      {pauseOpen && <PauseModal onClose={() => setPauseOpen(false)} onConfirm={(n) => changeStatus('paused', { note: n })} />}
      {scheduleOpen && <ScheduleModal onClose={() => setScheduleOpen(false)} onConfirm={(d) => changeStatus('scheduled', { date: d, note: `Início agendado para ${fmtDate(d)}` })} />}
    </div>
  );
}

function ScheduleModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (date: string) => Promise<void> }) {
  const [d, setD] = useState(todayISO());
  return (
    <Modal open onClose={onClose} size="sm" title="Agendar início da obra" footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={async () => { await onConfirm(d); onClose(); }}>Agendar</Button></>}>
      <Field label="Data de início">
        <Input type="date" value={d} onChange={(e) => setD(e.target.value)} />
      </Field>
    </Modal>
  );
}

function PauseModal({ onClose, onConfirm }: { onClose: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [n, setN] = useState('');
  return (
    <Modal open onClose={onClose} size="sm" title="Pausar obra" footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={async () => { await onConfirm(n); onClose(); }}>Pausar</Button></>}>
      <Field label="Motivo da pausa (opcional)">
        <Input value={n} onChange={(e) => setN(e.target.value)} placeholder="Ex.: aguardando material, chuva..." autoFocus />
      </Field>
    </Modal>
  );
}

function EditJobModal({ job, onClose }: { job: Job; onClose: () => void }) {
  const [f, setF] = useState({ address: job.address, servicesSummary: job.servicesSummary, team: job.team, startDate: job.startDate ?? '', expectedEnd: job.expectedEnd ?? '', notes: job.notes, contractedValue: job.contractedValue });
  const submit = async () => {
    const data = { ...f, startDate: f.startDate || null, expectedEnd: f.expectedEnd || null };
    const patch = Object.fromEntries(Object.entries(data).filter(([k, v]) => JSON.stringify((job as unknown as Record<string, unknown>)[k]) !== JSON.stringify(v)));
    if (Object.keys(patch).length) await saveRecord('jobs', job.id, patch as Partial<Job>, `Alterar ${formatJobNumber(job.number)}`);
    toast('Obra atualizada.');
    onClose();
  };
  return (
    <Modal open onClose={onClose} size="lg" title="Editar dados da obra" footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Endereço"><Input value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
        <Field label="Equipe responsável"><Input value={f.team} onChange={(e) => setF({ ...f, team: e.target.value })} /></Field>
        <Field label="Valor contratado"><MoneyInput value={f.contractedValue} onChange={(v) => setF({ ...f, contractedValue: v })} /></Field>
        <Field label="Data de início"><Input type="date" value={f.startDate} onChange={(e) => setF({ ...f, startDate: e.target.value })} /></Field>
        <Field label="Previsão de conclusão"><Input type="date" value={f.expectedEnd} onChange={(e) => setF({ ...f, expectedEnd: e.target.value })} /></Field>
        <Field className="sm:col-span-2" label="Serviços contratados"><Textarea value={f.servicesSummary} onChange={(e) => setF({ ...f, servicesSummary: e.target.value })} /></Field>
        <Field className="sm:col-span-2" label="Observações"><Textarea value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}

function ConsumeModal({ job, products, mode, onClose }: { job: Job; products: { id: string; name: string; unit: string; quantity: number; active: boolean }[]; mode: 'consume' | 'complete'; onClose: () => void }) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const remaining = (m: JobMaterial) => Math.max(0, roundTo(m.plannedQty - m.consumedQty, 3));
  const [lines, setLines] = useState<Line[]>(() => (mode === 'complete' ? job.materials.filter((m) => remaining(m) > 0).map((m) => ({ productId: m.productId, quantity: remaining(m) })) : [{ productId: job.materials[0]?.productId ?? '', quantity: null }]));
  const [completedAt, setCompletedAt] = useState(todayISO());
  const [note, setNote] = useState('');
  const [allowNeg, setAllowNeg] = useState(false);
  const [busy, setBusy] = useState(false);
  const prodMap = new Map(products.map((p) => [p.id, p]));
  const valid = lines.filter((l) => l.productId && (l.quantity ?? 0) > 0);
  const shortages = valid.filter((l) => (prodMap.get(l.productId)?.quantity ?? 0) < (l.quantity ?? 0));

  const submit = async () => {
    if (mode === 'consume' && !valid.length) return toast.error('Informe ao menos um material e quantidade.');
    if (shortages.length && !(isAdmin && allowNeg)) return toast.error(`Estoque insuficiente: ${shortages.map((s) => prodMap.get(s.productId)?.name).join(', ')}.`);
    setBusy(true);
    const payloadLines = valid.map((l) => ({ productId: l.productId, movementId: uuid(), quantity: l.quantity!, allowNegative: allowNeg }));
    const eventId = uuid();
    const db = getDb();
    const optimistic = async () => {
      const mats = job.materials.map((m) => ({ ...m }));
      const now = new Date().toISOString();
      for (const l of payloadLines) {
        const p = await db.products.get(l.productId);
        if (p) {
          const bal = roundTo(p.quantity - l.quantity, 3);
          await db.products.update(p.id, { quantity: bal });
          await db.stockMovements.put({ id: l.movementId, productId: p.id, type: 'out', delta: -l.quantity, balanceAfter: bal, unitCost: p.unitCost, reason: `Consumo na obra ${formatJobNumber(job.number)}`, jobId: job.id, createdBy: user!.id, createdByName: user!.name, createdAt: now, updatedAt: now, version: 0, deletedAt: null });
        }
        let m = mats.find((x) => x.productId === l.productId);
        if (!m) {
          m = { productId: l.productId, name: p?.name ?? '', unit: p?.unit ?? '', plannedQty: 0, consumedQty: 0 };
          mats.push(m);
        }
        m.consumedQty = roundTo(m.consumedQty + l.quantity, 3);
      }
      await db.jobs.update(job.id, { materials: mats, ...(mode === 'complete' ? { status: 'completed', completedAt: new Date(`${completedAt}T12:00:00`).toISOString() } : {}) });
      await db.jobEvents.put({ id: eventId, jobId: job.id, type: mode === 'complete' ? 'completed' : 'material', note: mode === 'complete' ? note : 'Consumo registrado', statusTo: mode === 'complete' ? 'completed' : null, createdBy: user!.id, createdByName: user!.name, createdAt: now, updatedAt: now, version: 0, deletedAt: null });
    };
    const targets = [job.id, eventId, ...payloadLines.flatMap((l) => [l.productId, l.movementId])];
    if (mode === 'complete') await runCommand('job.complete', { jobId: job.id, eventId, completedAt, note, lines: payloadLines }, { targets, description: `Concluir ${formatJobNumber(job.number)}`, optimistic });
    else await runCommand('job.consume', { jobId: job.id, eventId, lines: payloadLines }, { targets, description: `Consumo em ${formatJobNumber(job.number)}`, optimistic });
    setBusy(false);
    toast(mode === 'complete' ? 'Obra concluída. O comprovante já pode ser gerado.' : 'Consumo registrado e baixado do estoque.');
    onClose();
  };

  const options = [...job.materials.map((m) => ({ id: m.productId, label: `${m.name} (previsto ${formatNumber(m.plannedQty, 3)} ${m.unit})` })), ...products.filter((p) => p.active && !job.materials.some((m) => m.productId === p.id)).map((p) => ({ id: p.id, label: p.name }))];

  return (
    <Modal open onClose={onClose} size="lg" title={mode === 'complete' ? 'Concluir obra' : 'Registrar consumo de materiais'} closeOnBackdrop={false} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button variant={mode === 'complete' ? 'gold' : 'primary'} loading={busy} onClick={submit}>{mode === 'complete' ? 'Concluir obra' : 'Registrar consumo'}</Button></>}>
      {mode === 'complete' && (
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Field label="Data de conclusão"><Input type="date" value={completedAt} onChange={(e) => setCompletedAt(e.target.value)} /></Field>
          <Field label="Observação final"><Input value={note} onChange={(e) => setNote(e.target.value)} /></Field>
          <p className="text-xs text-graphite-500 sm:col-span-2">Consumo final: ajuste as quantidades que ainda serão baixadas do estoque (sugestão = previsto − já consumido). Remova as linhas que não se aplicam.</p>
        </div>
      )}
      <div className="space-y-2">
        {lines.map((l, i) => {
          const p = prodMap.get(l.productId);
          return (
            <div key={i} className="grid grid-cols-[1fr_140px_auto] items-start gap-2">
              <div>
                <Select value={l.productId} onChange={(e) => setLines(lines.map((x, j) => (j === i ? { ...x, productId: e.target.value } : x)))}>
                  <option value="">Selecione o material</option>
                  {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
                </Select>
                {p && <div className={`mt-1 text-[11px] ${p.quantity < (l.quantity ?? 0) ? 'text-red-600' : 'text-graphite-500'}`}>Em estoque: {formatNumber(p.quantity, 3)} {p.unit}</div>}
              </div>
              <NumberInput value={l.quantity} onChange={(v) => setLines(lines.map((x, j) => (j === i ? { ...x, quantity: v } : x)))} decimals={3} min={0} suffix={p?.unit} />
              <Button variant="ghost" size="icon" className="h-[42px]" onClick={() => setLines(lines.filter((_, j) => j !== i))} aria-label="Remover"><X className="h-4 w-4" /></Button>
            </div>
          );
        })}
      </div>
      <Button className="mt-3" size="sm" variant="ghost" icon={<Plus className="h-4 w-4" />} onClick={() => setLines([...lines, { productId: '', quantity: null }])}>Adicionar material</Button>
      {shortages.length > 0 && (
        <div className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">
          Estoque insuficiente para: {shortages.map((s) => prodMap.get(s.productId)?.name).join(', ')}.
          {isAdmin ? <div className="mt-2"><Checkbox checked={allowNeg} onChange={setAllowNeg} label="Autorizo estoque negativo (administrador)" /></div> : <div className="mt-1 text-xs">Registre a entrada no estoque ou peça autorização ao administrador.</div>}
        </div>
      )}
    </Modal>
  );
}
