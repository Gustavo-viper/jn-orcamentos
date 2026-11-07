/**
 * Importação dos dados do app J&N anterior (tabela app_sync_records, dados em JSON)
 * para o novo banco.
 *
 * Garantias:
 *  - o banco antigo é somente LIDO (nenhuma escrita na origem);
 *  - tudo roda em UMA transação no banco novo; em modo simulação a transação é desfeita;
 *  - idempotente: IDs determinísticos + ON CONFLICT DO NOTHING (rodar de novo não duplica);
 *  - orçamentos importados preservam exatamente os valores originais (documentos comerciais).
 */
import { createHash } from 'node:crypto';
import pg from 'pg';
import { sql } from 'drizzle-orm';
import {
  DEFAULT_COMPANY,
  DEFAULT_QUOTE_SETTINGS,
  splitInstallments,
  todayISO,
  type EnvironmentInput,
  type EnvironmentResult,
  type MaterialLine,
  type QuoteTotals,
} from '@jn/shared';
import * as s from '../db/schema.js';
import { writeTx, type Tx } from '../db/client.js';
import { newId } from '../lib/ids.js';

export interface LegacyRecord {
  resource: string;
  record_id: string;
  data: Record<string, unknown>;
  is_deleted: boolean;
  updated_at: string | Date;
}

export interface ImportReport {
  mode: 'simulacao' | 'gravacao';
  read: Record<string, number>;
  deletedSkipped: number;
  inserted: Record<string, number>;
  alreadyPresent: Record<string, number>;
  unknownResources: Record<string, number>;
  warnings: string[];
}

// ---------------- utilidades ----------------
const ID_RE = /^[A-Za-z0-9_-]{8,64}$/;
/** ID estável: mantém o original se válido; senão gera um UUID determinístico. */
export function mapId(resource: string, oldId: unknown): string {
  const raw = String(oldId ?? '');
  if (ID_RE.test(raw)) return raw;
  const h = createHash('sha1').update(`jn-legacy:${resource}:${raw}`).digest('hex');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-5${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}
const str = (v: unknown, max = 5000) => (v == null ? '' : String(v)).slice(0, max);
const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : Number(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
};
const cents = (reais: unknown) => Math.round(num(reais) * 100);
const isoDate = (v: unknown): string | null => {
  if (!v) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(v));
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
};
const ts = (v: unknown): Date | null => {
  if (!v) return null;
  const d = new Date(String(v));
  return Number.isNaN(d.getTime()) ? null : d;
};
const digits = (v: unknown) => {
  const m = String(v ?? '').match(/(\d+)\s*$/);
  return m ? Number(m[1]) : NaN;
};

const PRODUCT_CATEGORY: Record<string, string> = { Placas: 'placas', 'Fixação': 'fixacao', Massa: 'massa', Perfis: 'perfis', Acabamento: 'acabamento', Ferramentas: 'ferramentas', Outros: 'outros' };
const INDIVISIBLE_UNITS = new Set(['un', 'und', 'unid', 'unidade', 'pc', 'pç', 'peca', 'peça', 'saco', 'sc', 'cx', 'caixa', 'barra', 'rolo', 'balde', 'pacote', 'pct', 'placa']);
const CLIENT_STATUS: Record<string, 'active' | 'inactive' | 'lead'> = { ativo: 'active', inativo: 'inactive', prospecto: 'lead' };
const QUOTE_STATUS: Record<string, 'draft' | 'pending' | 'approved' | 'refused' | 'expired'> = { rascunho: 'draft', pendente: 'pending', aprovado: 'approved', recusado: 'refused', expirado: 'expired' };
const JOB_STATUS: Record<string, 'waiting' | 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled'> = { aguardando: 'waiting', agendada: 'scheduled', em_andamento: 'in_progress', pausada: 'paused', concluida: 'completed', cancelada: 'cancelled' };
const JOB_EVENT: Record<string, string> = { aguardando: 'note', agendada: 'scheduled', em_andamento: 'started', pausada: 'paused', concluida: 'completed', cancelada: 'cancelled' };
function financeCategory(kind: 'in' | 'out', c: string) {
  if (kind === 'in') return c === 'servico' ? 'recebimento' : 'outros_recebimentos';
  return ({ material: 'materiais', combustivel: 'combustivel', ferramentas: 'ferramentas', fornecedor: 'fornecedores', funcionario: 'funcionarios', servico: 'operacionais' } as Record<string, string>)[c] ?? 'outras_despesas';
}

