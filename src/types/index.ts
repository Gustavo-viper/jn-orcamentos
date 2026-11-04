// ============================================================
// TIPOS CENTRAIS DO SISTEMA — J & N Decorações em Gesso
// Estes contratos serão mantidos quando o backend/banco for integrado.
// ============================================================

export type ID = string;

export type ClientStatus = "ativo" | "inativo" | "prospecto";

export interface Client {
  id: ID;
  name: string;
  document: string; // CPF/CNPJ
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  number: string;
  district: string;
  city: string;
  state: string;
  zip: string;
  notes?: string;
  status: ClientStatus;
  createdAt: string;
}

export type ProductCategory =
  | "Placas"
  | "Fixação"
  | "Massa"
  | "Perfis"
  | "Acabamento"
  | "Ferramentas"
  | "Outros";

export interface Product {
  id: ID;
  name: string;
  category: ProductCategory;
  unit: string; // un, kg, m, m², saco
  cost: number;
  description?: string;
  // Dimensões (para placas)
  width?: number;
  length?: number;
  areaPerUnit?: number;
}

export type MeasureType = "area" | "linear";

export interface ServiceMaterial {
  productId: ID;
  consumption: number; // por m² ou por m
  // Para placas: calculado por área da placa; para outros: consumo × medida
  mode: "per_measure" | "per_plate";
}

export interface Service {
  id: ID;
  name: string;
  description: string;
  measureType: MeasureType;
  laborPrice: number; // R$/m² ou R$/m
  unitLabel: string; // m² ou m
  fixedRate?: boolean; // preço unitário já é o valor final de venda
  materials: ServiceMaterial[];
  active: boolean;
}

export interface QuoteMaterial {
  productId: ID;
  productName: string;
  unit: string;
  consumption: number;
  consumptionLabel: string;
  quantity: number;
  unitCost: number;
  total: number;
}

export type QuoteStatus =
  | "rascunho"
  | "pendente"
  | "aprovado"
  | "recusado"
  | "expirado";

export interface QuoteItem {
  id: ID;
  roomName?: string;
  serviceId: ID;
  serviceName: string;
  measureType: MeasureType;
  unitLabel?: string;
  fixedRate?: boolean;
  width: number;
  length: number;
  height: number;
  area: number;
  negativeArea?: number;
  perimeter: number;
  negativePerimeter?: number;
  linear: number;
  measureValue: number; // área ou metro linear usado para cálculo
  wastePercent: number;
  negativeMeasures?: { id: string; label: string; width: number; length: number }[];
  plateInfo?: {
    plateArea: number;
    rawQuantity: number;
    quantity: number;
  };
  materials: QuoteMaterial[];
  materialsCost: number;
  laborUnitPrice: number;
  laborTotal: number;
  quotedUnitPrice?: number; // valor unitário impresso no documento de origem
}

export interface Quote {
  id: ID;
  number: string;
  token: string;
  clientId: ID;
  clientName: string;
  status: QuoteStatus;
  items: QuoteItem[];
  materialsCost: number;
  laborCost: number;
  totalCost: number;
  marginPercent: number;
  profit: number;
  priceBeforeDiscount: number;
  discountType: "percent" | "value";
  discountValue: number;
  discountAmount: number;
  total: number;
  downPaymentPercent: number;
  paymentTerms: string;
  notes: string;
  validUntil: string;
  createdAt: string;
  approvedAt?: string;
}

export type WorkOrderStatus =
  | "aguardando"
  | "agendada"
  | "em_andamento"
  | "pausada"
  | "concluida"
  | "cancelada";

export interface WorkOrderTimelineEvent {
  id: ID;
  date: string;
  title: string;
  description?: string;
  status: WorkOrderStatus;
}

export interface WorkOrder {
  id: ID;
  number: string;
  quoteId?: ID;
  quoteNumber?: string;
  clientId: ID;
  clientName: string;
  address: string;
  serviceName: string;
  team: string;
  startDate: string;
  expectedEnd: string;
  status: WorkOrderStatus;
  materials: { productName: string; quantity: number; unit: string }[];
  notes?: string;
  timeline: WorkOrderTimelineEvent[];
  total: number;
  createdAt: string;
}

export type FinanceType = "entrada" | "saida";
export type FinanceStatus = "pendente" | "pago" | "atrasado" | "cancelado";
export type FinanceCategory =
  | "servico"
  | "material"
  | "combustivel"
  | "ferramentas"
  | "fornecedor"
  | "funcionario"
  | "outros";

export interface FinanceEntry {
  id: ID;
  description: string;
  clientId?: ID;
  clientName?: string;
  type: FinanceType;
  category: FinanceCategory;
  amount: number;
  dueDate: string;
  paidAt?: string;
  status: FinanceStatus;
  quoteId?: ID;
  workOrderId?: ID;
}

export interface Payment {
  id: ID;
  quoteId: ID;
  label: string;
  percent: number;
  amount: number;
  status: FinanceStatus;
}

export interface CompanySettings {
  name: string;
  logoText: string;
  document: string;
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  quoteValidityDays: number;
  defaultMargin: number;
  downPaymentPercent: number;
  paymentTerms: string;
  theme: "light" | "dark";
}

export interface Activity {
  id: ID;
  message: string;
  date: string;
  type: "quote" | "order" | "finance" | "client";
}

export interface DashboardSnapshot {
  salesByMonth: { month: string; value: number }[];
}
