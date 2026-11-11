import { useEffect, useMemo, useState } from 'react';
import { History, Plus, Trash2, Wrench } from 'lucide-react';
import {
  LINEAR_BASIS_LABEL,
  MEASUREMENT_LABEL,
  PRICING_MODE_LABEL,
  isPlate,
  serviceSchema,
  type LinearBasis,
  type MeasurementType,
  type PricingMode,
  type Service,
  type ServiceAddon,
  type ServiceMaterial,
} from '@jn/shared';
import { deleteRecord, saveRecord, useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { formatBRL, formatNumber, normalize } from '../../lib/format';
import { diffPatch, fieldErrors } from '../../lib/forms';
import { ChangeHistory } from '../../components/History';
import { Badge, Button, Card, confirmDialog, EmptyState, Field, Input, LoadingBlock, Modal, MoneyInput, NumberInput, PageHeader, SearchInput, Select, Tabs, Textarea, Toggle, toast } from '../../components/ui';

type Form = Omit<Service, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version' | 'seq'>;
const UNIT_FOR: Record<MeasurementType, string> = { m2: 'm²', ml: 'm', unit: 'un' };
const EMPTY: Form = { name: '', description: '', measurementType: 'm2', pricingMode: 'cost_plus', laborPrice: 0, chargeUnit: 'm²', linearBasis: 'perimeter', materials: [], addons: [], active: true };

export default function Services() {
  const services = useTable('services');
  const products = useTable('products');
  const { can } = useAuth();
  const [q, setQ] = useState('');
  const [show, setShow] = useState<'active' | 'inactive' | 'all'>('active');
  const [editing, setEditing] = useState<Service | null | 'new'>(null);
  const prodMap = useMemo(() => new Map((products ?? []).map((p) => [p.id, p])), [products]);

  const list = useMemo(
    () =>
      (services ?? [])
        .filter((s) => (show === 'all' ? true : show === 'active' ? s.active : !s.active))
        .filter((s) => !q || normalize(s.name).includes(normalize(q)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [services, q, show],
  );

  return (
    <div className="animate-fade-in">
      <PageHeader
        title="Serviços"
        subtitle="Os serviços ativos alimentam automaticamente a calculadora de orçamentos."
        actions={can('services', 'create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Novo serviço</Button>}
      />
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <SearchInput className="sm:w-80" value={q} onChange={setQ} placeholder="Pesquisar serviço" />
        <Tabs value={show} onChange={setShow} tabs={[{ value: 'active', label: 'Ativos' }, { value: 'inactive', label: 'Inativos' }, { value: 'all', label: 'Todos' }]} />
      </div>
      {!services ? (
        <LoadingBlock />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<Wrench className="h-6 w-6" />} title={services.length ? 'Nenhum serviço nesta lista' : 'Nenhum serviço cadastrado'} description="Cadastre os serviços da J&N (forro, sanca, drywall, molduras...) com o preço da mão de obra e os materiais utilizados." action={can('services', 'create') && !services.length ? <Button onClick={() => setEditing('new')}>Cadastrar serviço</Button> : undefined} />
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {list.map((s) => (
            <button key={s.id} onClick={() => setEditing(s)} className="card group p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lg">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold">{s.name}</h3>
                  <p className="mt-0.5 line-clamp-2 text-xs text-graphite-500">{s.description || MEASUREMENT_LABEL[s.measurementType]}</p>
                </div>
                {!s.active && <Badge>Inativo</Badge>}
              </div>
              <div className="mt-4 flex items-end justify-between gap-2">
                <div>
                  <div className="text-xs text-graphite-500">{s.pricingMode === 'fixed' ? 'Preço fixo' : 'Mão de obra'}</div>
                  <div className="tabular text-lg font-semibold">
                    {formatBRL(s.laborPrice)}
                    <span className="text-sm font-normal text-graphite-500"> / {s.chargeUnit}</span>
                  </div>
                </div>
                <Badge tone="blue">{s.materials.length} material(is)</Badge>
              </div>
              {s.materials.length > 0 && (
                <div className="mt-3 truncate text-xs text-graphite-500">{s.materials.map((m) => prodMap.get(m.productId)?.name ?? '?').join(' · ')}</div>
              )}
            </button>
          ))}
        </div>
      )}
      {editing && <ServiceModal service={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ServiceModal({ service, onClose }: { service: Service | null; onClose: () => void }) {
  const products = useTable('products');
  const { can } = useAuth();
  const [f, setF] = useState<Form>(EMPTY);
  const [tab, setTab] = useState<'data' | 'history'>('data');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const readOnly = service ? !can('services', 'edit') : !can('services', 'create');

  useEffect(() => {
    setF(service ? { name: service.name, description: service.description, measurementType: service.measurementType, pricingMode: service.pricingMode, laborPrice: service.laborPrice, chargeUnit: service.chargeUnit, linearBasis: service.linearBasis, materials: service.materials.map((m) => ({ ...m })), addons: (service.addons ?? []).map((a) => ({ ...a })), active: service.active } : EMPTY);
  }, [service]);

  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));
  const activeProducts = (products ?? []).filter((p) => p.active || f.materials.some((m) => m.productId === p.id)).sort((a, b) => a.name.localeCompare(b.name));
  const addons = f.addons ?? [];
  const setAddon = (i: number, patch: Partial<ServiceAddon>) => set('addons', addons.map((a, j) => (j === i ? { ...a, ...patch } : a)));
  const setMat = (i: number, patch: Partial<ServiceMaterial>) => set('materials', f.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)));

  const submit = async () => {
    const parsed = serviceSchema.safeParse(f);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (addons.some((a) => !a.name.trim())) return setErrors({ addons: 'Informe o nome de cada adicional.' });
    if (f.materials.some((m) => !m.productId)) return setErrors({ materials: 'Selecione o produto de cada material.' });
    setBusy(true);
    try {
      const data = parsed.data as Form;
      const patch = diffPatch(service as Partial<Form> | null, data);
      if (service && !Object.keys(patch).length) return onClose();
      await saveRecord('services', service?.id ?? uuid(), patch, `${service ? 'Alterar' : 'Cadastrar'} serviço ${data.name}`);
      toast(service ? 'Serviço atualizado.' : 'Serviço cadastrado.');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!service) return;
    const ok = await confirmDialog({ title: 'Excluir serviço', message: 'Somente serviços nunca utilizados em orçamentos podem ser excluídos. Serviços já utilizados devem ser desativados.', danger: true, confirmLabel: 'Excluir' });
    if (!ok) return;
    await deleteRecord('services', service.id, `Excluir serviço ${service.name}`);
    toast('Exclusão enviada para sincronização.');
    onClose();
  };

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={service ? service.name : 'Novo serviço'}
      footer={
        tab === 'data' && (
          <>
            {service && can('services', 'delete') && (
              <Button variant="ghost" className="mr-auto text-red-600" icon={<Trash2 className="h-4 w-4" />} onClick={remove}>
                Excluir
              </Button>
            )}
            <Button variant="outline" onClick={onClose}>
              {readOnly ? 'Fechar' : 'Cancelar'}
            </Button>
            {!readOnly && (
              <Button onClick={submit} loading={busy}>
                Salvar serviço
              </Button>
            )}
          </>
        )
      }
    >
      {service && <Tabs className="mb-4" value={tab} onChange={setTab} tabs={[{ value: 'data', label: 'Dados' }, { value: 'history', label: <span className="inline-flex items-center gap-1.5"><History className="h-3.5 w-3.5" /> Histórico</span> }]} />}
      {tab === 'history' && service ? (
        <ChangeHistory entity="services" id={service.id} labels={{ name: 'Nome', laborPrice: 'Preço (centavos)', measurementType: 'Medição', pricingMode: 'Precificação', active: 'Ativo', materials: 'Materiais', addons: 'Adicionais', chargeUnit: 'Unidade' }} />
      ) : (
        <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
          <Field className="sm:col-span-4" label="Nome do serviço" required error={errors.name}>
            <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Ex.: Forro de drywall" />
          </Field>
          <Field className="flex items-end sm:col-span-2" label="">
            <Toggle checked={f.active} onChange={(v) => set('active', v)} label={f.active ? 'Ativo' : 'Inativo'} />
          </Field>
          <Field className="sm:col-span-6" label="Descrição">
            <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} placeholder="Aparece no orçamento enviado ao cliente." />
          </Field>
          <Field className="sm:col-span-3" label="Tipo de medição">
            <Select value={f.measurementType} onChange={(e) => setF((p) => ({ ...p, measurementType: e.target.value as MeasurementType, chargeUnit: UNIT_FOR[e.target.value as MeasurementType] }))}>
              {Object.entries(MEASUREMENT_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="sm:col-span-3" label="Precificação" hint={f.pricingMode === 'fixed' ? 'O preço informado é o valor final por unidade. Não recebe margem.' : 'Preço = (materiais + mão de obra) + margem de lucro.'}>
            <Select value={f.pricingMode} onChange={(e) => set('pricingMode', e.target.value as PricingMode)}>
              {Object.entries(PRICING_MODE_LABEL).map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </Select>
          </Field>
          <Field className="sm:col-span-3" label={f.pricingMode === 'fixed' ? 'Preço fixo por unidade' : 'Preço da mão de obra'} required error={errors.laborPrice}>
            <MoneyInput value={f.laborPrice} onChange={(v) => set('laborPrice', v)} />
          </Field>
          <Field className="sm:col-span-1" label="Unidade" error={errors.chargeUnit}>
            <Input value={f.chargeUnit} onChange={(e) => set('chargeUnit', e.target.value)} />
          </Field>
          {f.measurementType === 'ml' && (
            <Field className="sm:col-span-2" label="Medida linear usada">
              <Select value={f.linearBasis} onChange={(e) => set('linearBasis', e.target.value as LinearBasis)}>
                {Object.entries(LINEAR_BASIS_LABEL).map(([v, l]) => (
                  <option key={v} value={v}>
                    {l}
                  </option>
                ))}
              </Select>
            </Field>
          )}

          <div className="sm:col-span-6">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Materiais utilizados</div>
                <div className="text-xs text-graphite-500">Consumo por {f.chargeUnit || 'unidade'} do serviço. Placas são calculadas pela área da placa.</div>
              </div>
              <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => set('materials', [...f.materials, { productId: '', consumption: 1 }])} disabled={!activeProducts.length}>
                Material
              </Button>
            </div>
            {!activeProducts.length && <p className="rounded-xl bg-amber-50 p-3 text-xs text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Cadastre produtos em "Produtos e estoque" para associá-los aos serviços.</p>}
            {errors.materials && <p className="mb-2 text-xs text-red-600">{errors.materials}</p>}
            <div className="space-y-2">
              {f.materials.map((m, i) => {
                const p = activeProducts.find((x) => x.id === m.productId);
                const plate = p ? isPlate(p) : false;
                return (
                  <div key={i} className="grid grid-cols-[1fr_120px_auto] items-start gap-2 rounded-xl bg-graphite-50 p-2 dark:bg-white/[0.03]">
                    <Select value={m.productId} onChange={(e) => setMat(i, { productId: e.target.value })} aria-label="Produto">
                      <option value="">Selecione o produto</option>
                      {activeProducts.map((pp) => (
                        <option key={pp.id} value={pp.id} disabled={f.materials.some((x, j) => j !== i && x.productId === pp.id)}>
                          {pp.name} ({pp.unit})
                        </option>
                      ))}
                    </Select>
                    <NumberInput value={m.consumption} onChange={(v) => setMat(i, { consumption: v ?? 0 })} decimals={4} min={0} suffix={plate && f.measurementType === 'm2' ? '×' : p?.unit} aria-label="Consumo" />
                    <Button variant="ghost" size="icon" className="h-[42px]" onClick={() => set('materials', f.materials.filter((_, j) => j !== i))} aria-label="Remover material">
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                    {p && (
                      <p className="col-span-3 px-1 text-[11px] text-graphite-500">
                        {plate
                          ? f.measurementType === 'm2'
                            ? `Placa de ${formatNumber(p.plateArea ?? 0, 3)} m² — quantidade = ⌈área × fator × (1 + desperdício) ÷ ${formatNumber(p.plateArea ?? 0, 3)}⌉. Use 1 para cobertura simples.`
                            : `Placa de ${formatNumber(p.plateArea ?? 0, 3)} m² — consumo em m² de placa por ${f.chargeUnit}.`
                          : `${formatNumber(m.consumption, 4)} ${p.unit} por ${f.chargeUnit} · custo ${formatBRL(p.unitCost)}/${p.unit}${p.indivisible ? ' · arredonda para cima' : ''}`}
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="sm:col-span-6">
            <div className="mb-2 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold">Adicionais / decorativos</div>
                <div className="text-xs text-graphite-500">Ex.: tabica, elevação, sanca. Aparecem abaixo do serviço no orçamento, com medida e mão de obra próprias.</div>
              </div>
              <Button size="sm" variant="outline" icon={<Plus className="h-4 w-4" />} onClick={() => set('addons', [...addons, { id: uuid(), name: '', measurementType: 'ml', chargeUnit: 'm', laborPrice: 0 }])}>
                Adicional
              </Button>
            </div>
            {errors.addons && <p className="mb-2 text-xs text-red-600">{errors.addons}</p>}
            <div className="space-y-2">
              {addons.map((a, i) => (
                <div key={a.id} className="grid grid-cols-2 items-start gap-2 rounded-xl bg-graphite-50 p-2 sm:grid-cols-[1fr_140px_80px_140px_auto] dark:bg-white/[0.03]">
                  <Input className="col-span-2 sm:col-span-1" value={a.name} onChange={(e) => setAddon(i, { name: e.target.value })} placeholder="Nome (ex.: Tabica)" aria-label="Nome do adicional" />
                  <Select value={a.measurementType} onChange={(e) => setAddon(i, { measurementType: e.target.value as MeasurementType, chargeUnit: UNIT_FOR[e.target.value as MeasurementType] })} aria-label="Tipo de medição do adicional">
                    {Object.entries(MEASUREMENT_LABEL).map(([v, l]) => (
                      <option key={v} value={v}>
                        {l}
                      </option>
                    ))}
                  </Select>
                  <Input value={a.chargeUnit} onChange={(e) => setAddon(i, { chargeUnit: e.target.value })} aria-label="Unidade do adicional" />
                  <MoneyInput value={a.laborPrice} onChange={(v) => setAddon(i, { laborPrice: v })} aria-label="Mão de obra do adicional" />
                  <Button variant="ghost" size="icon" className="h-[42px]" onClick={() => set('addons', addons.filter((_, j) => j !== i))} aria-label="Remover adicional">
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              ))}
            </div>
          </div>
        </fieldset>
      )}
    </Modal>
  );
}
