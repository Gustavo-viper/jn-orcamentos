/** Importação do sistema anterior — dados fictícios no formato do app antigo. */
import { beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';

process.env.PGLITE_MEMORY = 'true';
process.env.NODE_ENV = 'test';
process.env.BACKUP_DIR = `${process.env.TEMP ?? '/tmp'}/jn-test-legacy-${Date.now()}`;

type Rec = { resource: string; record_id: string; data: Record<string, unknown>; is_deleted: boolean; updated_at: string };
const rec = (resource: string, id: string, data: Record<string, unknown>, is_deleted = false): Rec => ({ resource, record_id: id, data: { id, ...data }, is_deleted, updated_at: '2026-10-01T12:00:00Z' });

const legacy: Rec[] = [
  rec('settings', 'company', { name: 'Empresa Teste', document: '', phone: '11 0000-0000', whatsapp: '', email: 'teste@exemplo.com', address: 'Rua X', city: 'Cidade', state: 'SP', zip: '00000-000', quoteValidityDays: 10, defaultMargin: 25, downPaymentPercent: 40, paymentTerms: 'PIX' }),
  rec('clients', 'c1', { name: 'Cliente Antigo', document: '', phone: '11999990000', whatsapp: '', email: '', address: 'Rua A', number: '1', district: 'B', city: 'Cidade', state: 'SP', zip: '', status: 'ativo', createdAt: '2026-01-10' }),
  rec('clients', 'c2', { name: 'Cliente Excluído', status: 'ativo' }, true),
  rec('products', 'p1', { name: 'Placa teste', category: 'Placas', unit: 'un', cost: 32.9, width: 1.2, length: 1.8 }),
  rec('products', 'p2', { name: 'Massa teste', category: 'Massa', unit: 'kg', cost: 4.5 }),
  rec('services', 's1', { name: 'Forro teste', description: 'd', measureType: 'area', laborPrice: 35, unitLabel: 'm²', active: true, materials: [{ productId: 'p1', consumption: 1, mode: 'per_plate' }, { productId: 'p2', consumption: 0.5, mode: 'per_measure' }] }),
  rec('quotes', 'q1', {
    number: 'ORC-0007', token: 'ABCDEF0123456789ABCDEF0123456789', clientId: 'c1', clientName: 'Cliente Antigo', status: 'aprovado', materialsCost: 398.58, laborCost: 641.2, totalCost: 1039.78, marginPercent: 30, profit: 311.93,
    priceBeforeDiscount: 1351.71, discountType: 'value', discountValue: 51.71, discountAmount: 51.71, total: 1300, downPaymentPercent: 50, paymentTerms: 'PIX', notes: 'obs', validUntil: '2026-02-01', createdAt: '2026-01-15', approvedAt: '2026-01-16',
    items: [{ id: 'i1', roomName: 'Sala', serviceId: 's1', serviceName: 'Forro teste', measureType: 'area', width: 4, length: 5, height: 2.8, area: 20, negativeArea: 1.68, perimeter: 18, linear: 0, measureValue: 18.32, wastePercent: 10, negativeMeasures: [{ id: 'n1', label: 'Porta', width: 0.8, length: 2.1 }], materials: [{ productId: 'p1', productName: 'Placa teste', unit: 'un', consumption: 1, consumptionLabel: '', quantity: 10, unitCost: 32.9, total: 329 }], materialsCost: 398.58, laborUnitPrice: 35, laborTotal: 641.2 }],
  }),
  rec('quotes', 'q2', { number: 'ORC-0007', clientId: 'c1', status: 'pendente', items: [], total: 100, totalCost: 80, createdAt: '2026-02-01', validUntil: '2026-02-10' }),
  rec('quotes', 'q3', { number: 'ORC-0009', clientId: 'nao-existe', status: 'rascunho', items: [], total: 10 }),
  rec('workOrders', 'w1', { number: 'OS-0003', quoteId: 'q1', clientId: 'c1', address: 'Rua A', serviceName: 'Forro teste', team: 'Equipe', startDate: '2026-01-20', expectedEnd: '2026-01-25', status: 'concluida', total: 1300, createdAt: '2026-01-16', materials: [{ productName: 'Placa teste', quantity: 10, unit: 'un' }, { productName: 'Desconhecido', quantity: 2, unit: 'un' }], timeline: [{ id: 't1', date: '2026-01-20', title: 'Início', status: 'em_andamento' }, { id: 't2', date: '2026-01-25', title: 'Fim', status: 'concluida' }] }),
  rec('finance', 'f1', { description: 'Entrada', clientId: 'c1', type: 'entrada', category: 'servico', amount: 650, dueDate: '2026-01-16', paidAt: '2026-01-16', status: 'pago', quoteId: 'q1', workOrderId: 'w1' }),
  rec('finance', 'f2', { description: 'Saldo', clientId: 'c1', type: 'entrada', category: 'servico', amount: 650, dueDate: '2026-01-25', status: 'pendente', quoteId: 'q1' }),
  rec('finance', 'f3', { description: 'Gasolina', type: 'saida', category: 'combustivel', amount: 120.5, dueDate: '2026-01-21', status: 'pago' }),
  rec('activities', 'a1', { message: 'Orçamento aprovado', date: '2026-01-16', type: 'quote' }),
  rec('estranho', 'x1', { foo: 1 }),
];

let importLegacy: typeof import('../src/services/legacy-import.js').importLegacy;
let db: typeof import('../src/db/client.js').db;
let s: typeof import('../src/db/schema.js');

beforeAll(async () => {
  const c = await import('../src/db/client.js');
  await c.migrate();
  await (await import('../src/services/maintenance.js')).ensureSettings();
  importLegacy = (await import('../src/services/legacy-import.js')).importLegacy;
  db = c.db;
  s = await import('../src/db/schema.js');
}, 60_000);

const countAll = async () => {
  const r: Record<string, number> = {};
  for (const [k, t] of Object.entries({ clients: s.clients, products: s.products, services: s.services, quotes: s.quotes, jobs: s.jobs, finance: s.financeEntries, payments: s.payments, events: s.jobEvents }))
    r[k] = (await db().select({ n: sql<number>`count(*)::int` }).from(t))[0].n;
  return r;
};

describe('importação do sistema anterior', () => {
  it('simulação não grava nada', async () => {
    const before = await countAll();
    const rep = await importLegacy(legacy as never, { dryRun: true, legacyUsers: [{ username: 'Usuario1', email: null }] });
    expect(rep.mode).toBe('simulacao');
    expect(rep.inserted.clients).toBe(1);
    expect(rep.deletedSkipped).toBe(1);
    expect(rep.unknownResources).toEqual({ estranho: 1 });
    expect(rep.warnings.join('\n')).toMatch(/Usuario1/);
    expect(await countAll()).toEqual(before);
  });

  it('grava preservando os valores originais dos orçamentos', async () => {
    const rep = await importLegacy(legacy as never, { dryRun: false });
    expect(rep.warnings.join('\n')).toMatch(/cliente nao-existe não encontrado/);
    const quotes = await db().select().from(s.quotes).orderBy(s.quotes.number);
    expect(quotes).toHaveLength(2);
    const approved = quotes.find((q) => q.status === 'approved')!;
    expect(approved.number).toBe(7);
    expect(approved.total).toBe(130000);
    expect(approved.discount).toBe(5171);
    expect(approved.portalToken).toBe('ABCDEF0123456789ABCDEF0123456789');
    const dup = quotes.find((q) => q.status === 'pending')!;
    expect(dup.number).toBe(10); // número repetido recebe o próximo livre (após 9)
    const items = await db().select().from(s.quoteItems);
    expect(items[0].netArea).toBe(18.32);
    expect((items[0].deductions as unknown[]).length).toBe(1);

    const [svc] = await db().select().from(s.services);
    expect(svc.laborPrice).toBe(3500);
    const mats = await db().select().from(s.serviceMaterials);
    expect(mats).toHaveLength(2);
    const [placa] = await db().select().from(s.products).where(sql`${s.products.category} = 'placas'`);
    expect(placa.plateArea).toBe(2.16);
    expect(placa.unitCost).toBe(3290);

    const [job] = await db().select().from(s.jobs);
    expect(job.status).toBe('completed');
    expect(job.number).toBe(3);
    expect(job.notes).toMatch(/Desconhecido/);
    const fin = await db().select().from(s.financeEntries);
    expect(fin.find((f) => f.description === 'Entrada')!.status).toBe('paid');
    expect(fin.find((f) => f.description === 'Saldo')!.status).toBe('pending');
    expect(fin.find((f) => f.description === 'Gasolina')!.category).toBe('combustivel');
    expect((await db().select().from(s.payments)).length).toBe(2);

    const [company] = await db().select().from(s.settings).where(sql`${s.settings.id} = 'company'`);
    expect((company.value as { name: string }).name).toBe('Empresa Teste');
    const [qs] = await db().select().from(s.settings).where(sql`${s.settings.id} = 'quote'`);
    expect((qs.value as { installments: { pct: number }[] }).installments.map((i) => i.pct)).toEqual([40, 60]);

    const [counter] = await db().select().from(s.counters).where(sql`${s.counters.name} = 'quote'`);
    expect(counter.value).toBe(10);
  });

  it('rodar de novo não duplica nada', async () => {
    const before = await countAll();
    const rep = await importLegacy(legacy as never, { dryRun: false });
    expect(rep.inserted.clients ?? 0).toBe(0);
    expect(await countAll()).toEqual(before);
  });
});
