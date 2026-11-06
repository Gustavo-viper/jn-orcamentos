import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, ArrowDownUp, Boxes, Package, Plus, TrendingDown } from 'lucide-react';
import { PRODUCT_CATEGORIES, PRODUCT_CATEGORY_LABEL, productSchema, type Product, type ProductCategory } from '@jn/shared';
import { saveRecord, useTable } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { uuid } from '../../lib/ids';
import { formatBRL, formatNumber, normalize } from '../../lib/format';
import { diffPatch, fieldErrors } from '../../lib/forms';
import { moveStockCommand, StockMoveModal } from '../../components/StockMoveModal';
import { Badge, Button, Card, Checkbox, EmptyState, Field, Input, LoadingBlock, LoadMore, Modal, MoneyInput, NumberInput, PageHeader, SearchInput, Select, StatCard, Textarea, Toggle, toast, usePaged } from '../../components/ui';

type Form = Omit<Product, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version' | 'seq' | 'quantity'>;
const EMPTY: Form = { code: '', name: '', category: 'placas', unit: 'un', unitCost: 0, description: '', dimensions: '', plateArea: null, minStock: 0, supplier: '', indivisible: true, active: true };

export default function Products() {
  const products = useTable('products');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [onlyLow, setOnlyLow] = useState(false);
  const [showInactive, setShowInactive] = useState(false);
  const [editing, setEditing] = useState<Product | null | 'new'>(null);
  const [moving, setMoving] = useState<Product | null>(null);

  const list = useMemo(
    () =>
      (products ?? [])
        .filter((p) => (showInactive ? true : p.active))
        .filter((p) => !cat || p.category === cat)
        .filter((p) => !onlyLow || p.quantity <= p.minStock)
        .filter((p) => !q || normalize(`${p.name} ${p.code} ${p.supplier}`).includes(normalize(q)))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [products, q, cat, onlyLow, showInactive],
  );
  const stats = useMemo(() => {
    const act = (products ?? []).filter((p) => p.active);
    return { count: act.length, low: act.filter((p) => p.quantity <= p.minStock && p.minStock > 0).length, negative: act.filter((p) => p.quantity < 0).length, value: act.reduce((s, p) => s + Math.max(0, p.quantity) * p.unitCost, 0) };
  }, [products]);
  const { visible, more, loadMore, total } = usePaged(list, 40);

  return (
    <div className="animate-fade-in">
      <PageHeader title="Produtos e estoque" subtitle="Materiais, saldos, movimentações e alertas de estoque baixo." actions={can('products', 'create') && <Button icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Novo produto</Button>} />
      <div className="mb-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Produtos ativos" value={stats.count} icon={<Package className="h-4 w-4" />} />
        <StatCard label="Estoque baixo" value={stats.low} icon={<TrendingDown className="h-4 w-4" />} tone={stats.low ? 'amber' : 'green'} onClick={() => setOnlyLow(true)} />
        <StatCard label="Saldo negativo" value={stats.negative} icon={<AlertTriangle className="h-4 w-4" />} tone={stats.negative ? 'red' : 'green'} />
        <StatCard label="Custo total do estoque" value={formatBRL(Math.round(stats.value))} icon={<Boxes className="h-4 w-4" />} tone="gold" />
      </div>
      <Card className="mb-4 flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:p-4">
        <SearchInput className="sm:w-72" value={q} onChange={setQ} placeholder="Nome, código ou fornecedor" />
        <Select className="sm:w-48" value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoria">
          <option value="">Todas as categorias</option>
          {PRODUCT_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {PRODUCT_CATEGORY_LABEL[c]}
            </option>
          ))}
        </Select>
        <Checkbox checked={onlyLow} onChange={setOnlyLow} label="Somente estoque baixo" />
        <Checkbox checked={showInactive} onChange={setShowInactive} label="Mostrar inativos" />
      </Card>
      {!products ? (
        <LoadingBlock />
      ) : !list.length ? (
        <Card>
          <EmptyState icon={<Boxes className="h-6 w-6" />} title={products.length ? 'Nenhum produto encontrado' : 'Nenhum produto cadastrado'} description="Cadastre placas, perfis, massas, fixações e acabamentos com custo e área da placa." action={!products.length && can('products', 'create') ? <Button onClick={() => setEditing('new')}>Cadastrar produto</Button> : undefined} />
        </Card>
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-graphite-100 bg-graphite-50/60 dark:border-white/5 dark:bg-white/[0.02]">
                <tr>
                  <th className="th">Produto</th>
                  <th className="th">Categoria</th>
                  <th className="th text-right">Custo</th>
                  <th className="th text-right">Saldo</th>
                  <th className="th text-right">Mínimo</th>
                  <th className="th w-28" />
                </tr>
              </thead>
              <tbody className="divide-y divide-graphite-100 dark:divide-white/5">
                {visible.map((p) => {
                  const low = p.minStock > 0 && p.quantity <= p.minStock;
                  return (
                    <tr key={p.id} className="cursor-pointer hover:bg-graphite-50 dark:hover:bg-white/[0.03]" onClick={() => navigate(`/estoque/${p.id}`)}>
                      <td className="td">
                        <div className="font-medium">{p.name}</div>
                        <div className="text-xs text-graphite-500">{[p.code, p.dimensions, p.plateArea ? `${formatNumber(p.plateArea, 3)} m²/placa` : '', p.supplier].filter(Boolean).join(' · ')}</div>
                      </td>
                      <td className="td">
                        <Badge>{PRODUCT_CATEGORY_LABEL[p.category]}</Badge> {!p.active && <Badge tone="red">Inativo</Badge>}
                      </td>
                      <td className="td tabular text-right">
                        {formatBRL(p.unitCost)}
                        <span className="text-xs text-graphite-500">/{p.unit}</span>
                      </td>
                      <td className={`td tabular text-right font-semibold ${p.quantity < 0 ? 'text-red-600' : low ? 'text-amber-600' : ''}`}>
                        {formatNumber(p.quantity, 3)} <span className="text-xs font-normal text-graphite-500">{p.unit}</span>
                        {low && <AlertTriangle className="ml-1 inline h-3.5 w-3.5" />}
                      </td>
                      <td className="td tabular text-right text-graphite-500">{formatNumber(p.minStock, 3)}</td>
                      <td className="td text-right" onClick={(e) => e.stopPropagation()}>
                        {can('products', 'edit') && (
                          <Button size="sm" variant="outline" icon={<ArrowDownUp className="h-3.5 w-3.5" />} onClick={() => setMoving(p)}>
                            Movimentar
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
        </Card>
      )}
      {editing && <ProductModal product={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <StockMoveModal product={moving} open={!!moving} onClose={() => setMoving(null)} />
    </div>
  );
}

export function ProductModal({ product, onClose }: { product: Product | null; onClose: () => void }) {
  const { user, can } = useAuth();
  const [f, setF] = useState<Form>(EMPTY);
  const [initial, setInitial] = useState<number | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    setF(product ? (Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (product as unknown as Record<string, unknown>)[k]])) as Form) : EMPTY);
  }, [product]);
  const set = <K extends keyof Form>(k: K, v: Form[K]) => setF((p) => ({ ...p, [k]: v }));

  const submit = async () => {
    const data = { ...f, plateArea: f.category === 'placas' ? f.plateArea : null };
    const parsed = productSchema.safeParse(data);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    if (data.category === 'placas' && !(Number(data.plateArea) > 0)) return setErrors({ plateArea: 'Informe a área da placa em m².' });
    setBusy(true);
    try {
      const id = product?.id ?? uuid();
      const patch = diffPatch(product as Partial<Form> | null, parsed.data as Form);
      if (product && !Object.keys(patch).length) return onClose();
      const saved = await saveRecord('products', id, product ? patch : { ...patch, quantity: 0 }, `${product ? 'Alterar' : 'Cadastrar'} produto ${data.name}`);
      if (!product && initial && initial > 0) await moveStockCommand({ product: saved, type: 'in', quantity: initial, reason: 'Estoque inicial', userId: user!.id, userName: user!.name });
      toast(product ? 'Produto atualizado.' : 'Produto cadastrado.');
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const readOnly = product ? !can('products', 'edit') : !can('products', 'create');
  const plate = f.category === 'placas';
  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      closeOnBackdrop={false}
      title={product ? 'Editar produto' : 'Novo produto'}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          {!readOnly && (
            <Button onClick={submit} loading={busy}>
              Salvar produto
            </Button>
          )}
        </>
      }
    >
      <fieldset disabled={readOnly} className="grid grid-cols-1 gap-4 sm:grid-cols-6">
        <Field className="sm:col-span-4" label="Nome" required error={errors.name}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus placeholder="Ex.: Placa de gesso ST 1,20 × 1,80" />
        </Field>
        <Field className="sm:col-span-2" label="Código interno">
          <Input value={f.code} onChange={(e) => set('code', e.target.value)} />
        </Field>
        <Field className="sm:col-span-2" label="Categoria">
          <Select value={f.category} onChange={(e) => setF((p) => ({ ...p, category: e.target.value as ProductCategory, indivisible: e.target.value === 'placas' ? true : p.indivisible }))}>
            {PRODUCT_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {PRODUCT_CATEGORY_LABEL[c]}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="Unidade de medida" required error={errors.unit}>
          <Input value={f.unit} onChange={(e) => set('unit', e.target.value)} placeholder="un, kg, m, saco, caixa" />
        </Field>
        <Field className="sm:col-span-2" label="Custo unitário" required>
          <MoneyInput value={f.unitCost} onChange={(v) => set('unitCost', v)} />
        </Field>
        <Field className="sm:col-span-2" label="Dimensões">
          <Input value={f.dimensions} onChange={(e) => set('dimensions', e.target.value)} placeholder="1,20 × 1,80 m" />
        </Field>
        {plate && (
          <Field className="sm:col-span-2" label="Área por placa (m²)" required error={errors.plateArea} hint="Ex.: 1,20 × 1,80 = 2,16 m²">
            <NumberInput value={f.plateArea} onChange={(v) => set('plateArea', v)} decimals={4} min={0} suffix="m²" />
          </Field>
        )}
        <Field className="sm:col-span-2" label="Estoque mínimo">
          <NumberInput value={f.minStock} onChange={(v) => set('minStock', v ?? 0)} decimals={3} min={0} suffix={f.unit} />
        </Field>
        {!product && (
          <Field className="sm:col-span-2" label="Quantidade disponível inicial" hint="Registrada como entrada de estoque.">
            <NumberInput value={initial} onChange={setInitial} decimals={3} min={0} suffix={f.unit} />
          </Field>
        )}
        <Field className="sm:col-span-3" label="Fornecedor">
          <Input value={f.supplier} onChange={(e) => set('supplier', e.target.value)} />
        </Field>
        <Field className="sm:col-span-6" label="Descrição">
          <Textarea value={f.description} onChange={(e) => set('description', e.target.value)} />
        </Field>
        <div className="flex flex-wrap gap-6 sm:col-span-6">
          <Toggle checked={f.indivisible} onChange={(v) => set('indivisible', v)} label="Vendido em unidades inteiras (arredonda para cima)" disabled={plate} />
          <Toggle checked={f.active} onChange={(v) => set('active', v)} label="Ativo" />
        </div>
      </fieldset>
    </Modal>
  );
}
