/**
 * Esquema relacional (PostgreSQL) do J&N Orçamentos.
 * Nomes de coluna em snake_case são gerados automaticamente (casing: 'snake_case').
 *
 * Toda tabela sincronizável possui:
 *  - id (texto, UUID gerado no cliente — estável e único);
 *  - version (controle otimista de concorrência);
 *  - seq (sequência global de alteração usada pela sincronização incremental);
 *  - deleted_at (exclusão lógica — registros nunca são apagados fisicamente pela sincronização).
 */
import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  pgSequence,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

/** Sequência global de alterações para sincronização incremental. */
export const syncSeq = pgSequence('sync_seq', { startWith: 1, increment: 1 });

const ts = (name?: string) => (name ? timestamp(name, { withTimezone: true, mode: 'date' }) : timestamp({ withTimezone: true, mode: 'date' }));
const money = () => bigint({ mode: 'number' });

const syncCols = () => ({
  id: text().primaryKey(),
  createdAt: ts().notNull().defaultNow(),
  updatedAt: ts().notNull().defaultNow(),
  deletedAt: ts(),
  version: integer().notNull().default(1),
  seq: bigint({ mode: 'number' }).notNull().default(sql`nextval('sync_seq')`),
});

// ---------------- Usuários e acesso ----------------
export const users = pgTable(
  'users',
  {
    id: text().primaryKey(),
    name: text().notNull(),
    email: text().notNull(),
    passwordHash: text().notNull(),
    role: text({ enum: ['admin', 'employee'] }).notNull().default('employee'),
    permissions: jsonb().notNull().default({}),
    active: boolean().notNull().default(true),
    mustChangePassword: boolean().notNull().default(false),
    lastLoginAt: ts(),
    createdAt: ts().notNull().defaultNow(),
    updatedAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('users_email_uq').on(sql`lower(${t.email})`)],
);

export const sessions = pgTable(
  'sessions',
  {
    id: text().primaryKey(),
    userId: text().notNull().references(() => users.id),
    tokenHash: text().notNull(),
    userAgent: text().notNull().default(''),
    ip: text().notNull().default(''),
    createdAt: ts().notNull().defaultNow(),
    lastSeenAt: ts().notNull().defaultNow(),
    expiresAt: ts().notNull(),
    revokedAt: ts(),
  },
  (t) => [uniqueIndex('sessions_token_uq').on(t.tokenHash), index('sessions_user_idx').on(t.userId)],
);

