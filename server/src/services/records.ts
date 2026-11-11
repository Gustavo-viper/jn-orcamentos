import { asc, eq, inArray } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { can, type Module, type SessionUser, type SyncTable, type EnvironmentInput } from '@jn/shared';
import * as s from '../db/schema.js';
import type { Executor } from '../db/client.js';

/** Tabela física correspondente a cada tabela sincronizada. */
export const SYNC_PG: Record<SyncTable, { table: PgTable & { id: never } | any; sqlName: string }> = {
  clients: { table: s.clients, sqlName: 'clients' },
  clientNotes: { table: s.clientNotes, sqlName: 'client_notes' },
  products: { table: s.products, sqlName: 'products' },
  stockMovements: { table: s.stockMovements, sqlName: 'stock_movements' },
  services: { table: s.services, sqlName: 'services' },
  quotes: { table: s.quotes, sqlName: 'quotes' },
  jobs: { table: s.jobs, sqlName: 'jobs' },
  jobEvents: { table: s.jobEvents, sqlName: 'job_events' },
  financeEntries: { table: s.financeEntries, sqlName: 'finance_entries' },
  payments: { table: s.payments, sqlName: 'payments' },
  settings: { table: s.settings, sqlName: 'settings' },
  activities: { table: s.activities, sqlName: 'activities' },
  portalEvents: { table: s.portalEvents, sqlName: 'portal_events' },
};

/**
 * Quem pode LER cada tabela. Algumas tabelas são necessárias a mais de um módulo
 * (ex.: o orçamentista precisa dos serviços e produtos para calcular).
 */
const READ_MODULES: Record<SyncTable, Module[] | 'all'> = {
  clients: ['clients', 'quotes', 'jobs', 'finance'],
  clientNotes: ['clients'],
  products: ['products', 'quotes', 'jobs', 'services'],
  stockMovements: ['products'],
  services: ['services', 'quotes'],
  quotes: ['quotes', 'jobs', 'finance', 'clients'],
  jobs: ['jobs', 'clients', 'finance'],
  jobEvents: ['jobs'],
  financeEntries: ['finance'],
  payments: ['finance'],
  settings: 'all',
  activities: ['dashboard'],
  portalEvents: ['quotes'],
};

export function canReadTable(user: SessionUser, t: SyncTable): boolean {
  const mods = READ_MODULES[t];
  if (mods === 'all') return user.active;
  return mods.some((m) => can(user, m, 'view'));
}

export const readableTables = (user: SessionUser) => (Object.keys(SYNC_PG) as SyncTable[]).filter((t) => canReadTable(user, t));

function plain<T>(v: T): Record<string, unknown> {
  return JSON.parse(JSON.stringify(v));
}

/** Carrega registros completos (com filhos) no formato usado pelo cliente. */
export async function loadRecords(tx: Executor, t: SyncTable, ids: string[]): Promise<Record<string, unknown>[]> {
  if (!ids.length) return [];
  const { table } = SYNC_PG[t];
  const rows: Record<string, unknown>[] = await tx.select().from(table).where(inArray(table.id, ids));
  if (t === 'services') {
    const mats = await tx
      .select()
      .from(s.serviceMaterials)
      .where(inArray(s.serviceMaterials.serviceId, ids))
      .orderBy(asc(s.serviceMaterials.position));
    return rows.map((r) =>
      plain({ ...r, materials: mats.filter((m) => m.serviceId === r.id).map((m) => ({ productId: m.productId, consumption: m.consumption })) }),
    );
  }
  if (t === 'quotes') {
    const items = await tx.select().from(s.quoteItems).where(inArray(s.quoteItems.quoteId, ids)).orderBy(asc(s.quoteItems.position));
    return rows.map((r) =>
      plain({
        ...r,
        environments: items
          .filter((i) => i.quoteId === r.id)
          .map(
            (i): EnvironmentInput => ({
              id: i.id,
              name: i.name,
              serviceId: i.serviceId,
              width: i.width,
              length: i.length,
              height: i.height,
              surface: i.surface as 'floor' | 'walls',
              wastePct: i.wastePct,
              laborPriceOverride: i.laborPriceOverride,
              linearOverride: i.linearOverride,
              quantity: i.quantity,
              deductions: i.deductions as EnvironmentInput['deductions'],
              addons: (i.addons ?? []) as EnvironmentInput['addons'],
            }),
          ),
      }),
    );
  }
  return rows.map(plain);
}

export async function loadOne(tx: Executor, t: SyncTable, id: string) {
  const [r] = await loadRecords(tx, t, [id]);
  return r ?? null;
}

export async function rawOne<T = Record<string, unknown>>(tx: Executor, t: SyncTable, id: string): Promise<T | null> {
  const { table } = SYNC_PG[t];
  const [r] = await tx.select().from(table).where(eq(table.id, id)).limit(1);
  return (r as T) ?? null;
}
