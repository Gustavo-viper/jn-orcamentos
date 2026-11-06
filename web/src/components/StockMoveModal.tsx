import { useEffect, useState } from 'react';
import { roundTo, STOCK_MOVEMENT_LABEL, type Product, type StockMovementType } from '@jn/shared';
import { getDb } from '../lib/db';
import { runCommand } from '../lib/data';
import { useAuth } from '../lib/auth';
import { uuid } from '../lib/ids';
import { formatNumber } from '../lib/format';
import { Button, Checkbox, Field, Input, Modal, MoneyInput, NumberInput, Tabs, toast } from './ui';

/** Registra entrada, saída ou ajuste de estoque (com efeito imediato no aparelho). */
export async function moveStockCommand(p: { product: Product; type: StockMovementType; quantity: number; reason: string; unitCost?: number | null; jobId?: string | null; allowNegative?: boolean; userId: string; userName: string }) {
  const id = uuid();
  const delta = roundTo(p.type === 'in' ? p.quantity : p.type === 'out' ? -p.quantity : p.quantity - p.product.quantity, 3);
  const balance = roundTo(p.product.quantity + delta, 3);
  await runCommand(
    'stock.move',
    { id, productId: p.product.id, type: p.type, quantity: p.quantity, reason: p.reason, unitCost: p.unitCost ?? null, jobId: p.jobId ?? null, allowNegative: !!p.allowNegative },
    {
      targets: [p.product.id, id],
      description: `${STOCK_MOVEMENT_LABEL[p.type]} de ${p.product.name}`,
      optimistic: async () => {
        const db = getDb();
        const now = new Date().toISOString();
        await db.products.update(p.product.id, { quantity: balance });
        await db.stockMovements.put({ id, productId: p.product.id, type: p.type, delta, balanceAfter: balance, unitCost: p.unitCost ?? p.product.unitCost, reason: p.reason, jobId: p.jobId ?? null, createdBy: p.userId, createdByName: p.userName, createdAt: now, updatedAt: now, version: 0, deletedAt: null });
      },
    },
  );
  return { delta, balance };
}

export function StockMoveModal({ product, open, onClose, initialType = 'in' }: { product: Product | null; open: boolean; onClose: () => void; initialType?: StockMovementType }) {
  const { user } = useAuth();
  const [type, setType] = useState<StockMovementType>(initialType);
  const [qty, setQty] = useState<number | null>(null);
  const [reason, setReason] = useState('');
  const [unitCost, setUnitCost] = useState<number | null>(null);
  const [allowNeg, setAllowNeg] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (open) {
      setType(initialType);
      setQty(null);
      setReason('');
      setUnitCost(product?.unitCost ?? null);
      setAllowNeg(false);
    }
  }, [open, initialType, product]);

  if (!product) return null;
  const q = qty ?? 0;
  const balance = roundTo(type === 'in' ? product.quantity + q : type === 'out' ? product.quantity - q : q, 3);
  const negative = balance < 0;
  const isAdmin = user?.role === 'admin';

  const submit = async () => {
    if (type !== 'adjust' && !(q > 0)) return toast.error('Informe a quantidade.');
    if (type === 'adjust' && qty === null) return toast.error('Informe o saldo contado.');
    if (type === 'adjust' && !reason.trim()) return toast.error('Informe o motivo do ajuste.');
    if (negative && !(isAdmin && allowNeg)) return toast.error('O estoque ficaria negativo. Somente o administrador pode autorizar.');
    setBusy(true);
    try {
      await moveStockCommand({ product, type, quantity: q, reason: reason.trim(), unitCost: type === 'in' ? unitCost : null, allowNegative: allowNeg, userId: user!.id, userName: user!.name });
      toast(`${STOCK_MOVEMENT_LABEL[type]} registrada. Novo saldo: ${formatNumber(balance, 3)} ${product.unit}.`);
      onClose();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="sm"
      title={`Movimentar estoque — ${product.name}`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy}>
            Registrar
          </Button>
        </>
      }
    >
      <Tabs className="mb-4" value={type} onChange={setType} tabs={[{ value: 'in', label: 'Entrada' }, { value: 'out', label: 'Saída' }, { value: 'adjust', label: 'Ajuste' }]} />
      <div className="space-y-4">
        <div className="rounded-xl bg-graphite-50 p-3 text-sm dark:bg-white/[0.03]">
          Saldo atual: <b className="tabular">{formatNumber(product.quantity, 3)} {product.unit}</b>
        </div>
        <Field label={type === 'adjust' ? 'Saldo contado (novo saldo)' : 'Quantidade'} required>
          <NumberInput value={qty} onChange={setQty} decimals={3} min={0} suffix={product.unit} autoFocus />
        </Field>
        {type === 'in' && (
          <Field label="Custo unitário desta entrada" hint="Registrado na movimentação para relatórios de custo.">
            <MoneyInput value={unitCost} onChange={setUnitCost} />
          </Field>
        )}
        <Field label="Motivo / observação" required={type === 'adjust'}>
          <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder={type === 'in' ? 'Ex.: Compra NF 1234' : type === 'out' ? 'Ex.: Uso em obra, perda' : 'Ex.: Inventário mensal'} />
        </Field>
        <div className={`rounded-xl p-3 text-sm ${negative ? 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300' : 'bg-navy-50 text-navy-800 dark:bg-white/5 dark:text-graphite-200'}`}>
          Saldo após a operação: <b className="tabular">{formatNumber(balance, 3)} {product.unit}</b>
          {negative && <div className="mt-1 text-xs">O estoque ficará negativo.</div>}
        </div>
        {negative && isAdmin && <Checkbox checked={allowNeg} onChange={setAllowNeg} label="Autorizo o estoque negativo (administrador)" />}
      </div>
    </Modal>
  );
}