export const passwordResets = pgTable(
  'password_resets',
  {
    id: text().primaryKey(),
    userId: text().notNull().references(() => users.id),
    tokenHash: text().notNull(),
    expiresAt: ts().notNull(),
    usedAt: ts(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [uniqueIndex('password_resets_token_uq').on(t.tokenHash)],
);

// ---------------- Clientes ----------------
export const clients = pgTable(
  'clients',
  {
    ...syncCols(),
    name: text().notNull(),
    document: text().notNull().default(''),
    phone: text().notNull().default(''),
    whatsapp: text().notNull().default(''),
    email: text().notNull().default(''),
    cep: text().notNull().default(''),
    address: text().notNull().default(''),
    number: text().notNull().default(''),
    district: text().notNull().default(''),
    city: text().notNull().default(''),
    state: text().notNull().default(''),
    complement: text().notNull().default(''),
    notes: text().notNull().default(''),
    status: text({ enum: ['active', 'inactive', 'lead'] }).notNull().default('active'),
  },
  (t) => [
    index('clients_seq_idx').on(t.seq),
    index('clients_name_idx').on(sql`lower(${t.name})`),
    index('clients_city_idx').on(t.city),
    index('clients_document_idx').on(t.document),
  ],
);

export const clientNotes = pgTable(
  'client_notes',
  {
    ...syncCols(),
    clientId: text().notNull().references(() => clients.id),
    kind: text().notNull().default('note'),
    text: text().notNull(),
    createdBy: text().notNull().default(''),
    createdByName: text().notNull().default(''),
  },
  (t) => [index('client_notes_seq_idx').on(t.seq), index('client_notes_client_idx').on(t.clientId)],
);

// ---------------- Produtos e estoque ----------------
export const products = pgTable(
  'products',
  {
    ...syncCols(),
    code: text().notNull().default(''),
    name: text().notNull(),
    category: text().notNull(),
    unit: text().notNull(),
    unitCost: money().notNull().default(0),
    description: text().notNull().default(''),
    dimensions: text().notNull().default(''),
    plateArea: doublePrecision(),
    quantity: doublePrecision().notNull().default(0),
    minStock: doublePrecision().notNull().default(0),
    supplier: text().notNull().default(''),
    indivisible: boolean().notNull().default(true),
    active: boolean().notNull().default(true),
  },
  (t) => [index('products_seq_idx').on(t.seq), index('products_category_idx').on(t.category)],
);

export const stockMovements = pgTable(
  'stock_movements',
  {
    ...syncCols(),
    productId: text().notNull().references(() => products.id),
    type: text({ enum: ['in', 'out', 'adjust'] }).notNull(),
    delta: doublePrecision().notNull(),
    balanceAfter: doublePrecision().notNull(),
    unitCost: money().notNull().default(0),
    reason: text().notNull().default(''),
    jobId: text(),
    createdBy: text().notNull().default(''),
    createdByName: text().notNull().default(''),
  },
  (t) => [
    index('stock_movements_seq_idx').on(t.seq),
    index('stock_movements_product_idx').on(t.productId, t.createdAt),
    index('stock_movements_job_idx').on(t.jobId),
  ],
);

// ---------------- Serviços ----------------
export const services = pgTable(
  'services',
  {
    ...syncCols(),
    name: text().notNull(),
    description: text().notNull().default(''),
    measurementType: text({ enum: ['m2', 'ml', 'unit'] }).notNull(),
    pricingMode: text({ enum: ['cost_plus', 'fixed'] }).notNull().default('cost_plus'),
    laborPrice: money().notNull().default(0),
    chargeUnit: text().notNull(),
    linearBasis: text({ enum: ['perimeter', 'width', 'length'] }).notNull().default('perimeter'),
    /** adicionais/decorativos (ServiceAddon[]) */
    addons: jsonb().notNull().default([]),
    /** serviço de acartonado: calcula placas e entra no controle de material */
    drywall: boolean().notNull().default(false),
    active: boolean().notNull().default(true),
  },
  (t) => [index('services_seq_idx').on(t.seq)],
);

export const serviceMaterials = pgTable(
  'service_materials',
  {
    id: text().primaryKey(),
    serviceId: text().notNull().references(() => services.id),
    productId: text().notNull().references(() => products.id),
    consumption: doublePrecision().notNull(),
    position: integer().notNull().default(0),
  },
  (t) => [index('service_materials_service_idx').on(t.serviceId), index('service_materials_product_idx').on(t.productId)],
);

// ---------------- Orçamentos ----------------
export const quotes = pgTable(
  'quotes',
  {
    ...syncCols(),
    number: integer(),
    clientId: text().notNull().references(() => clients.id),
    title: text().notNull().default(''),
    status: text({ enum: ['draft', 'pending', 'approved', 'refused', 'expired'] }).notNull().default('draft'),
    issueDate: date({ mode: 'string' }).notNull(),
    validUntil: date({ mode: 'string' }).notNull(),
    marginPct: doublePrecision().notNull().default(0),
    marginOnLabor: boolean().notNull().default(true),
    discountType: text({ enum: ['none', 'pct', 'value'] }).notNull().default('none'),
    discountValue: doublePrecision().notNull().default(0),
    installments: jsonb().notNull().default([]),
    paymentTerms: text().notNull().default(''),
    notes: text().notNull().default(''),
    calc: jsonb(),
    subtotal: money().notNull().default(0),
    discount: money().notNull().default(0),
    total: money().notNull().default(0),
    totalCost: money().notNull().default(0),
    estimatedProfit: money().notNull().default(0),
    portalToken: text(),
    decidedAt: ts(),
    decidedBy: text(),
    clientComment: text().notNull().default(''),
    createdBy: text().notNull().default(''),
  },
  (t) => [
    index('quotes_seq_idx').on(t.seq),
    uniqueIndex('quotes_number_uq').on(t.number),
    uniqueIndex('quotes_portal_token_uq').on(t.portalToken),
    index('quotes_client_idx').on(t.clientId),
    index('quotes_status_idx').on(t.status, t.issueDate),
  ],
);

/** Itens (ambientes) do orçamento — entradas e resultados calculados. */
export const quoteItems = pgTable(
  'quote_items',
  {
    id: text().primaryKey(),
    quoteId: text().notNull().references(() => quotes.id),
    position: integer().notNull(),
    name: text().notNull(),
    serviceId: text().notNull(),
    serviceName: text().notNull(),
    measurementType: text().notNull(),
    width: doublePrecision().notNull(),
    length: doublePrecision().notNull(),
    height: doublePrecision().notNull().default(0),
    surface: text().notNull().default('floor'),
    wastePct: doublePrecision().notNull(),
    laborPriceOverride: money(),
    linearOverride: doublePrecision(),
    quantity: doublePrecision(),
    deductions: jsonb().notNull().default([]),
    addons: jsonb().notNull().default([]),
    grossArea: doublePrecision().notNull().default(0),
    netArea: doublePrecision().notNull().default(0),
    linear: doublePrecision().notNull().default(0),
    measure: doublePrecision().notNull().default(0),
    laborCost: money().notNull().default(0),
    materialCost: money().notNull().default(0),
    price: money().notNull().default(0),
  },
  (t) => [index('quote_items_quote_idx').on(t.quoteId)],
);

/** Materiais calculados (agregados) de cada orçamento. */
export const quoteMaterials = pgTable(
  'quote_materials',
  {
    id: text().primaryKey(),
    quoteId: text().notNull().references(() => quotes.id),
    productId: text().notNull(),
    name: text().notNull(),
    unit: text().notNull(),
    qty: doublePrecision().notNull(),
    unitCost: money().notNull(),
    cost: money().notNull(),
  },
  (t) => [index('quote_materials_quote_idx').on(t.quoteId), index('quote_materials_product_idx').on(t.productId)],
);

export const portalEvents = pgTable(
  'portal_events',
  {
    ...syncCols(),
    quoteId: text().notNull().references(() => quotes.id),
    type: text({ enum: ['viewed', 'approved', 'refused', 'comment'] }).notNull(),
    message: text().notNull().default(''),
    ip: text().notNull().default(''),
    userAgent: text().notNull().default(''),
  },
  (t) => [index('portal_events_seq_idx').on(t.seq), index('portal_events_quote_idx').on(t.quoteId)],
);

// ---------------- Obras / ordens de serviço ----------------
export const jobs = pgTable(
  'jobs',
  {
    ...syncCols(),
    number: integer(),
    quoteId: text().references(() => quotes.id),
    clientId: text().notNull().references(() => clients.id),
    address: text().notNull().default(''),
    servicesSummary: text().notNull().default(''),
    team: text().notNull().default(''),
    startDate: date({ mode: 'string' }),
    expectedEnd: date({ mode: 'string' }),
    completedAt: ts(),
    status: text({ enum: ['waiting', 'scheduled', 'in_progress', 'paused', 'completed', 'cancelled'] }).notNull().default('waiting'),
    contractedValue: money().notNull().default(0),
    notes: text().notNull().default(''),
    materials: jsonb().notNull().default([]),
  },
  (t) => [
    index('jobs_seq_idx').on(t.seq),
    uniqueIndex('jobs_number_uq').on(t.number),
    // no máximo uma OS ativa por orçamento
    uniqueIndex('jobs_quote_uq').on(t.quoteId).where(sql`${t.deletedAt} is null and ${t.status} <> 'cancelled'`),
    index('jobs_client_idx').on(t.clientId),
    index('jobs_status_idx').on(t.status),
  ],
);

export const jobEvents = pgTable(
  'job_events',
  {
    ...syncCols(),
    jobId: text().notNull().references(() => jobs.id),
    type: text().notNull(),
    note: text().notNull().default(''),
    statusTo: text(),
    createdBy: text().notNull().default(''),
    createdByName: text().notNull().default(''),
  },
  (t) => [index('job_events_seq_idx').on(t.seq), index('job_events_job_idx').on(t.jobId)],
);

// ---------------- Financeiro ----------------
export const financeEntries = pgTable(
  'finance_entries',
  {
    ...syncCols(),
    kind: text({ enum: ['in', 'out'] }).notNull(),
    category: text().notNull(),
    description: text().notNull(),
    amount: money().notNull(),
    paidAmount: money().notNull().default(0),
    dueDate: date({ mode: 'string' }).notNull(),
    paidAt: ts(),
    status: text({ enum: ['pending', 'paid', 'cancelled'] }).notNull().default('pending'),
    clientId: text().references(() => clients.id),
    quoteId: text().references(() => quotes.id),
    jobId: text().references(() => jobs.id),
    method: text().notNull().default(''),
    notes: text().notNull().default(''),
    dedupeKey: text(),
  },
  (t) => [
    index('finance_entries_seq_idx').on(t.seq),
    uniqueIndex('finance_entries_dedupe_uq').on(t.dedupeKey),
    index('finance_entries_due_idx').on(t.status, t.dueDate),
    index('finance_entries_quote_idx').on(t.quoteId),
    index('finance_entries_client_idx').on(t.clientId),
  ],
);

export const payments = pgTable(
  'payments',
  {
    ...syncCols(),
    entryId: text().notNull().references(() => financeEntries.id),
    amount: money().notNull(),
    paidAt: ts().notNull(),
    method: text().notNull().default(''),
    notes: text().notNull().default(''),
    createdBy: text().notNull().default(''),
  },
  (t) => [index('payments_seq_idx').on(t.seq), index('payments_entry_idx').on(t.entryId)],
);

// ---------------- Configurações, atividades e auditoria ----------------
export const settings = pgTable('settings', { ...syncCols(), value: jsonb().notNull() }, (t) => [index('settings_seq_idx').on(t.seq)]);

export const activities = pgTable(
  'activities',
  {
    ...syncCols(),
    userId: text(),
    userName: text().notNull().default(''),
    action: text().notNull(),
    entity: text().notNull(),
    entityId: text(),
    summary: text().notNull(),
  },
  (t) => [index('activities_seq_idx').on(t.seq), index('activities_created_idx').on(t.createdAt)],
);

/** Histórico de alterações (antes/depois) de qualquer registro. */
export const changeHistory = pgTable(
  'change_history',
  {
    id: text().primaryKey(),
    entity: text().notNull(),
    entityId: text().notNull(),
    userId: text(),
    userName: text().notNull().default(''),
    action: text().notNull(),
    before: jsonb(),
    after: jsonb(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index('change_history_entity_idx').on(t.entity, t.entityId, t.createdAt)],
);

/** Operações de sincronização já processadas (idempotência). */
export const syncOps = pgTable(
  'sync_ops',
  {
    opId: text().primaryKey(),
    userId: text().notNull(),
    kind: text().notNull(),
    ok: boolean().notNull(),
    result: jsonb().notNull(),
    receivedAt: ts().notNull().defaultNow(),
  },
  (t) => [index('sync_ops_user_idx').on(t.userId, t.receivedAt)],
);

export const syncConflicts = pgTable('sync_conflicts', {
  id: text().primaryKey(),
  opId: text().notNull(),
  userId: text().notNull(),
  entity: text().notNull(),
  entityId: text().notNull(),
  baseVersion: integer(),
  serverVersion: integer().notNull(),
  clientData: jsonb().notNull(),
  serverData: jsonb().notNull(),
  resolution: text().notNull(),
  createdAt: ts().notNull().defaultNow(),
});

export const errorLogs = pgTable(
  'error_logs',
  {
    id: text().primaryKey(),
    source: text().notNull(),
    message: text().notNull(),
    detail: jsonb(),
    userId: text(),
    createdAt: ts().notNull().defaultNow(),
  },
  (t) => [index('error_logs_created_idx').on(t.createdAt)],
);

/** Contadores para numeração sequencial (orçamentos, ordens de serviço). */
export const counters = pgTable('counters', { name: text().primaryKey(), value: integer().notNull().default(0) });
