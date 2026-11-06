import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowDownUp, ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { PRODUCT_CATEGORY_LABEL, STOCK_MOVEMENT_LABEL, formatJobNumber } from '@jn/shared';
import { deleteRecord, useRecord, useTable, useWhere } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { fmtDateTime, formatBRL, formatNumber } from '../../lib/format';
import { StockMoveModal } from '../../components/StockMoveModal';
import { ChangeHistory } from '../../components/History';
import { Badge, Button, Card, CardHeader, confirmDialog, EmptyState, KeyValue, LoadingBlock, LoadMore, PageHeader, StatCard, Tabs, toast, usePaged } from '../../components/ui';
import { ProductModal } from './Products';

export default function ProductDetail() {
  const { id } = useParams();
  const product = useRecord('products', id);
  const movements = useWhere('stockMovements', 'productId', id);
  const jobs = useTable('jobs');
  const services = useTable('services');
  const { can } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'moves' | 'history'>('moves');
  const [moving, setMoving] = useState(false);
  const [editing, setEditing] = useState(false);
  const sorted = useMemo(() => [...(movements ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)), [movements]);
  const { visible, more, loadMore, total } = usePaged(sorted, 30);
  const jobMap = new Map((jobs ?? []).map((j) => [j.id, j]));
  const usedIn = (services ?? []).filter((s) => s.materials.some((m) => m.productId === id));
  const consumed30 = (movements ?? []).filter((m) => m.delta < 0 && m.type === 'out' && Date.now() - new Date(m.createdAt).getTime() < 30 * 86400_000).reduce((s, m) => s - m.delta, 0);

  if (product === undefined) return <LoadingBlock />;
  if (!product || product.deletedAt) return <EmptyState title="Produto não encontrado" />;

  const remove = async () => {
    const ok = await confirmDialog({ title: 'Excluir produto', message: 'Produtos associados a serviços não podem ser excluídos. O histórico de movimentações é preservado.', danger: true, confirmLabel: 'Excluir' });
    if (!ok) return;
    await deleteRecord('products', product.id, `Excluir produto ${product.name}`);
    toast('Exclusão enviada.');
    navigate('/estoque');
  };

  return (
    <div className="animate-fade-in">
      <PageHeader
        back={
          <Link to="/estoque" className="mb-2 inline-flex items-center gap-1 text-sm text-graphite-500 hover:text-graphite-800">
            <ArrowLeft className="h-4 w-4" /> Estoque
          </Link>
        }
        title={product.name}
        subtitle={`${PRODUCT_CATEGORY_LABEL[product.category]}${product.code ? ` · código ${product.code}` : ''}`}
        actions={
          <>
            {can('products', 'edit') && <Button icon={<ArrowDownUp className="h-4 w-4" />} onClick={() => setMoving(true)}>Movimentar</Button>}
            {can('products', 'edit') && <Button variant="outline" icon={<Pencil className="h-4 w-4" />} onClick={() => setEditing(true)}>Editar</Button>}
            {can('products', 'delete') && <Button variant="ghost" size="icon" onClick={remove} aria-label="Excluir"><Trash2 className="h-4 w-4 text-red-500" /></Button>}
          </>
        }
      />
      <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Saldo atual" value={`${formatNumber(product.quantity, 3)} ${product.unit}`} tone={product.quantity < 0 ? 'red' : product.minStock > 0 && product.quantity <= product.minStock ? 'amber' : 'green'} hint={`Mínimo: ${formatNumber(product.minStock, 3)}`} />
        <StatCard label="Custo unitário" value={formatBRL(product.unitCost)} />
        <StatCard label="Valor em estoque" value={formatBRL(Math.round(Math.max(0, product.quantity) * product.unitCost))} tone="gold" />
        <StatCard label="Consumo (30 dias)" value={`${formatNumber(consumed30, 3)} ${product.unit}`} tone="violet" />
      </div>
      <div className="grid gap-5 xl:grid-cols-[320px_1fr]">
        <Card className="h-fit">
          <CardHeader title="Detalhes" />
          <dl className="grid gap-4 p-5">
            <KeyValue label="Unidade">{product.unit}</KeyValue>
            <KeyValue label="Dimensões">{product.dimensions}</KeyValue>
            {product.plateArea && <KeyValue label="Área por placa">{formatNumber(product.plateArea, 4)} m²</KeyValue>}
            <KeyValue label="Fornecedor">{product.supplier}</KeyValue>
            <KeyValue label="Arredondamento">{product.indivisible ? 'Unidades inteiras' : 'Fracionável'}</KeyValue>
            <KeyValue label="Situação">{product.active ? 'Ativo' : 'Inativo'}</KeyValue>
            <KeyValue label="Usado nos serviços">{usedIn.map((s) => s.name).join(', ')}</KeyValue>
            <KeyValue label="Descrição">{product.description}</KeyValue>
          </dl>
        </Card>
        <div className="min-w-0">
          <Tabs className="mb-3" value={tab} onChange={setTab} tabs={[{ value: 'moves', label: 'Movimentações', count: movements?.length }, { value: 'history', label: 'Histórico de alterações' }]} />
          <Card className="overflow-hidden">
            {tab === 'moves' ? (
              sorted.length ? (
                <>
                  <ul className="divide-y divide-graphite-100 dark:divide-white/5">
                    {visible.map((m) => (
                      <li key={m.id} className="flex items-center gap-3 px-4 py-3">
                        <Badge tone={m.type === 'in' ? 'green' : m.type === 'out' ? 'red' : 'blue'}>{STOCK_MOVEMENT_LABEL[m.type]}</Badge>
                        <div className="min-w-0 flex-1">
                          <div className="truncate text-sm">{m.reason || '—'} {m.jobId && jobMap.get(m.jobId) && <Link className="text-navy-600 hover:underline dark:text-gold-300" to={`/obras/${m.jobId}`}>{formatJobNumber(jobMap.get(m.jobId)!.number)}</Link>}</div>
                          <div className="text-xs text-graphite-500">{fmtDateTime(m.createdAt)} · {m.createdByName}</div>
                        </div>
                        <div className="text-right">
                          <div className={`tabular text-sm font-semibold ${m.delta >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{m.delta > 0 ? '+' : ''}{formatNumber(m.delta, 3)}</div>
                          <div className="tabular text-xs text-graphite-500">saldo {formatNumber(m.balanceAfter, 3)}</div>
                        </div>
                      </li>
                    ))}
                  </ul>
                  <LoadMore more={more} onClick={loadMore} shown={visible.length} total={total} />
                </>
              ) : (
                <EmptyState title="Nenhuma movimentação" description="Entradas, saídas e ajustes aparecem aqui." />
              )
            ) : (
              <div className="p-5">
                <ChangeHistory entity="products" id={product.id} labels={{ name: 'Nome', unitCost: 'Custo (centavos)', minStock: 'Mínimo', quantity: 'Saldo', active: 'Ativo', plateArea: 'Área da placa' }} />
              </div>
            )}
          </Card>
        </div>
      </div>
      <StockMoveModal product={product} open={moving} onClose={() => setMoving(false)} />
      {editing && <ProductModal product={product} onClose={() => setEditing(false)} />}
    </div>
  );
}
