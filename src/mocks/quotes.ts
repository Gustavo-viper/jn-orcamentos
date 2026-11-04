import type { Quote, QuoteItem, QuoteStatus } from "@/types";
import { buildQuoteItem, calcTotals } from "@/utils/calc";
import { addDays, daysAgo, pad } from "@/utils/format";
import { mockClients } from "./clients";
import { mockProducts } from "./products";
import { mockServices } from "./services";

interface Seed {
  clientId: string;
  serviceId: string;
  w: number;
  l: number;
  h?: number;
  status: QuoteStatus;
  margin?: number;
  discount?: number;
  daysAgoCreated: number;
  waste?: number;
}

const seeds: Seed[] = [
  { clientId: "c1", serviceId: "s1", w: 3, l: 5, h: 2.8, status: "pendente", margin: 30, discount: 50, daysAgoCreated: 2 },
  { clientId: "c2", serviceId: "s3", w: 4, l: 6, status: "aprovado", margin: 30, daysAgoCreated: 5 },
  { clientId: "c3", serviceId: "s6", w: 2.8, l: 12, status: "aprovado", margin: 25, daysAgoCreated: 8 },
  { clientId: "c4", serviceId: "s5", w: 3.5, l: 4.5, status: "pendente", margin: 35, daysAgoCreated: 1 },
  { clientId: "c5", serviceId: "s4", w: 4, l: 5, status: "pendente", margin: 30, daysAgoCreated: 3 },
  { clientId: "c6", serviceId: "s7", w: 5, l: 8, status: "aprovado", margin: 30, discount: 150, daysAgoCreated: 12 },
  { clientId: "c7", serviceId: "s1", w: 2.5, l: 4, status: "recusado", margin: 30, daysAgoCreated: 15 },
  { clientId: "c9", serviceId: "s3", w: 6, l: 10, status: "aprovado", margin: 28, daysAgoCreated: 18 },
  { clientId: "c1", serviceId: "s9", w: 2, l: 3, status: "expirado", margin: 40, daysAgoCreated: 45 },
  { clientId: "c2", serviceId: "s8", w: 0.6, l: 1.2, status: "aprovado", margin: 35, daysAgoCreated: 20 },
  { clientId: "c3", serviceId: "s2", w: 3, l: 20, status: "aprovado", margin: 25, daysAgoCreated: 25 },
  { clientId: "c4", serviceId: "s3", w: 3.5, l: 5, status: "pendente", margin: 30, daysAgoCreated: 4 },
  { clientId: "c6", serviceId: "s4", w: 5, l: 7, status: "aprovado", margin: 30, daysAgoCreated: 30 },
  { clientId: "c7", serviceId: "s7", w: 4, l: 4, status: "recusado", margin: 30, daysAgoCreated: 35 },
  { clientId: "c8", serviceId: "s1", w: 3, l: 3, status: "expirado", margin: 30, daysAgoCreated: 60 },
  { clientId: "c9", serviceId: "s6", w: 2.8, l: 8, status: "pendente", margin: 25, daysAgoCreated: 6 },
  { clientId: "c10", serviceId: "s3", w: 4, l: 4.5, status: "pendente", margin: 30, daysAgoCreated: 1 },
  { clientId: "c1", serviceId: "s5", w: 4, l: 6, status: "aprovado", margin: 35, daysAgoCreated: 40 },
  { clientId: "c5", serviceId: "s1", w: 3, l: 6, status: "rascunho", margin: 30, daysAgoCreated: 0 },
  { clientId: "c6", serviceId: "s9", w: 2.5, l: 4, status: "aprovado", margin: 40, daysAgoCreated: 50 },
];

const tokens = ["ABC123", "DEF456", "GHI789", "JKL012", "MNO345", "PQR678", "STU901", "VWX234", "YZA567", "BCD890", "EFG123", "HIJ456", "KLM789", "NOP012", "QRS345", "TUV678", "WXY901", "ZAB234", "CDE567", "FGH890"];

