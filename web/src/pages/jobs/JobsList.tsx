import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HardHat, Plus } from 'lucide-react';
import { JOB_STATUS_LABEL, formatJobNumber, todayISO, type JobStatus } from '@jn/shared';
import { getDb } from '../../lib/db';
import { saveRecord, useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { fmtDate, formatBRL, normalize } from '../../lib/format';
import { JobStatusBadge } from '../../lib/status';
import { Button, Card, EmptyState, Field, Input, LoadingBlock, LoadMore, Modal, MoneyInput, PageHeader, SearchInput, Select, Tabs, Textarea, toast, usePaged } from '../../components/ui';

export default function JobsList() {
  const jobs = useTable('jobs');
  const clients = useTable('clients');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [status, setStatus] = useState<JobStatus | 'all' | 'open'>('open');
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const clientMap = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, open: 0 };
    (jobs ?? []).forEach((j) => {
      c.all++;
      c[j.status] = (c[j.status] ?? 0) + 1;
      if (!['completed', 'cancelled'].includes(j.status)) c.open++;
    });
    return c;
  }, [jobs]);

  const list = useMemo(() => {
    if (!jobs) return undefined;
    const t = normalize(q);
    return jobs
      .filter((j) => (status === 'all' ? true : status === 'open' ? !['completed', 'cancelled'].includes(j.status) : j.status === status))
      .filter((j) => !t || normalize(`${formatJobNumber(j.number)} ${clientMap.get(j.clientId)?.name ?? ''} ${j.address} ${j.team}`).includes(t))
      .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || b.createdAt.localeCompare(a.createdAt));
  }, [jobs, status, q, clientMap]);
  const { visible, more, loadMore, total } = usePaged(list);
  const today = todayISO();

  return (
    <div className="animate-fade-in">
      <PageHeader title="Obras e ordens de serviço" subtitle="Acompanhe a execução, a equipe e o consumo de materiais." actions={can('jobs', 'create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>Nova OS avulsa</Button>} />
      <Tabs
        className="mb-3"
        value={status}
        onChange={setStatus}
        tabs={[{ value: 'open' as const, label: 'Em aberto', count: counts.open }, ...(['waiting', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled'] as const).map((s) => ({ value: s, label: JOB_STATUS_LABEL[s], count: counts[s] ?? 0 })), { value: 'all' as const, label: 'Todas', count: counts.all }]}
      />
      <SearchInput className="mb-4 sm:w-96" value={q} onChange={setQ} placeholder="Número, cliente, endereço ou equipe" />
      {!list ? (
        <LoadingBlock />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<HardHat className="h-6 w-6" />} title="Nenhuma obra nesta lista" description="As ordens de serviço são geradas a partir de orçamentos aprovados." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((j) => {
            const late = j.expectedEnd && j.expectedEnd < today && !['completed', 'cancelled'].includes(j.status);
            const progress = j.materials.length ? Math.min(100, Math.round((j.materials.reduce((s, m) => s + Math.min(m.consumedQty, m.plannedQty || m.consumedQty), 0) / Math.max(1, j.materials.reduce((s, m) => s + (m.plannedQty || 0), 0))) * 100)) : 0;
            return (
              <Link key={j.id} to={`/obras/${j.id}`} className="card block p-5 transition hover:-translate-y-0.5 hover:shadow-lg">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-semibold">{formatJobNumber(j.number)}</div>
                    <div className="truncate text-sm text-graphite-600 dark:text-graphite-300">{clientMap.get(j.clientId)?.name ?? '—'}</div>
                  </div>
                  <JobStatusBadge status={j.status} />
                </div>
                <div className="mt-2 line-clamp-2 text-xs text-graphite-500">{j.address || j.servicesSummary || 'Sem endereço'}</div>
                <div className="mt-4 flex items-end justify-between gap-2 text-xs">
                  <div className="space-y-0.5 text-graphite-500">
                    <div>Início: <b className="text-graphite-700 dark:text-graphite-200">{fmtDate(j.startDate)}</b></div>
                    <div className={late ? 'text-red-600' : ''}>Previsão: <b>{fmtDate(j.expectedEnd)}</b>{late && ' (atrasada)'}</div>
                  </div>
                  <div className="tabular text-base font-semibold">{formatBRL(j.contractedValue)}</div>
                </div>
                {j.materials.length > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-graphite-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-graphite-500">Materiais consumidos: {progress}% do previsto</div>
                  </div>
                )}
              </Link>
            );
          })}
        </div>
      )}
      <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
      {newOpen && <NewJobModal onClose={() => setNewOpen(false)} onCreated={(id) => navigate(`/obras/${id}`)} />}
    </div>
  );
}

function NewJobModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const clients = useTable('clients');
  const [clientId, setClientId] = useState('');
  const [address, setAddress] = useState('');
  const [summary, setSummary] = useState('');
  const [value, setValue] = useState(0);
  const [team, setTeam] = useState('');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const [notes, setNotes] = useState('');
  const submit = async () => {
    if (!clientId) return toast.error('Selecione o cliente.');
    const id = uuid();
    await saveRecord('jobs', id, { clientId, address, servicesSummary: summary, contractedValue: value, team, startDate: start || null, expectedEnd: end || null, notes }, 'Criar OS avulsa', { status: 'waiting', number: null, materials: [], quoteId: null, completedAt: null });
    await getDb().jobs.update(id, { status: 'waiting' });
    toast('Ordem de serviço criada.');
    onClose();
    onCreated(id);
  };
  return (
    <Modal open onClose={onClose} title="Nova ordem de serviço avulsa" size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Criar OS</Button></>}>
      <p className="mb-4 text-xs text-graphite-500">Para obras vindas de orçamento, use "Gerar ordem de serviço" no orçamento aprovado — os materiais e o valor são carregados automaticamente.</p>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field className="sm:col-span-2" label="Cliente" required>
          <Select value={clientId} onChange={(e) => {
            setClientId(e.target.value);
            const c = clients?.find((x) => x.id === e.target.value);
            if (c && !address) setAddress([c.address && `${c.address}${c.number ? `, ${c.number}` : ''}`, c.district, c.city].filter(Boolean).join(' — '));
          }}>
            <option value="">Selecione</option>
            {[...(clients ?? [])].sort((a, b) => a.name.localeCompare(b.name)).map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Endereço da obra">
          <Input value={address} onChange={(e) => setAddress(e.target.value)} />
        </Field>
        <Field className="sm:col-span-2" label="Serviços contratados">
          <Textarea value={summary} onChange={(e) => setSummary(e.target.value)} />
        </Field>
        <Field label="Valor contratado">
          <MoneyInput value={value} onChange={setValue} />
        </Field>
        <Field label="Equipe responsável">
          <Input value={team} onChange={(e) => setTeam(e.target.value)} />
        </Field>
        <Field label="Data de início">
          <Input type="date" value={start} onChange={(e) => setStart(e.target.value)} />
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
