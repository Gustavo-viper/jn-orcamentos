import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { HardHat, Layers, PackagePlus, Plus, SlidersHorizontal } from 'lucide-react';
import { DRYWALL_PLATE_AREA, formatJobNumber, isPlate, todayISO, type Product, type StockMovementType } from '@jn/shared';
import { getDb } from '../../lib/db';
import { saveRecord, useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { fmtDate, formatBRL, formatNumber, normalize } from '../../lib/format';
import { StockMoveModal } from '../../components/StockMoveModal';
import { JobStatusBadge } from '../../lib/status';
import { Button, Card, EmptyState, Field, Input, LoadingBlock, LoadMore, Modal, MoneyInput, PageHeader, SearchInput, Select, Textarea, toast, usePaged } from '../../components/ui';

export default function JobsList() {
  const jobs = useTable('jobs');
  const clients = useTable('clients');
  const products = useTable('products');
  const { can } = useAuth();
  const plateIds = useMemo(() => new Set((products ?? []).filter(isPlate).map((p) => p.id)), [products]);
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [newOpen, setNewOpen] = useState(false);
  const clientMap = useMemo(() => new Map((clients ?? []).map((c) => [c.id, c])), [clients]);

  const list = useMemo(() => {
    if (!jobs) return undefined;
    const t = normalize(q);
    return jobs
      .filter((j) => !t || normalize(`${formatJobNumber(j.number)} ${clientMap.get(j.clientId)?.name ?? ''} ${j.address} ${j.team}`).includes(t))
      .sort((a, b) => (a.startDate ?? '9999').localeCompare(b.startDate ?? '9999') || b.createdAt.localeCompare(a.createdAt));
  }, [jobs, q, clientMap]);
  const { visible, more, loadMore, total } = usePaged(list);
  const today = todayISO();

  return (
    <div className="animate-fade-in">
      <PageHeader title="Controle de material" subtitle="Estoque de placas acartonado e consumo de placas por obra: previsto, consumido e saldo." actions={can('jobs', 'create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setNewOpen(true)}>Novo controle avulso</Button>} />
      <PlateStockCard products={products} />
      <SearchInput className="mb-4 sm:w-96" value={q} onChange={setQ} placeholder="Número, cliente, endereço ou equipe" />
      {!list ? (
        <LoadingBlock />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<HardHat className="h-6 w-6" />} title="Nenhum controle nesta lista" description="Os controles de material são gerados a partir de orçamentos aprovados." />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {visible.map((j) => {
            const late = j.expectedEnd && j.expectedEnd < today && !['completed', 'cancelled'].includes(j.status);
            const plates = j.materials.filter((m) => plateIds.has(m.productId));
            const progress = plates.length ? Math.min(100, Math.round((plates.reduce((s, m) => s + Math.min(m.consumedQty, m.plannedQty || m.consumedQty), 0) / Math.max(1, plates.reduce((s, m) => s + (m.plannedQty || 0), 0))) * 100)) : 0;
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
                {plates.length > 0 && (
                  <div className="mt-3">
                    <div className="h-1.5 overflow-hidden rounded-full bg-graphite-100 dark:bg-white/10">
                      <div className="h-full rounded-full bg-gradient-to-r from-gold-300 to-gold-500" style={{ width: `${progress}%` }} />
                    </div>
                    <div className="mt-1 text-[11px] text-graphite-500">Placas consumidas: {progress}% do previsto</div>
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

function PlateStockCard({ products }: { products: Product[] | undefined }) {
  const { can } = useAuth();
  const [sel, setSel] = useState<{ product: Product; type: StockMovementType } | null>(null);
  const [busy, setBusy] = useState(false);
  const canEdit = can('products', 'edit');
  const plates = (products ?? []).filter((p) => isPlate(p) && p.active && !p.deletedAt).sort((a, b) => a.name.localeCompare(b.name));
  const current = sel ? plates.find((p) => p.id === sel.product.id) ?? sel.product : null;

  const createPlate = async () => {
    setBusy(true);
    try {
      await saveRecord('products', uuid(), { code: '', name: 'Placa acartonado 1,80 × 1,20', category: 'placas', unit: 'un', unitCost: 0, plateArea: DRYWALL_PLATE_AREA, dimensions: '1,80 × 1,20', description: '', supplier: '', minStock: 0, indivisible: true, active: true, quantity: 0 }, 'Cadastrar placa acartonado');
      toast('Placa cadastrada. Registre a entrada do estoque.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card className="mb-5 p-5">
      <div className="mb-3 flex items-center gap-2">
        <Layers className="h-5 w-5 text-gold-500" />
        <h2 className="font-semibold">Estoque de placas acartonado (1,80 × 1,20)</h2>
      </div>
      {!products ? (
        <LoadingBlock />
      ) : !plates.length ? (
        <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-graphite-500">
          <span>Nenhuma placa cadastrada no estoque.</span>
          {can('products', 'create') && <Button size="sm" icon={<Plus className="h-4 w-4" />} loading={busy} onClick={createPlate}>Cadastrar placa 1,80 × 1,20</Button>}
        </div>
      ) : (
        <div className="divide-y divide-graphite-100 dark:divide-white/10">
          {plates.map((p) => {
            const low = p.quantity <= (p.minStock || 0);
            return (
              <div key={p.id} className="flex flex-wrap items-center justify-between gap-3 py-2 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{p.name}</div>
                  <div className={`tabular text-2xl font-semibold ${p.quantity < 0 ? 'text-red-600' : low ? 'text-amber-600' : ''}`}>
                    {formatNumber(p.quantity, 3)} <span className="text-sm font-normal text-graphite-500">{p.unit}</span>
                  </div>
                  {low && <div className="text-xs text-amber-600">{p.quantity < 0 ? 'Estoque negativo' : 'Estoque baixo'}</div>}
                </div>
                {canEdit && (
                  <div className="flex gap-2">
                    <Button size="sm" icon={<PackagePlus className="h-4 w-4" />} onClick={() => setSel({ product: p, type: 'in' })}>Entrada</Button>
                    <Button size="sm" variant="outline" icon={<SlidersHorizontal className="h-4 w-4" />} onClick={() => setSel({ product: p, type: 'adjust' })}>Ajuste</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
      <p className="mt-3 text-xs text-graphite-500">As placas consumidas nas obras são baixadas automaticamente deste estoque.</p>
      <StockMoveModal product={current} open={!!sel} onClose={() => setSel(null)} initialType={sel?.type ?? 'in'} types={['in', 'adjust']} />
    </Card>
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
    toast('Controle de material criado.');
    onClose();
    onCreated(id);
  };
  return (
    <Modal open onClose={onClose} title="Novo controle de material avulso" size="lg" footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button onClick={submit}>Criar controle</Button></>}>
      <p className="mb-4 text-xs text-graphite-500">Para obras vindas de orçamento, use "Gerar controle de material" no orçamento aprovado — os materiais e o valor são carregados automaticamente.</p>
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
