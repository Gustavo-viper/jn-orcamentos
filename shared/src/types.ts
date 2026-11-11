/**
 * Tipos das entidades sincronizadas entre servidor (PostgreSQL) e cliente (IndexedDB).
 * Datas-hora em ISO 8601; datas simples em 'YYYY-MM-DD'; valores em centavos.
 */
import type {
  DiscountType,
  EnvironmentInput,
  Installment,
  LinearBasis,
  MeasurementType,
  PricingMode,
  QuoteTotals,
  ServiceAddon,
} from './calc.js';

export interface BaseRecord {
  id: string;
  createdAt: string;
  updatedAt: string;
  deletedAt?: string | null;
  version: number;
  /** sequência global de alteração atribuída pelo servidor */
  seq?: number;
}

export type ClientStatus = 'active' | 'inactive' | 'lead';
export const CLIENT_STATUS_LABEL: Record<ClientStatus, string> = {
  active: 'Ativo',
  inactive: 'Inativo',
  lead: 'Prospecto',
};

export interface Client extends BaseRecord {
  name: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  cep: string;
  address: string;
  number: string;
  district: string;
  city: string;
  state: string;
  complement: string;
  notes: string;
  status: ClientStatus;
}

export type ClientNoteKind = 'note' | 'call' | 'whatsapp' | 'visit' | 'email';
export const CLIENT_NOTE_LABEL: Record<ClientNoteKind, string> = {
  note: 'Observação',
  call: 'Ligação',
  whatsapp: 'WhatsApp',
  visit: 'Visita técnica',
  email: 'E-mail',
};
export interface ClientNote extends BaseRecord {
  clientId: string;
  kind: ClientNoteKind;
  text: string;
  createdBy: string;
  createdByName: string;
}

export const PRODUCT_CATEGORIES = ['placas', 'fixacao', 'massa', 'perfis', 'acabamento', 'ferramentas', 'outros'] as const;
export type ProductCategory = (typeof PRODUCT_CATEGORIES)[number];
export const PRODUCT_CATEGORY_LABEL: Record<ProductCategory, string> = {
  placas: 'Placas',
  fixacao: 'Fixação',
  massa: 'Massa',
  perfis: 'Perfis',
  acabamento: 'Acabamento',
  ferramentas: 'Ferramentas',
  outros: 'Outros',
};

export interface Product extends BaseRecord {
  code: string;
  name: string;
  category: ProductCategory;
  unit: string;
  unitCost: number;
  description: string;
  dimensions: string;
  plateArea: number | null;
  /** saldo atual — mantido pelo servidor a partir das movimentações */
  quantity: number;
  minStock: number;
  supplier: string;
  indivisible: boolean;
  active: boolean;
}

export type StockMovementType = 'in' | 'out' | 'adjust';
export const STOCK_MOVEMENT_LABEL: Record<StockMovementType, string> = { in: 'Entrada', out: 'Saída', adjust: 'Ajuste' };
export interface StockMovement extends BaseRecord {
  productId: string;
  type: StockMovementType;
  /** variação com sinal aplicada ao saldo */
  delta: number;
  balanceAfter: number;
  unitCost: number;
  reason: string;
  jobId: string | null;
  createdBy: string;
  createdByName: string;
}

export interface ServiceMaterial {
  productId: string;
  consumption: number;
}

export const MEASUREMENT_LABEL: Record<MeasurementType, string> = {
  m2: 'Metro quadrado (m²)',
  ml: 'Metro linear (m)',
  unit: 'Unidade',
};
export const LINEAR_BASIS_LABEL: Record<LinearBasis, string> = {
  perimeter: 'Perímetro do ambiente',
  width: 'Largura',
  length: 'Comprimento',
};
export const PRICING_MODE_LABEL: Record<PricingMode, string> = {
  cost_plus: 'Custo + margem',
  fixed: 'Preço fixo (sem margem)',
};

export interface Service extends BaseRecord {
  name: string;
  description: string;
  measurementType: MeasurementType;
  pricingMode: PricingMode;
  laborPrice: number;
  chargeUnit: string;
  linearBasis: LinearBasis;
  materials: ServiceMaterial[];
  /** adicionais/decorativos do serviço */
  addons?: ServiceAddon[];
  active: boolean;
}

export type QuoteStatus = 'draft' | 'pending' | 'approved' | 'refused' | 'expired';
export const QUOTE_STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Rascunho',
  pending: 'Pendente',
  approved: 'Aprovado',
  refused: 'Recusado',
  expired: 'Expirado',
};