const seededQuotes: Quote[] = seeds.map((s, idx) => {
  const client = mockClients.find((c) => c.id === s.clientId)!;
  const service = mockServices.find((sv) => sv.id === s.serviceId)!;
  const item = buildQuoteItem({
    service,
    products: mockProducts,
    measures: { width: s.w, length: s.l, height: s.h ?? 2.8 },
    wastePercent: s.waste ?? 5,
  });
  const margin = s.margin ?? 30;
  const discount = s.discount ?? 0;
  const totals = calcTotals({
    items: [item],
    marginPercent: margin,
    discountType: "value",
    discountValue: discount,
  });
  const createdAt = daysAgo(s.daysAgoCreated);
  return {
    id: `q${idx + 1}`,
    number: pad(idx + 1),
    token: tokens[idx],
    clientId: client.id,
    clientName: client.name,
    status: s.status,
    items: [item],
    ...totals,
    marginPercent: margin,
    discountType: "value",
    discountValue: discount,
    downPaymentPercent: 50,
    paymentTerms: "50% de entrada e 50% na conclusão do serviço.",
    notes: "Valores válidos conforme medidas informadas. Alterações no projeto podem gerar ajustes.",
    validUntil: addDays(15, new Date(createdAt)),
    createdAt,
    approvedAt: s.status === "aprovado" ? addDays(1, new Date(createdAt)) : undefined,
  };
});

// Orçamento demonstrativo fiel às 35 linhas do PDF "GESSO casa detalhado".
const gessoCasaRows = [
  ["Suíte Master", "Forro", 34.41, "m²", 85, 2924.85],
  ["Suíte Master", "Cortineiro", 12.04, "ml", 50, 602],
  ["Suíte Master", "Negativo", 17.56, "ml", 45, 790.2],
  ["Banheiro Master", "Forro", 9.6, "m²", 85, 816],
  ["Banheiro Master", "Cortineiro", 3.2, "ml", 50, 160],
  ["Banheiro Master", "Negativo", 14.86, "ml", 45, 668.7],
  ["Varanda", "Forro em Gesso acartonado", 29.7, "m²", 140, 4158],
  ["Varanda", "Cortineiro", 20.87, "ml", 85, 1773.95],
  ["Varanda", "Tabica de gesso acartonado", 44.96, "ml", 50, 2248],
  ["Suíte Heloise", "Forro", 29.7, "m²", 85, 2524.5],
  ["Suíte Heloise", "Cortineiro", 7.64, "ml", 50, 382],
  ["Suíte Heloise", "Negativo", 18.65, "ml", 45, 839.25],
  ["Banheiro Heloise", "Forro", 5.51, "m²", 85, 468.35],
  ["Banheiro Heloise", "Cortineiro", 3.2, "ml", 50, 160],
  ["Banheiro Heloise", "Negativo", 10.02, "ml", 45, 450.9],
  ["Suíte Hóspede", "Forro", 21.44, "m²", 85, 1822.4],
  ["Suíte Hóspede", "Cortineiro", 11.24, "ml", 50, 562],
  ["Suíte Hóspede", "Negativo", 13.06, "ml", 45, 587.7],
  ["Varanda 02", "Forro em Gesso acartonado", 14.88, "m²", 140, 2083.2],
  ["Varanda 02", "Cortineiro", 22.72, "ml", 50, 1136],
  ["Varanda 02", "Tabica de gesso acartonado", 20.67, "ml", 45, 930.15],
  ["Sala pé-direito duplo", "Forro", 74.78, "m²", 130, 9721.4],
  // O PDF imprime R$ 85,00 como total desta linha, embora 32,56 × R$ 85,00 não corresponda.
  ["Sala pé-direito duplo", "Cortineiro", 32.56, "ml", 85, 85],
  ["Sala pé-direito duplo", "Tabica de gesso acartonado", 19.48, "ml", 45, 876.6],
  ["Sala pé-direito duplo", "Forro", 97.79, "m²", 85, 8312.15],
  ["Varanda + lavanderia + garagem", "Negativo", 62.28, "ml", 50, 3114],
  ["Varanda + lavanderia + garagem", "Forro", 3.8, "m²", 85, 323],
  ["Lavabo + lavatório", "Negativo", 13.2, "ml", 45, 594],
  ["Lavabo + lavatório", "Forro", 12.72, "m²", 85, 1081.2],
  ["Suíte hóspede", "Negativo", 10.4, "ml", 45, 468],
  ["Suíte hóspede", "Forro", 4.18, "m²", 85, 355.3],
  ["Banheiro", "Negativo", 8.58, "ml", 45, 386.1],
  ["Banheiro", "Forro", 9.59, "m²", 85, 815.15],
  ["Hall de entrada", "Negativo", 23.04, "ml", 45, 1036.8],
  ["Placa cimentícia", "Forro", 8, "m²", 350, 2800],
] as const;

