import type { Service } from "@/types";

export const mockServices: Service[] = [
  {
    id: "s1", name: "Parede de gesso", description: "Parede em placas pré-moldadas de gesso com acabamento liso.",
    measureType: "area", laborPrice: 45, unitLabel: "m²", active: true,
    materials: [
      { productId: "p1", consumption: 1, mode: "per_plate" },
      { productId: "p2", consumption: 0.08, mode: "per_measure" },
      { productId: "p3", consumption: 0.5, mode: "per_measure" },
      { productId: "p4", consumption: 1, mode: "per_measure" },
      { productId: "p5", consumption: 1, mode: "per_measure" },
    ],
  },
  {
    id: "s2", name: "Parede pré-moldada", description: "Parede com placas pré-moldadas e reforço estrutural.",
    measureType: "area", laborPrice: 48, unitLabel: "m²", active: true,
    materials: [
      { productId: "p1", consumption: 1, mode: "per_plate" },
      { productId: "p2", consumption: 0.1, mode: "per_measure" },
      { productId: "p4", consumption: 1.2, mode: "per_measure" },
      { productId: "p13", consumption: 0.3, mode: "per_measure" },
    ],
  },
  {
    id: "s3", name: "Forro de gesso", description: "Forro em placas de gesso com arame e pitão.",
    measureType: "area", laborPrice: 55, unitLabel: "m²", active: true,
    materials: [
      { productId: "p1", consumption: 1, mode: "per_plate" },
      { productId: "p2", consumption: 0.12, mode: "per_measure" },
      { productId: "p3", consumption: 1, mode: "per_measure" },
      { productId: "p4", consumption: 1.5, mode: "per_measure" },
    ],
  },
  {
    id: "s4", name: "Sanca", description: "Sanca aberta ou fechada para iluminação indireta.",
    measureType: "linear", laborPrice: 65, unitLabel: "m", active: true,
    materials: [
      { productId: "p12", consumption: 1.05, mode: "per_measure" },
      { productId: "p4", consumption: 0.8, mode: "per_measure" },
      { productId: "p3", consumption: 1, mode: "per_measure" },
      { productId: "p2", consumption: 0.05, mode: "per_measure" },
    ],
  },
  {
    id: "s5", name: "Moldura", description: "Moldura decorativa de gesso em metro linear.",
    measureType: "linear", laborPrice: 35, unitLabel: "m", active: true,
    materials: [
      { productId: "p11", consumption: 1.05, mode: "per_measure" },
      { productId: "p13", consumption: 0.25, mode: "per_measure" },
      { productId: "p15", consumption: 0.1, mode: "per_measure" },
    ],
  },
  {
    id: "s6", name: "Divisória", description: "Divisória em drywall com perfis metálicos.",
    measureType: "area", laborPrice: 60, unitLabel: "m²", active: true,
    materials: [
      { productId: "p6", consumption: 1, mode: "per_plate" },
      { productId: "p7", consumption: 0.7, mode: "per_measure" },
      { productId: "p8", consumption: 0.35, mode: "per_measure" },
      { productId: "p5", consumption: 15, mode: "per_measure" },
      { productId: "p9", consumption: 1.5, mode: "per_measure" },
      { productId: "p10", consumption: 0.5, mode: "per_measure" },
    ],
  },
  {
    id: "s7", name: "Rebaixamento", description: "Rebaixamento de teto em gesso com estrutura suspensa.",
    measureType: "area", laborPrice: 58, unitLabel: "m²", active: true,
    materials: [
      { productId: "p1", consumption: 1, mode: "per_plate" },
      { productId: "p2", consumption: 0.15, mode: "per_measure" },
      { productId: "p3", consumption: 1.2, mode: "per_measure" },
      { productId: "p4", consumption: 1.5, mode: "per_measure" },
    ],
  },
  {
    id: "s8", name: "Nicho", description: "Nicho embutido em gesso com acabamento.",
    measureType: "area", laborPrice: 120, unitLabel: "m²", active: true,
    materials: [
      { productId: "p1", consumption: 1, mode: "per_plate" },
      { productId: "p4", consumption: 2, mode: "per_measure" },
      { productId: "p14", consumption: 1.2, mode: "per_measure" },
      { productId: "p13", consumption: 0.5, mode: "per_measure" },
    ],
  },
  {
    id: "s9", name: "Painel", description: "Painel decorativo 3D em gesso.",
    measureType: "area", laborPrice: 95, unitLabel: "m²", active: true,
    materials: [
      { productId: "p1", consumption: 1, mode: "per_plate" },
      { productId: "p13", consumption: 0.6, mode: "per_measure" },
      { productId: "p4", consumption: 1, mode: "per_measure" },
      { productId: "p15", consumption: 0.2, mode: "per_measure" },
    ],
  },
  {
    id: "s10", name: "Outro", description: "Serviço personalizado — defina materiais e mão de obra.",
    measureType: "area", laborPrice: 50, unitLabel: "m²", active: true,
    materials: [
      { productId: "p4", consumption: 1, mode: "per_measure" },
    ],
  },
  {
    id: "s11", name: "Negativo", description: "Negativo de gesso cobrado por metro linear (valor do orçamento de referência).",
    measureType: "linear", laborPrice: 45, unitLabel: "ml", fixedRate: true, active: true, materials: [],
  },
  // Tabela de preços importada dos três orçamentos de referência.
  // Cada preço fica como serviço próprio para manter as diferentes tarifas disponíveis.
  { id: "pdf-forro-85", name: "Forro", description: "Forro — tarifa de referência R$ 85,00/m².", measureType: "area", laborPrice: 85, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-forro-130", name: "Forro", description: "Forro — tarifa de referência R$ 130,00/m².", measureType: "area", laborPrice: 130, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-forro-cimenticia-350", name: "Forro em placa cimentícia", description: "Forro em placa cimentícia — tarifa de referência R$ 350,00/m².", measureType: "area", laborPrice: 350, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-forro-acartonado-140", name: "Forro em gesso acartonado", description: "Forro em gesso acartonado — tarifa de referência R$ 140,00/m².", measureType: "area", laborPrice: 140, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-forro-acartonado-150", name: "Forro em gesso acartonado", description: "Forro em gesso acartonado — tarifa de referência R$ 150,00/m².", measureType: "area", laborPrice: 150, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-parede-acartonado-180", name: "Parede de gesso acartonado", description: "Parede de gesso acartonado — tarifa de referência R$ 180,00/m².", measureType: "area", laborPrice: 180, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-cortineiro-50", name: "Cortineiro", description: "Cortineiro — tarifa de referência R$ 50,00/ml.", measureType: "linear", laborPrice: 50, unitLabel: "ml", fixedRate: true, active: true, materials: [] },
  { id: "pdf-cortineiro-85", name: "Cortineiro", description: "Cortineiro — tarifa de referência R$ 85,00/ml.", measureType: "linear", laborPrice: 85, unitLabel: "ml", fixedRate: true, active: true, materials: [] },
  { id: "pdf-negativo-50", name: "Negativo", description: "Negativo — tarifa de referência R$ 50,00/ml.", measureType: "linear", laborPrice: 50, unitLabel: "ml", fixedRate: true, active: true, materials: [] },
  { id: "pdf-tabica-acartonado-45", name: "Tabica de gesso acartonado", description: "Tabica de gesso acartonado — tarifa de referência R$ 45,00/ml.", measureType: "linear", laborPrice: 45, unitLabel: "ml", fixedRate: true, active: true, materials: [] },
  { id: "pdf-tabica-acartonado-50", name: "Tabica de gesso acartonado", description: "Tabica de gesso acartonado — tarifa de referência R$ 50,00/ml.", measureType: "linear", laborPrice: 50, unitLabel: "ml", fixedRate: true, active: true, materials: [] },
  { id: "pdf-tabicas-40", name: "Tabicas", description: "Tabicas — tarifa de referência R$ 40,00/ml.", measureType: "linear", laborPrice: 40, unitLabel: "ml", fixedRate: true, active: true, materials: [] },
  { id: "pdf-divisorias-gesso-175", name: "Divisórias em gesso", description: "Divisórias em gesso — tarifa de referência R$ 175,00/m².", measureType: "area", laborPrice: 175, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-elevador-175", name: "Fechamento do elevador", description: "Fechamento do elevador — tarifa de referência R$ 175,00/m².", measureType: "area", laborPrice: 175, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-banheiros-1-pavimento-175", name: "Divisória dos banheiros — 1º pavimento", description: "Divisória dos banheiros do 1º pavimento — tarifa de referência R$ 175,00/m².", measureType: "area", laborPrice: 175, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-banheiro-2-pavimento-175", name: "Divisória do banheiro — 2º pavimento", description: "Divisória do banheiro do 2º pavimento — tarifa de referência R$ 175,00/m².", measureType: "area", laborPrice: 175, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
  { id: "pdf-fechamento-vaos-175", name: "Fechamento dos vãos — 1º e 2º pavimentos", description: "Fechamento dos vãos do 1º e 2º pavimentos — tarifa de referência R$ 175,00/m².", measureType: "area", laborPrice: 175, unitLabel: "m²", fixedRate: true, active: true, materials: [] },
];
