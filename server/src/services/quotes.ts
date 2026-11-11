import { and, eq, inArray, isNull, ne } from 'drizzle-orm';
import {
  calculateQuote,
  can,
  firstZodError,
  formatBRL,
  formatQuoteNumber,
  quoteSchema,
  addDaysISO,
  todayISO,
  type CalcProduct,
  type CalcService,
  type Installment,
  type QuoteTotals,
} from '@jn/shared';
import * as s from '../db/schema.js';
import type { Tx } from '../db/client.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { logActivity, logChange } from './audit.js';
import { bump, nextNumber, requirePerm, touch, type Ctx } from './context.js';
import { loadOne, rawOne } from './records.js';

/** Carrega serviços e produtos (do BANCO, nunca do cliente) para o cálculo. */
export async function loadCatalog(tx: Tx, serviceIds: string[]) {
  const ids = [...new Set(serviceIds)];
  if (!ids.length) return { services: [] as CalcService[], products: [] as CalcProduct[] };
  const svc = await tx.select().from(s.services).where(inArray(s.services.id, ids));
  const mats = await tx.select().from(s.serviceMaterials).where(inArray(s.serviceMaterials.serviceId, ids));
  const prodIds = [...new Set(mats.map((m) => m.productId))];
  const prods = prodIds.length ? await tx.select().from(s.products).where(inArray(s.products.id, prodIds)) : [];
  const services: CalcService[] = svc
    .filter((x) => !x.deletedAt)
    .map((x) => ({
      id: x.id,
      name: x.name,
      measurementType: x.measurementType,
      pricingMode: x.pricingMode,
      laborPrice: x.laborPrice,
      chargeUnit: x.chargeUnit,
      linearBasis: x.linearBasis,
      addons: (x.addons ?? []) as CalcService['addons'],
      materials: mats
        .filter((m) => m.serviceId === x.id)
        .sort((a, b) => a.position - b.position)
        .map((m) => ({ productId: m.productId, consumption: m.consumption })),
    }));
  const products: CalcProduct[] = prods.map((p) => ({
    id: p.id,
    name: p.name,
    unit: p.unit,
    category: p.category,
    unitCost: p.unitCost,
    plateArea: p.plateArea,
    indivisible: p.indivisible,
  }));
  return { services, products };
}

const EDITABLE = new Set(['draft', 'pending', 'expired']);
const QUOTE_FIELDS = Object.keys(quoteSchema.shape) as (keyof typeof quoteSchema.shape)[];