export interface Quote extends BaseRecord {
  number: number | null;
  clientId: string;
  title: string;
  status: QuoteStatus;
  issueDate: string;
  validUntil: string;
  marginPct: number;
  marginOnLabor: boolean;
  discountType: DiscountType;
  discountValue: number;
  installments: Installment[];
  paymentTerms: string;
  notes: string;
  environments: EnvironmentInput[];
  /** resultado do cálculo — recalculado e gravado pelo servidor */
  calc: QuoteTotals | null;
  total: number;
  portalToken: string | null;
  decidedAt: string | null;
  decidedBy: string | null;
  clientComment: string;
  createdBy: string;
}

export type JobStatus = 'waiting' | 'scheduled' | 'in_progress' | 'paused' | 'completed' | 'cancelled';
export const JOB_STATUS_LABEL: Record<JobStatus, string> = {
  waiting: 'Aguardando',
  scheduled: 'Agendada',
  in_progress: 'Em andamento',
  paused: 'Pausada',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};
/** transições de status permitidas */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  waiting: ['scheduled', 'in_progress', 'cancelled'],
  scheduled: ['waiting', 'in_progress', 'cancelled'],
  in_progress: ['paused', 'completed', 'cancelled'],
  paused: ['in_progress', 'cancelled'],
  completed: [],
  cancelled: [],
};

export interface JobMaterial {
  productId: string;
  name: string;
  unit: string;
  plannedQty: number;
  consumedQty: number;
}

export interface Job extends BaseRecord {
  number: number | null;
  quoteId: string | null;
  clientId: string;
  address: string;
  servicesSummary: string;
  team: string;
  startDate: string | null;
  expectedEnd: string | null;
  completedAt: string | null;
  status: JobStatus;
  contractedValue: number;
  notes: string;
  materials: JobMaterial[];
}

export type JobEventType =
  | 'created'
  | 'scheduled'
  | 'started'
  | 'paused'
  | 'resumed'
  | 'updated'
  | 'note'
  | 'material'
  | 'completed'
  | 'cancelled';
export const JOB_EVENT_LABEL: Record<JobEventType, string> = {
  created: 'Ordem criada',
  scheduled: 'Agendamento',
  started: 'Início da obra',
  paused: 'Pausa',
  resumed: 'Retomada',
  updated: 'Alteração',
  note: 'Atualização',
  material: 'Consumo de material',
  completed: 'Conclusão',
  cancelled: 'Cancelamento',
};
export interface JobEvent extends BaseRecord {
  jobId: string;
  type: JobEventType;
  note: string;
  statusTo: JobStatus | null;
  createdBy: string;
  createdByName: string;
}

export type FinanceKind = 'in' | 'out';
export type FinanceStatus = 'pending' | 'paid' | 'cancelled';
export type FinanceDisplayStatus = FinanceStatus | 'overdue';
export const FINANCE_STATUS_LABEL: Record<FinanceDisplayStatus, string> = {
  pending: 'Pendente',
  paid: 'Pago',
  overdue: 'Atrasado',
  cancelled: 'Cancelado',
};
export const FINANCE_IN_CATEGORIES: Record<string, string> = {
  recebimento: 'Recebimento de cliente',
  sinal: 'Sinal / entrada',
  parcela: 'Parcela',
  pagamento_final: 'Pagamento final',
  outros_recebimentos: 'Outros recebimentos',
};
export const FINANCE_OUT_CATEGORIES: Record<string, string> = {
  materiais: 'Compra de materiais',
  fornecedores: 'Fornecedores',
  combustivel: 'Combustível',
  ferramentas: 'Ferramentas',
  funcionarios: 'Funcionários',
  operacionais: 'Despesas operacionais',
  outras_despesas: 'Outras despesas',
};
export const PAYMENT_METHODS: Record<string, string> = {
  pix: 'PIX',
  dinheiro: 'Dinheiro',
  cartao_credito: 'Cartão de crédito',
  cartao_debito: 'Cartão de débito',
  transferencia: 'Transferência',
  boleto: 'Boleto',
  cheque: 'Cheque',
  outro: 'Outro',
};

export interface FinanceEntry extends BaseRecord {
  kind: FinanceKind;
  category: string;
  description: string;
  amount: number;
  paidAmount: number;
  dueDate: string;
  paidAt: string | null;
  status: FinanceStatus;
  clientId: string | null;
  quoteId: string | null;
  jobId: string | null;
  method: string;
  notes: string;
  /** chave de deduplicação (ex.: parcela gerada a partir de orçamento) */
  dedupeKey: string | null;
}

export interface Payment extends BaseRecord {
  entryId: string;
  amount: number;
  paidAt: string;
  method: string;
  notes: string;
  createdBy: string;
}

export interface Activity extends BaseRecord {
  userId: string | null;
  userName: string;
  action: string;
  entity: string;
  entityId: string | null;
  summary: string;
}

export type PortalEventType = 'viewed' | 'approved' | 'refused' | 'comment';
export interface PortalEvent extends BaseRecord {
  quoteId: string;
  type: PortalEventType;
  message: string;
  ip: string;
  userAgent: string;
}