// ---------------- importação ----------------
class DryRun extends Error {}

export async function importLegacy(records: LegacyRecord[], opts: { dryRun: boolean; legacyUsers?: { username: string; email: string | null }[] }): Promise<ImportReport> {
  const report: ImportReport = { mode: opts.dryRun ? 'simulacao' : 'gravacao', read: {}, deletedSkipped: 0, inserted: {}, alreadyPresent: {}, unknownResources: {}, warnings: [] };
  const by = new Map<string, LegacyRecord[]>();
  for (const r of records) {
    report.read[r.resource] = (report.read[r.resource] ?? 0) + 1;
    if (r.is_deleted) {
      report.deletedSkipped++;
      continue;
    }
    by.set(r.resource, [...(by.get(r.resource) ?? []), r]);
  }
  const KNOWN = new Set(['clients', 'products', 'services', 'quotes', 'workOrders', 'finance', 'activities', 'settings']);
  for (const [k, v] of by) if (!KNOWN.has(k)) report.unknownResources[k] = v.length;
  const data = (res: string) => (by.get(res) ?? []).map((r) => ({ ...r.data, __id: r.record_id, __updated: r.updated_at }) as Record<string, unknown>);

  const count = (table: string, inserted: boolean) => {
    const bucket = inserted ? report.inserted : report.alreadyPresent;
    bucket[table] = (bucket[table] ?? 0) + 1;
  };
  const ins = async (tx: Tx, table: string, t: Parameters<Tx['insert']>[0], values: Record<string, unknown>) => {
    const r = await tx.insert(t).values(values as never).onConflictDoNothing().returning();
    count(table, r.length > 0);
    return r.length > 0;
  };

  try {
    await writeTx(async (tx) => {
      // ----- configurações -----
      const company = data('settings').find((d) => d.__id === 'company');
      if (company) {
        const value = { ...DEFAULT_COMPANY, name: str(company.name, 200) || DEFAULT_COMPANY.name, document: str(company.document, 20), phone: str(company.phone, 30), whatsapp: str(company.whatsapp, 30), email: str(company.email, 200), address: str(company.address, 300), city: str(company.city, 120), state: str(company.state, 2), cep: str(company.zip, 10) };
        const down = Math.min(100, Math.max(0, num(company.downPaymentPercent ?? 50)));
        const quoteValue = {
          ...DEFAULT_QUOTE_SETTINGS,
          validityDays: Math.max(1, Math.round(num(company.quoteValidityDays) || DEFAULT_QUOTE_SETTINGS.validityDays)),
          marginPct: num(company.defaultMargin ?? DEFAULT_QUOTE_SETTINGS.marginPct),
          installments: down >= 100 ? [{ label: 'À vista', pct: 100 }] : down <= 0 ? [{ label: 'Na conclusão', pct: 100 }] : [{ label: 'Entrada', pct: down }, { label: 'Na conclusão', pct: 100 - down }],
          paymentTerms: str(company.paymentTerms, 2000) || DEFAULT_QUOTE_SETTINGS.paymentTerms,
        };
        for (const [id, v] of [['company', value], ['quote', quoteValue]] as const) {
          const r = await tx.insert(s.settings).values({ id, value: v }).onConflictDoUpdate({ target: s.settings.id, set: { value: v, updatedAt: new Date(), seq: sql`nextval('sync_seq')` } }).returning();
          count('settings', r.length > 0);
        }
      }

      // ----- clientes -----
      const clientIds = new Set<string>();
      for (const c of data('clients')) {
        const id = mapId('clients', c.__id);
        clientIds.add(id);
        await ins(tx, 'clients', s.clients, {
          id, name: str(c.name, 200) || 'Cliente sem nome', document: str(c.document, 20), phone: str(c.phone, 30), whatsapp: str(c.whatsapp, 30), email: str(c.email, 200),
          cep: str(c.zip, 10), address: str(c.address, 300), number: str(c.number, 20), district: str(c.district, 120), city: str(c.city, 120), state: str(c.state, 2),
          complement: '', notes: str(c.notes), status: CLIENT_STATUS[str(c.status)] ?? 'active', createdAt: ts(c.createdAt) ?? new Date(),
        });
      }

      // ----- produtos -----
      const productIds = new Map<string, { id: string; name: string; unit: string }>();
      const productByName = new Map<string, string>();
      for (const p of data('products')) {
        const id = mapId('products', p.__id);
        const category = PRODUCT_CATEGORY[str(p.category)] ?? 'outros';
        const width = num(p.width);
        const length = num(p.length);
        let plateArea: number | null = num(p.areaPerUnit) || (width && length ? Math.round(width * length * 10000) / 10000 : 0) || null;
        if (category !== 'placas') plateArea = null;
        const finalCategory = category === 'placas' && !plateArea ? 'outros' : category;
        if (category === 'placas' && !plateArea) report.warnings.push(`Produto "${str(p.name)}" era Placa sem área — importado como "Outros". Ajuste a categoria e a área.`);
        const unit = str(p.unit, 20) || 'un';
        productIds.set(String(p.__id), { id, name: str(p.name, 200), unit });
        productByName.set(str(p.name).trim().toLowerCase(), id);
        await ins(tx, 'products', s.products, {
          id, code: '', name: str(p.name, 200) || 'Produto', category: finalCategory, unit, unitCost: cents(p.cost), description: str(p.description, 2000),
          dimensions: width && length ? `${width} × ${length} m` : '', plateArea, quantity: 0, minStock: 0, supplier: '',
          indivisible: finalCategory === 'placas' || INDIVISIBLE_UNITS.has(unit.toLowerCase()), active: true,
        });
      }

      // ----- serviços -----
      const serviceIds = new Map<string, string>();
      for (const sv of data('services')) {
        const id = mapId('services', sv.__id);
        serviceIds.set(String(sv.__id), id);
        const linear = sv.measureType === 'linear';
        const inserted = await ins(tx, 'services', s.services, {
          id, name: str(sv.name, 200) || 'Serviço', description: str(sv.description, 2000), measurementType: linear ? 'ml' : 'm2', pricingMode: sv.fixedRate ? 'fixed' : 'cost_plus',
          laborPrice: cents(sv.laborPrice), chargeUnit: str(sv.unitLabel, 20) || (linear ? 'm' : 'm²'), linearBasis: 'perimeter', active: sv.active !== false,
        });
        if (inserted) {
          const mats = (Array.isArray(sv.materials) ? sv.materials : []) as { productId: string; consumption: number; mode?: string }[];
          let pos = 0;
          const seen = new Set<string>();
          for (const m of mats) {
            const p = productIds.get(String(m.productId));
            if (!p || seen.has(p.id)) {
              if (!p) report.warnings.push(`Serviço "${str(sv.name)}": material ${m.productId} não encontrado — ignorado.`);
              continue;
            }
            seen.add(p.id);
            const consumption = m.mode === 'per_plate' && !linear ? 1 : num(m.consumption);
            await tx.insert(s.serviceMaterials).values({ id: mapId('service_materials', `${id}:${p.id}`), serviceId: id, productId: p.id, consumption, position: pos++ }).onConflictDoNothing();
          }
        }
      }

      // ----- orçamentos (valores originais preservados) -----
      const quoteIds = new Map<string, string>();
      const usedNumbers = new Set<number>();
      const quotes = data('quotes');
      let maxQuote = 0;
      for (const q of quotes) {
        const n = digits(q.number);
        if (Number.isFinite(n) && n > 0 && !usedNumbers.has(n)) usedNumbers.add(n);
        if (Number.isFinite(n)) maxQuote = Math.max(maxQuote, n);
      }
      const assigned = new Set<number>();
      for (const q of quotes) {
        const id = mapId('quotes', q.__id);
        quoteIds.set(String(q.__id), id);
        const clientId = mapId('clients', q.clientId);
        if (!clientIds.has(clientId)) {
          report.warnings.push(`Orçamento ${str(q.number)}: cliente ${str(q.clientId)} não encontrado — orçamento NÃO importado.`);
          continue;
        }
        let number = digits(q.number);
        if (!Number.isFinite(number) || number <= 0 || assigned.has(number)) number = ++maxQuote;
        assigned.add(number);

        const items = (Array.isArray(q.items) ? q.items : []) as Record<string, unknown>[];
        const environments: EnvironmentInput[] = [];
        const envResults: EnvironmentResult[] = [];
        const marginPct = num(q.marginPercent);
        for (const it of items) {
          const envId = mapId('quote_items', `${id}:${it.id}`);
          const linear = it.measureType === 'linear';
          const fixed = !!it.fixedRate;
          const svcId = serviceIds.get(String(it.serviceId)) ?? mapId('services', it.serviceId);
          const deductions = ((Array.isArray(it.negativeMeasures) ? it.negativeMeasures : []) as Record<string, unknown>[]).map((d, i) => ({ id: mapId('deduction', `${envId}:${d.id ?? i}`), label: str(d.label, 100), width: num(d.width), length: num(d.length), quantity: 1 }));
          const materials: MaterialLine[] = ((Array.isArray(it.materials) ? it.materials : []) as Record<string, unknown>[]).map((m) => {
            const p = productIds.get(String(m.productId));
            return { productId: p?.id ?? mapId('products', m.productId), name: str(m.productName, 200), unit: str(m.unit, 20), isPlate: false, rawQty: num(m.quantity), qty: num(m.quantity), unitCost: cents(m.unitCost), cost: cents(m.total) };
          });
          const materialCost = cents(it.materialsCost);
          const laborCost = cents(it.laborTotal);
          const measure = num(it.measureValue);
          const price = fixed ? laborCost : Math.round((materialCost + laborCost) * (1 + marginPct / 100));
          environments.push({ id: envId, name: str(it.roomName, 120) || str(it.serviceName, 120) || 'Ambiente', serviceId: svcId, width: num(it.width), length: num(it.length), height: num(it.height), surface: 'floor', wastePct: num(it.wastePercent), laborPriceOverride: cents(it.laborUnitPrice), linearOverride: linear ? measure : null, quantity: null, deductions });
          envResults.push({
            envId, name: environments[environments.length - 1].name, serviceId: svcId, serviceName: str(it.serviceName, 200), measurementType: linear ? 'ml' : 'm2', pricingMode: fixed ? 'fixed' : 'cost_plus', chargeUnit: str(it.unitLabel, 20) || (linear ? 'm' : 'm²'),
            grossArea: num(it.area), deductedArea: num(it.negativeArea), netArea: linear ? 0 : measure, perimeter: num(it.perimeter), linear: linear ? measure : 0, deductedLinear: num(it.negativePerimeter), quantity: 0, measure,
            wastePct: num(it.wastePercent), laborPrice: cents(it.laborUnitPrice), laborCost: fixed ? 0 : laborCost, materials, materialCost, cost: fixed ? materialCost : materialCost + laborCost, margin: fixed ? 0 : price - materialCost - laborCost, price,
            plates: num((it.plateInfo as { quantity?: number } | undefined)?.quantity), errors: [],
          });
        }
        const total = cents(q.total);
        const totalCost = cents(q.totalCost);
        const down = Math.min(100, Math.max(0, num(q.downPaymentPercent ?? 50)));
        const installments = down >= 100 ? [{ label: 'À vista', pct: 100 }] : down <= 0 ? [{ label: 'Na conclusão', pct: 100 }] : [{ label: 'Entrada', pct: down }, { label: 'Na conclusão', pct: 100 - down }];
        const aggregated = new Map<string, MaterialLine>();
        for (const m of envResults.flatMap((e) => e.materials)) {
          const cur = aggregated.get(m.productId);
          if (cur) {
            cur.qty += m.qty;
            cur.rawQty += m.rawQty;
            cur.cost += m.cost;
          } else aggregated.set(m.productId, { ...m });
        }
        const calc: QuoteTotals & { legacy: true } = {
          legacy: true,
          environments: envResults,
          grossArea: envResults.filter((e) => e.measurementType === 'm2').reduce((a, e) => a + e.grossArea, 0),
          deductedArea: envResults.filter((e) => e.measurementType === 'm2').reduce((a, e) => a + e.deductedArea, 0),
          netArea: envResults.reduce((a, e) => a + e.netArea, 0),
          linearTotal: envResults.reduce((a, e) => a + e.linear, 0),
          plates: envResults.reduce((a, e) => a + e.plates, 0),
          materials: [...aggregated.values()],
          materialCost: cents(q.materialsCost),
          laborCost: cents(q.laborCost),
          fixedPriceTotal: envResults.filter((e) => e.pricingMode === 'fixed').reduce((a, e) => a + e.price, 0),
          totalCost,
          marginPct,
          marginAmount: cents(q.profit),
          subtotal: cents(q.priceBeforeDiscount) || total + cents(q.discountAmount),
          discount: cents(q.discountAmount),
          total,
          estimatedProfit: total - totalCost,
          installments: splitInstallments(total, installments),
          errors: [],
        };
        const status = QUOTE_STATUS[str(q.status)] ?? 'draft';
        const issueDate = isoDate(q.createdAt) ?? todayISO();
        const validUntil = isoDate(q.validUntil) ?? issueDate;
        const token = /^[A-Za-z0-9_-]{32,128}$/.test(str(q.token)) ? str(q.token) : null;
        const inserted = await ins(tx, 'quotes', s.quotes, {
          id, number, clientId, title: '', status, issueDate, validUntil: validUntil < issueDate ? issueDate : validUntil, marginPct, marginOnLabor: true,
          discountType: q.discountType === 'value' ? 'value' : 'pct', discountValue: q.discountType === 'value' ? cents(q.discountValue) : num(q.discountValue),
          installments, paymentTerms: str(q.paymentTerms, 2000), notes: [str(q.notes), `Importado do sistema anterior (nº original ${str(q.number)}).`].filter(Boolean).join('\n'),
          calc, subtotal: calc.subtotal, discount: calc.discount, total, totalCost, estimatedProfit: total - totalCost, portalToken: token,
          decidedAt: ts(q.approvedAt), decidedBy: q.approvedAt ? 'Sistema anterior' : null, clientComment: '', createdBy: '', createdAt: ts(q.createdAt) ?? new Date(),
        });
        if (inserted) {
          for (let i = 0; i < environments.length; i++) {
            const e = environments[i];
            const r = envResults[i];
            await tx.insert(s.quoteItems).values({ id: e.id, quoteId: id, position: i, name: e.name, serviceId: e.serviceId, serviceName: r.serviceName, measurementType: r.measurementType, width: e.width, length: e.length, height: e.height, surface: 'floor', wastePct: e.wastePct, laborPriceOverride: e.laborPriceOverride ?? null, linearOverride: e.linearOverride ?? null, quantity: null, deductions: e.deductions, grossArea: r.grossArea, netArea: r.netArea, linear: r.linear, measure: r.measure, laborCost: r.laborCost, materialCost: r.materialCost, price: r.price }).onConflictDoNothing();
          }
          for (const m of calc.materials) await tx.insert(s.quoteMaterials).values({ id: mapId('quote_materials', `${id}:${m.productId}`), quoteId: id, productId: m.productId, name: m.name, unit: m.unit, qty: m.qty, unitCost: m.unitCost, cost: m.cost }).onConflictDoNothing();
        }
      }

      // ----- ordens de serviço -----
      const jobIds = new Map<string, string>();
      const jobs = data('workOrders');
      let maxJob = Math.max(0, ...jobs.map((j) => digits(j.number)).filter(Number.isFinite));
      const jobNums = new Set<number>();
      for (const j of jobs) {
        const id = mapId('workOrders', j.__id);
        jobIds.set(String(j.__id), id);
        const clientId = mapId('clients', j.clientId);
        if (!clientIds.has(clientId)) {
          report.warnings.push(`OS ${str(j.number)}: cliente não encontrado — OS NÃO importada.`);
          continue;
        }
        let number = digits(j.number);
        if (!Number.isFinite(number) || number <= 0 || jobNums.has(number)) number = ++maxJob;
        jobNums.add(number);
        const quoteId = j.quoteId ? quoteIds.get(String(j.quoteId)) ?? null : null;
        const status = JOB_STATUS[str(j.status)] ?? 'waiting';
        const unmatched: string[] = [];
        const materials = ((Array.isArray(j.materials) ? j.materials : []) as Record<string, unknown>[]).flatMap((m) => {
          const pid = productByName.get(str(m.productName).trim().toLowerCase());
          if (!pid) {
            unmatched.push(`${str(m.productName)}: ${num(m.quantity)} ${str(m.unit)}`);
            return [];
          }
          return [{ productId: pid, name: str(m.productName), unit: str(m.unit), plannedQty: num(m.quantity), consumedQty: 0 }];
        });
        const notes = [str(j.notes), unmatched.length ? `Materiais previstos (sistema anterior): ${unmatched.join('; ')}` : ''].filter(Boolean).join('\n');
        const timeline = (Array.isArray(j.timeline) ? j.timeline : []) as Record<string, unknown>[];
        const completedEv = timeline.find((e) => e.status === 'concluida');
        const inserted = await ins(tx, 'jobs', s.jobs, {
          id, number, quoteId: quoteId && (await tx.select({ id: s.quotes.id }).from(s.quotes).where(sql`${s.quotes.id} = ${quoteId}`)).length ? quoteId : null,
          clientId, address: str(j.address, 500), servicesSummary: str(j.serviceName, 2000), team: str(j.team, 500), startDate: isoDate(j.startDate), expectedEnd: isoDate(j.expectedEnd),
          completedAt: status === 'completed' ? ts(completedEv?.date) ?? new Date() : null, status, contractedValue: cents(j.total), notes, materials, createdAt: ts(j.createdAt) ?? new Date(),
        });
        if (inserted) {
          for (const e of timeline) {
            const st = str(e.status);
            await tx.insert(s.jobEvents).values({ id: mapId('job_events', `${id}:${e.id}`), jobId: id, type: JOB_EVENT[st] ?? 'note', note: [str(e.title), str(e.description)].filter(Boolean).join(' — '), statusTo: JOB_STATUS[st] ?? null, createdBy: '', createdByName: 'Sistema anterior', createdAt: ts(e.date) ?? new Date() }).onConflictDoNothing();
          }
        }
      }

      // ----- financeiro -----
      for (const f of data('finance')) {
        const id = mapId('finance', f.__id);
        const kind = f.type === 'saida' ? 'out' : 'in';
        const amount = cents(f.amount);
        if (amount <= 0) {
          report.warnings.push(`Lançamento "${str(f.description)}" com valor zero — ignorado.`);
          continue;
        }
        const st = str(f.status);
        const paid = st === 'pago';
        const paidAt = paid ? ts(f.paidAt) ?? ts(f.dueDate) ?? new Date() : null;
        const clientId = f.clientId && clientIds.has(mapId('clients', f.clientId)) ? mapId('clients', f.clientId) : null;
        const quoteId = f.quoteId ? quoteIds.get(String(f.quoteId)) ?? null : null;
        const jobId = f.workOrderId ? jobIds.get(String(f.workOrderId)) ?? null : null;
        const exists = async (t: typeof s.quotes | typeof s.jobs, v: string | null) => (v ? (await tx.select({ id: t.id }).from(t).where(sql`${t.id} = ${v}`)).length > 0 : false);
        const inserted = await ins(tx, 'financeEntries', s.financeEntries, {
          id, kind, category: financeCategory(kind, str(f.category)), description: str(f.description, 300) || 'Lançamento importado', amount, paidAmount: paid ? amount : 0,
          dueDate: isoDate(f.dueDate) ?? isoDate(f.paidAt) ?? todayISO(), paidAt, status: paid ? 'paid' : st === 'cancelado' ? 'cancelled' : 'pending',
          clientId, quoteId: (await exists(s.quotes, quoteId)) ? quoteId : null, jobId: (await exists(s.jobs, jobId)) ? jobId : null, method: '', notes: 'Importado do sistema anterior.', dedupeKey: `legacy:${id}`,
        });
        if (inserted && paid) await tx.insert(s.payments).values({ id: mapId('payments', id), entryId: id, amount, paidAt: paidAt!, method: '', notes: 'Pagamento registrado no sistema anterior.', createdBy: '' }).onConflictDoNothing();
      }

      // ----- atividades -----
      for (const a of data('activities')) {
        await ins(tx, 'activities', s.activities, { id: mapId('activities', a.__id), userId: null, userName: 'Sistema anterior', action: `legacy.${str(a.type, 20) || 'info'}`, entity: 'legacy', entityId: null, summary: str(a.message, 1000) || '—', createdAt: ts(a.date) ?? new Date() });
      }

      // ----- numeração sequencial continua após os números importados -----
      const [mq] = await tx.select({ m: sql<number>`coalesce(max(${s.quotes.number}),0)::int` }).from(s.quotes);
      const [mj] = await tx.select({ m: sql<number>`coalesce(max(${s.jobs.number}),0)::int` }).from(s.jobs);
      for (const [name, value] of [['quote', mq.m], ['job', mj.m]] as const) {
        await tx.insert(s.counters).values({ name, value }).onConflictDoUpdate({ target: s.counters.name, set: { value: sql`greatest(${s.counters.value}, ${value})` } });
      }

      await tx.insert(s.activities).values({ id: newId(), userId: null, userName: 'Sistema', action: 'system.import', entity: 'system', entityId: null, summary: `Dados importados do sistema anterior (${Object.entries(report.inserted).map(([k, v]) => `${k}: ${v}`).join(', ')})` });
      if (opts.dryRun) throw new DryRun();
    });
  } catch (e) {
    if (!(e instanceof DryRun)) throw e;
  }
  if (opts.legacyUsers?.length)
    report.warnings.push(`Usuários do sistema anterior NÃO são migrados (senhas usam outro formato): ${opts.legacyUsers.map((u) => `${u.username}${u.email ? ` <${u.email}>` : ''}`).join(', ')}. Cadastre-os em Configurações → Usuários.`);
  return report;
}

/** Lê o banco antigo em transação SOMENTE LEITURA e importa (ou simula). */
export async function runLegacyImport(url: string, write: boolean) {
  const src = new pg.Client({ connectionString: url });
  await src.connect();
  // garante somente leitura na origem
  await src.query('BEGIN READ ONLY');
  const { rows } = await src.query<LegacyRecord>('select resource, record_id, data, is_deleted, updated_at from app_sync_records order by updated_at');
  const users = await src
    .query<{ username: string; email: string | null }>('select username, email from app_users order by id')
    .then((r) => r.rows)
    .catch(() => []);
  const legacyTables = await src.query<{ table_name: string }>("select table_name from information_schema.tables where table_schema='public' and table_name in ('quotes','clients','products','work_orders','finance_entries','stock_movements')");
  const legacyCounts: Record<string, number> = {};
  for (const t of legacyTables.rows) legacyCounts[t.table_name] = Number((await src.query(`select count(*)::int as n from "${t.table_name}"`)).rows[0].n);
  await src.query('ROLLBACK');
  await src.end();
  
    return { ...(await importLegacy(rows, { dryRun: !write, legacyUsers: users })), tabelasAntigasRelacionais: legacyCounts };
}