const gessoCasaItems: QuoteItem[] = gessoCasaRows.map(([roomName, serviceName, quantity, unit, unitPrice, total], index) => ({
  id: `gesso-casa-item-${index + 1}`,
  roomName,
  serviceId: ({
    "Forro|85": "pdf-forro-85",
    "Forro|130": "pdf-forro-130",
    "Forro|350": "pdf-forro-cimenticia-350",
    "Forro em Gesso acartonado|140": "pdf-forro-acartonado-140",
    "Cortineiro|50": "pdf-cortineiro-50",
    "Cortineiro|85": "pdf-cortineiro-85",
    "Negativo|45": "s11",
    "Negativo|50": "pdf-negativo-50",
    "Tabica de gesso acartonado|45": "pdf-tabica-acartonado-45",
    "Tabica de gesso acartonado|50": "pdf-tabica-acartonado-50",
  } as Record<string, string>)[`${serviceName}|${unitPrice}`] ?? "pdf-forro-85",
  serviceName,
  measureType: unit === "m²" ? "area" : "linear",
  unitLabel: unit,
  fixedRate: true,
  width: 0,
  length: 0,
  height: 0,
  area: 0,
  negativeArea: 0,
  perimeter: 0,
  negativePerimeter: 0,
  linear: quantity,
  measureValue: quantity,
  wastePercent: 0,
  negativeMeasures: [],
  materials: [],
  materialsCost: 0,
  laborUnitPrice: unitPrice,
  laborTotal: total,
  quotedUnitPrice: total !== +(quantity * unitPrice).toFixed(2) ? unitPrice : undefined,
}));

const gessoCasaTotal = +gessoCasaItems.reduce((sum, item) => sum + item.laborTotal, 0).toFixed(2);
const gessoCasaExample: Quote = {
  id: "q-demo-gesso-casa-detalhado",
  number: "EXEMPLO",
  token: "GESSOCASAEXEMPLO",
  clientId: "c-demo-liliane",
  clientName: "Liliane",
  status: "rascunho",
  items: gessoCasaItems,
  materialsCost: 0,
  laborCost: gessoCasaTotal,
  totalCost: gessoCasaTotal,
  marginPercent: 0,
  profit: 0,
  priceBeforeDiscount: gessoCasaTotal,
  discountType: "value",
  discountValue: 0,
  discountAmount: 0,
  total: gessoCasaTotal,
  downPaymentPercent: 50,
  paymentTerms: "Conforme combinado com o cliente.",
  notes: "Orçamento demonstrativo baseado no PDF GESSO casa detalhado (24/09/2026). A linha Cortineiro da sala pé-direito duplo foi copiada como impressa no PDF: 32,56 ml a R$ 85,00, total R$ 85,00.",
  validUntil: "2026-10-09T12:00:00.000Z",
  createdAt: "2026-09-24T12:00:00.000Z",
};

export const mockQuotes: Quote[] = [...seededQuotes, gessoCasaExample];