export async function saveQuote(ctx: Ctx, id: string, data: Record<string, unknown>, baseVersion: number | null, opId: string) {
  const { tx } = ctx;
  const existing = await rawOne<typeof s.quotes.$inferSelect>(tx, 'quotes', id);
  if (existing?.deletedAt) throw conflict('Este orçamento foi excluído.');
  requirePerm(ctx, 'quotes', existing ? 'edit' : 'create');
  if (existing && !EDITABLE.has(existing.status))
    throw conflict(`Orçamento ${formatQuoteNumber(existing.number)} já está ${existing.status === 'approved' ? 'aprovado' : 'recusado'} e não pode ser alterado. Duplique-o para criar uma nova versão.`);

  const current = existing ? await loadOne(tx, 'quotes', id) : null;
  const merged: Record<string, unknown> = {};
  for (const k of QUOTE_FIELDS) merged[k] = k in data ? data[k] : current?.[k];
  const parsed = quoteSchema.safeParse(merged);
  if (!parsed.success) throw badRequest(firstZodError(parsed.error));
  const q = parsed.data;

  const [client] = await tx.select({ id: s.clients.id, name: s.clients.name, deletedAt: s.clients.deletedAt }).from(s.clients).where(eq(s.clients.id, q.clientId));
  if (!client || client.deletedAt) throw badRequest('Cliente do orçamento não encontrado.');
  if (q.validUntil < q.issueDate) throw badRequest('A validade não pode ser anterior à data do orçamento.');

  const catalog = await loadCatalog(tx, q.environments.map((e) => e.serviceId));
  const calc = calculateQuote(
    {
      environments: q.environments,
      marginPct: q.marginPct,
      marginOnLabor: q.marginOnLabor,
      discountType: q.discountType,
      discountValue: q.discountValue,
      installments: q.installments,
    },
    catalog.services,
    catalog.products,
  );
  if (q.status === 'pending') {
    if (!q.environments.length) throw badRequest('Adicione pelo menos um ambiente antes de gerar o orçamento.');
    if (calc.errors.length) throw badRequest(`Corrija o orçamento antes de gerar: ${calc.errors[0]}`);
  }

  if (existing && baseVersion != null && baseVersion !== existing.version) {
    await tx.insert(s.syncConflicts).values({
      id: newId(),
      opId,
      userId: ctx.user.id,
      entity: 'quotes',
      entityId: id,
      baseVersion,
      serverVersion: existing.version,
      clientData: JSON.parse(JSON.stringify(data)),
      serverData: JSON.parse(JSON.stringify(current)),
      resolution: 'documento do cliente aplicado sobre a versão do servidor (orçamento ainda editável)',
    });
  }

  const header = {
    clientId: q.clientId,
    title: q.title,
    status: q.status,
    issueDate: q.issueDate,
    validUntil: q.validUntil,
    marginPct: q.marginPct,
    marginOnLabor: q.marginOnLabor,
    discountType: q.discountType,
    discountValue: q.discountValue,
    installments: q.installments,
    paymentTerms: q.paymentTerms,
    notes: q.notes,
    calc: JSON.parse(JSON.stringify(calc)),
    subtotal: calc.subtotal,
    discount: calc.discount,
    total: calc.total,
    totalCost: calc.totalCost,
    estimatedProfit: calc.estimatedProfit,
  };

  let number = existing?.number ?? null;
  if (existing) {
    await tx.update(s.quotes).set({ ...header, ...bump(s.quotes) }).where(eq(s.quotes.id, id));
    await tx.delete(s.quoteItems).where(eq(s.quoteItems.quoteId, id));
    await tx.delete(s.quoteMaterials).where(eq(s.quoteMaterials.quoteId, id));
  } else {
    number = await nextNumber(tx, 'quote');
    await tx.insert(s.quotes).values({ id, number, createdBy: ctx.user.id, ...header });
  }

  // Ambientes (itens) com valores calculados
  if (q.environments.length) {
    const ids = new Set<string>();
    await tx.insert(s.quoteItems).values(
      q.environments.map((e, i) => {
        const r = calc.environments[i];
        // ids de ambiente são únicos por orçamento; ao duplicar um orçamento o cliente gera novos ids
        let itemId = e.id;
        if (ids.has(itemId)) itemId = newId();
        ids.add(itemId);
        return {
          id: itemId,
          quoteId: id,
          position: i,
          name: e.name,
          serviceId: e.serviceId,
          serviceName: r.serviceName,
          measurementType: r.measurementType,
          width: e.width,
          length: e.length,
          height: e.height,
          surface: e.surface,
          wastePct: e.wastePct,
          laborPriceOverride: e.laborPriceOverride,
          linearOverride: e.linearOverride,
          quantity: e.quantity,
          deductions: e.deductions,
          // snapshot do adicional + resultado calculado (medida/valor) para exibir no PDF/portal
          addons: (e.addons ?? []).map((a) => {
            const ar = r.addons.find((x) => x.id === a.id);
            return { ...a, measure: ar?.measure ?? 0, laborCost: ar?.laborCost ?? 0, price: ar?.price ?? 0 };
          }),
          grossArea: r.grossArea,
          netArea: r.netArea,
          linear: r.linear,
          measure: r.measure,
          laborCost: r.laborCost,
          materialCost: r.materialCost,
          price: r.price,
        };
      }),
    );
  }
  if (calc.materials.length) {
    await tx.insert(s.quoteMaterials).values(
      calc.materials.map((m) => ({ id: newId(), quoteId: id, productId: m.productId, name: m.name, unit: m.unit, qty: m.qty, unitCost: m.unitCost, cost: m.cost })),
    );
  }

  const after = await loadOne(tx, 'quotes', id);
  await logChange(tx, ctx.actor, 'quotes', id, existing ? 'update' : 'create', current, after);
  await logActivity(
    tx,
    ctx.actor,
    existing ? 'quote.update' : 'quote.create',
    'quotes',
    id,
    `${existing ? 'Orçamento alterado' : 'Orçamento criado'}: ${formatQuoteNumber(number)} — ${client.name} — ${formatBRL(calc.total)}`,
  );
  touch(ctx, 'quotes', id);
}

/** Transições de situação permitidas pelo painel. */
const STATUS_TRANSITIONS: Record<string, string[]> = {
  draft: ['pending'],
  pending: ['approved', 'refused', 'draft'],
  expired: ['pending', 'refused', 'draft'],
  refused: ['draft'],
  approved: [],
};