export interface CompanySettings {
  name: string;
  logo: string | null;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  cep: string;
}
export interface QuoteSettings {
  validityDays: number;
  marginPct: number;
  marginOnLabor: boolean;
  wastePct: number;
  installments: Installment[];
  paymentTerms: string;
  defaultNotes: string;
}
export interface SettingsRecord extends BaseRecord {
  /** id = 'company' | 'quote' */
  value: CompanySettings | QuoteSettings;
}

export const DEFAULT_COMPANY: CompanySettings = {
  name: 'J&N Decorações em Gesso',
  logo: null,
  document: '',
  phone: '',
  whatsapp: '',
  email: '',
  address: '',
  city: '',
  state: '',
  cep: '',
};
export const DEFAULT_QUOTE_SETTINGS: QuoteSettings = {
  validityDays: 15,
  marginPct: 30,
  marginOnLabor: true,
  wastePct: 10,
  installments: [
    { label: 'Entrada', pct: 50 },
    { label: 'Na conclusão', pct: 50 },
  ],
  paymentTerms: 'Pagamento via PIX, transferência ou dinheiro.',
  defaultNotes: 'Valores sujeitos a alteração após a validade do orçamento. Medidas conferidas no local.',
};

/** Tabelas que trafegam na sincronização. */
export const SYNC_TABLES = [
  'clients',
  'clientNotes',
  'products',
  'stockMovements',
  'services',
  'quotes',
  'jobs',
  'jobEvents',
  'financeEntries',
  'payments',
  'settings',
  'activities',
  'portalEvents',
] as const;
export type SyncTable = (typeof SYNC_TABLES)[number];

export interface SyncTableMap {
  clients: Client;
  clientNotes: ClientNote;
  products: Product;
  stockMovements: StockMovement;
  services: Service;
  quotes: Quote;
  jobs: Job;
  jobEvents: JobEvent;
  financeEntries: FinanceEntry;
  payments: Payment;
  settings: SettingsRecord;
  activities: Activity;
  portalEvents: PortalEvent;
}

/** Tabelas que aceitam upsert/delete genérico vindos do cliente. */
export const UPSERT_TABLES = ['clients', 'clientNotes', 'products', 'services', 'quotes', 'jobs', 'financeEntries', 'settings'] as const;
export type UpsertTable = (typeof UPSERT_TABLES)[number];

export type SyncOp =
  | { opId: string; type: 'upsert'; table: UpsertTable; id: string; baseVersion: number | null; data: Record<string, unknown>; at: string }
  | { opId: string; type: 'delete'; table: UpsertTable; id: string; at: string }
  | { opId: string; type: 'command'; name: CommandName; payload: Record<string, unknown>; at: string };

export const COMMAND_NAMES = [
  'stock.move',
  'quote.setStatus',
  'quote.createReceivables',
  'quote.portalLink',
  'job.fromQuote',
  'job.setStatus',
  'job.addNote',
  'job.consume',
  'job.complete',
  'finance.pay',
] as const;
export type CommandName = (typeof COMMAND_NAMES)[number];

export interface SyncOpResult {
  opId: string;
  ok: boolean;
  /** já processada anteriormente (idempotência) */
  duplicate?: boolean;
  conflict?: boolean;
  error?: string;
  /** registros afetados no estado atual do servidor */
  records?: { table: SyncTable; record: Record<string, unknown> }[];
}

export interface PullResponse {
  changes: { table: SyncTable; record: Record<string, unknown> }[];
  cursor: number;
  hasMore: boolean;
  serverTime: string;
}

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  role: 'admin' | 'employee';
  permissions: import('./permissions.js').PermissionMap;
  active: boolean;
  mustChangePassword?: boolean;
}

/** Situação do financeiro considerando vencimento. */
export function financeDisplayStatus(e: Pick<FinanceEntry, 'status' | 'dueDate'>, today = todayISO()): FinanceDisplayStatus {
  if (e.status === 'pending' && e.dueDate && e.dueDate < today) return 'overdue';
  return e.status;
}

/** Situação do orçamento considerando validade. */
export function quoteDisplayStatus(q: Pick<Quote, 'status' | 'validUntil'>, today = todayISO()): QuoteStatus {
  if (q.status === 'pending' && q.validUntil && q.validUntil < today) return 'expired';
  return q.status;
}

export function todayISO(d = new Date()): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + days);
  return todayISO(dt);
}

export function formatQuoteNumber(n: number | null | undefined): string {
  return n ? `ORC-${String(n).padStart(5, '0')}` : 'Provisório';
}
export function formatJobNumber(n: number | null | undefined): string {
  return n ? `OS-${String(n).padStart(5, '0')}` : 'Provisória';
}
