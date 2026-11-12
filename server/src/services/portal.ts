/**
 * Portal do cliente: acesso público por link com token aleatório de 256 bits.
 * Expõe somente os dados do próprio orçamento — nunca custos internos, margens
 * ou informações de outros clientes.
 */
import { and, desc, eq, gt } from 'drizzle-orm';
import { formatBRL, formatQuoteNumber, quoteDisplayStatus, type QuoteTotals, DEFAULT_COMPANY } from '@jn/shared';
import * as s from '../db/schema.js';
import { db, writeTx } from '../db/client.js';
import { conflict, notFound } from '../lib/errors.js';
import { newId } from '../lib/ids.js';
import { logActivity, PORTAL_ACTOR } from './audit.js';
import { bump } from './context.js';
import { notifyChange } from './bus.js';
import { loadRecords } from './records.js';

async function findQuote(token: string) {
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(token)) throw notFound('Link inválido ou expirado.');
  const [q] = await db().select().from(s.quotes).where(eq(s.quotes.portalToken, token));
  if (!q || q.deletedAt) throw notFound('Link inválido ou expirado.');
  return q;
}

export async function portalView(token: string, ip: string, userAgent: string) {
  const q = await findQuote(token);
  const [client] = await db().select().from(s.clients).where(eq(s.clients.id, q.clientId));
  const [company] = await db().select().from(s.settings).where(eq(s.settings.id, 'company'));
  const calc = q.calc as QuoteTotals;
  const [full] = await loadRecords(db(), 'quotes', [q.id]);
  const events = await db()
    .select({ type: s.portalEvents.type, message: s.portalEvents.message, createdAt: s.portalEvents.createdAt })
    .from(s.portalEvents)
    .where(eq(s.portalEvents.quoteId, q.id))
    .orderBy(desc(s.portalEvents.createdAt))
    .limit(50);

  // registra visualização (no máximo uma por hora por endereço)
  const recent = await db()
    .select({ id: s.portalEvents.id })
    .from(s.portalEvents)
    .where(and(eq(s.portalEvents.quoteId, q.id), eq(s.portalEvents.type, 'viewed'), eq(s.portalEvents.ip, ip), gt(s.portalEvents.createdAt, new Date(Date.now() - 3600_000))))
    .limit(1);
  if (!recent.length) {
    await writeTx(async (tx) => {
      await tx.insert(s.portalEvents).values({ id: newId(), quoteId: q.id, type: 'viewed', ip, userAgent: userAgent.slice(0, 300) });
    });
    notifyChange();
  }

  return {
    company: { ...DEFAULT_COMPANY, ...((company?.value as object) ?? {}) },
    client: client
      ? { name: client.name, document: client.document, phone: client.phone, email: client.email, address: client.address, number: client.number, district: client.district, city: client.city, state: client.state, complement: client.complement, cep: client.cep }
      : null,
    quote: {
      number: q.number,
      numberLabel: formatQuoteNumber(q.number),
      title: q.title,
      status: quoteDisplayStatus(q),
      issueDate: q.issueDate,
      validUntil: q.validUntil,
      paymentTerms: q.paymentTerms,
      notes: q.notes,
      decidedAt: q.decidedAt,
      clientComment: q.clientComment,
      environments: (full?.environments as unknown[]) ?? [],
      calc: {
        // somente informações comerciais — sem custos e margens
        environments: calc.environments.map((e) => ({
          envId: e.envId, name: e.name, serviceName: e.serviceName, measurementType: e.measurementType, chargeUnit: e.chargeUnit,
          grossArea: e.grossArea, deductedArea: e.deductedArea, netArea: e.netArea, perimeter: e.perimeter, linear: e.linear, quantity: e.quantity, measure: e.measure, plates: e.plates, price: e.price,
          basePrice: e.basePrice ?? e.price,
          addons: (e.addons ?? []).map((a) => ({ id: a.id, name: a.name, measurementType: a.measurementType, chargeUnit: a.chargeUnit, measure: a.measure, price: a.price })),
          materials: e.materials.map((m) => ({ productId: m.productId, name: m.name, unit: m.unit, qty: m.qty })),
        })),
        materials: calc.materials.map((m) => ({ productId: m.productId, name: m.name, unit: m.unit, qty: m.qty })),
        grossArea: calc.grossArea, deductedArea: calc.deductedArea, netArea: calc.netArea, linearTotal: calc.linearTotal, plates: calc.plates,
        subtotal: calc.subtotal, discount: calc.discount, total: calc.total, installments: calc.installments,
      },
    },
    events: events.filter((e) => e.type !== 'viewed'),
  };
}

export async function portalDecision(token: string, decision: 'approve' | 'refuse', name: string, message: string, ip: string, userAgent: string) {
  const q = await findQuote(token);
  const display = quoteDisplayStatus(q);
  if (q.status === 'approved' || q.status === 'refused') throw conflict('Este orçamento já foi respondido.');
  if (display === 'expired') throw conflict('A validade deste orçamento expirou. Entre em contato com a J&N para uma nova proposta.');
  if (q.status !== 'pending') throw conflict('Este orçamento ainda não está disponível para aprovação.');
  const status = decision === 'approve' ? 'approved' : 'refused';
  const who = name.trim().slice(0, 120) || 'Cliente';
  const now = new Date();
  await writeTx(async (tx) => {
    await tx
      .update(s.quotes)
      .set({ status, decidedAt: now, decidedBy: `${who} (portal)`, clientComment: message.slice(0, 2000), ...bump(s.quotes) })
      .where(and(eq(s.quotes.id, q.id), eq(s.quotes.status, 'pending')));
    await tx.insert(s.portalEvents).values({
      id: newId(),
      quoteId: q.id,
      type: status,
      message: `${who}${message ? `: ${message.slice(0, 2000)}` : ''}`,
      ip,
      userAgent: userAgent.slice(0, 300),
    });
    await logActivity(tx, PORTAL_ACTOR, `quote.${status}`, 'quotes', q.id, `Orçamento ${formatQuoteNumber(q.number)} ${status === 'approved' ? 'APROVADO' : 'recusado'} pelo cliente no portal (${who}) — ${formatBRL(q.total)}`);
  });
  notifyChange();
  return { status, decidedAt: now.toISOString() };
}

export async function portalComment(token: string, name: string, message: string, ip: string, userAgent: string) {
  const q = await findQuote(token);
  const text = message.trim().slice(0, 2000);
  if (!text) throw conflict('Escreva sua mensagem.');
  await writeTx(async (tx) => {
    await tx.insert(s.portalEvents).values({ id: newId(), quoteId: q.id, type: 'comment', message: `${name.trim().slice(0, 120) || 'Cliente'}: ${text}`, ip, userAgent: userAgent.slice(0, 300) });
    await tx.update(s.quotes).set(bump(s.quotes)).where(eq(s.quotes.id, q.id));
    await logActivity(tx, PORTAL_ACTOR, 'portal.comment', 'quotes', q.id, `Nova observação do cliente no orçamento ${formatQuoteNumber(q.number)}`);
  });
  notifyChange();
}