export async function setQuoteStatus(ctx: Ctx, p: { quoteId: string; status: string; createReceivables?: boolean; note?: string }) {
  requirePerm(ctx, 'quotes', 'edit');
  const { tx } = ctx;
  const q = await rawOne<typeof s.quotes.$inferSelect>(tx, 'quotes', p.quoteId);
  if (!q || q.deletedAt) throw notFound('Orçamento não encontrado.');
  if (q.status === p.status) {
    touch(ctx, 'quotes', q.id);
    return;
  }
  if (!STATUS_TRANSITIONS[q.status]?.includes(p.status))
    throw conflict(`Não é possível mudar o orçamento de "${q.status}" para "${p.status}".`);
  const calc = q.calc as QuoteTotals | null;
  if ((p.status === 'pending' || p.status === 'approved') && (!calc || calc.errors.length || !calc.environments.length))
    throw badRequest('O orçamento possui pendências de cálculo. Abra-o e corrija antes de continuar.');

  let validUntil = q.validUntil;
  if (p.status === 'pending' && q.validUntil < todayISO()) {
    // reenviar orçamento expirado renova a validade pelo prazo padrão
    const [cfg] = await tx.select().from(s.settings).where(eq(s.settings.id, 'quote'));
    const days = Number((cfg?.value as { validityDays?: number })?.validityDays ?? 15);
    validUntil = addDaysISO(todayISO(), days);
  }
  const decided = p.status === 'approved' || p.status === 'refused';
  await tx
    .update(s.quotes)
    .set({
      status: p.status as typeof q.status,
      validUntil,
      decidedAt: decided ? new Date() : null,
      decidedBy: decided ? ctx.actor.name : null,
      ...bump(s.quotes),
    })
    .where(eq(s.quotes.id, q.id));
  const [client] = await tx.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, q.clientId));
  const label: Record<string, string> = { pending: 'enviado ao cliente', approved: 'aprovado', refused: 'recusado', draft: 'reaberto como rascunho' };
  await logActivity(tx, ctx.actor, `quote.${p.status}`, 'quotes', q.id, `Orçamento ${formatQuoteNumber(q.number)} ${label[p.status]} — ${client?.name ?? ''}${p.note ? ` (${p.note})` : ''}`);
  await logChange(tx, ctx.actor, 'quotes', q.id, `status:${p.status}`, { status: q.status }, { status: p.status });
  touch(ctx, 'quotes', q.id);
  if (p.status === 'approved' && p.createReceivables) await createReceivables(ctx, { quoteId: q.id }, true);
}

/**
 * Cria as contas a receber previstas pelas condições de pagamento do orçamento.
 * Idempotente: cada parcela possui chave única (quote:<id>:parcela:<n>), então
 * reprocessamentos/sincronizações nunca duplicam lançamentos.
 */
export async function createReceivables(ctx: Ctx, p: { quoteId: string; firstDueDate?: string }, skipPerm = false) {
  // ao aprovar, as parcelas só são criadas se o usuário puder lançar no financeiro
  if (skipPerm && !can(ctx.user, 'finance', 'create')) return 0;
  if (!skipPerm) requirePerm(ctx, 'finance', 'create');
  const { tx } = ctx;
  const q = await rawOne<typeof s.quotes.$inferSelect>(tx, 'quotes', p.quoteId);
  if (!q || q.deletedAt) throw notFound('Orçamento não encontrado.');
  if (q.status !== 'approved') throw conflict('Somente orçamentos aprovados geram contas a receber.');
  const calc = q.calc as QuoteTotals;
  const [client] = await tx.select({ name: s.clients.name }).from(s.clients).where(eq(s.clients.id, q.clientId));
  const first = p.firstDueDate && /^\d{4}-\d{2}-\d{2}$/.test(p.firstDueDate) ? p.firstDueDate : todayISO();
  const parts = calc.installments as (Installment & { amount: number })[];
  const [job] = await tx
    .select({ id: s.jobs.id })
    .from(s.jobs)
    .where(and(eq(s.jobs.quoteId, q.id), isNull(s.jobs.deletedAt), ne(s.jobs.status, 'cancelled')));
  let created = 0;
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    if (part.amount <= 0) continue;
    const id = newId();
    const category = parts.length === 1 ? 'recebimento' : i === 0 ? 'sinal' : i === parts.length - 1 ? 'pagamento_final' : 'parcela';
    const res = await tx
      .insert(s.financeEntries)
      .values({
        id,
        kind: 'in',
        category,
        description: `${part.label} (${part.pct}%) — ${formatQuoteNumber(q.number)} — ${client?.name ?? ''}`,
        amount: part.amount,
        dueDate: addDaysISO(first, i * 30),
        status: 'pending',
        clientId: q.clientId,
        quoteId: q.id,
        jobId: job?.id ?? null,
        dedupeKey: `quote:${q.id}:parcela:${i}`,
      })
      .onConflictDoNothing({ target: s.financeEntries.dedupeKey })
      .returning({ id: s.financeEntries.id });
    if (res.length) {
      created++;
      touch(ctx, 'financeEntries', id);
    }
  }
  if (created) await logActivity(tx, ctx.actor, 'finance.receivables', 'quotes', q.id, `${created} conta(s) a receber criada(s) para ${formatQuoteNumber(q.number)}`);
  return created;
}

export async function setPortalLink(ctx: Ctx, p: { quoteId: string; token: string | null }) {
  requirePerm(ctx, 'quotes', 'edit');
  const { tx } = ctx;
  const q = await rawOne<typeof s.quotes.$inferSelect>(tx, 'quotes', p.quoteId);
  if (!q || q.deletedAt) throw notFound('Orçamento não encontrado.');
  if (p.token !== null && !/^[A-Za-z0-9_-]{32,128}$/.test(p.token)) throw badRequest('Token de portal inválido.');
  await tx.update(s.quotes).set({ portalToken: p.token, ...bump(s.quotes) }).where(eq(s.quotes.id, q.id));
  await logActivity(tx, ctx.actor, p.token ? 'portal.link' : 'portal.revoke', 'quotes', q.id, `${p.token ? 'Link do portal gerado' : 'Link do portal revogado'} — ${formatQuoteNumber(q.number)}`);
  touch(ctx, 'quotes', q.id);
}
