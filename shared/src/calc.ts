/**
 * Motor de cálculo de orçamentos da J&N Decorações em Gesso.
 *
 * Executado de forma idêntica no navegador (cálculo em tempo real, inclusive offline)
 * e no servidor (recalcula e valida antes de persistir — nunca confia no frontend).
 *
 * Convenções:
 *  - medidas em metros (m, m²);
 *  - valores monetários em centavos (inteiros);
 *  - percentuais em 0–100 (ex.: 10 = 10%).
 */
import { ceilSafe, cents, roundTo } from './money.js';

export type MeasurementType = 'm2' | 'ml' | 'unit';
export type PricingMode = 'cost_plus' | 'fixed';
export type LinearBasis = 'perimeter' | 'width' | 'length';
/** floor = teto/piso (largura × comprimento); walls = paredes (perímetro × altura). */
export type Surface = 'floor' | 'walls';
export type DiscountType = 'none' | 'pct' | 'value';

export const PLATE_CATEGORY = 'placas';

export interface CalcProduct {
  id: string;
  name: string;
  unit: string;
  category: string;
  /** custo unitário em centavos */
  unitCost: number;
  /** área de cada placa em m² (somente para placas) */
  plateArea?: number | null;
  /** vendido apenas em unidades inteiras (arredonda para cima) */
  indivisible: boolean;
}

export interface CalcServiceMaterial {
  productId: string;
  /** consumo por unidade de medida do serviço (por m², por m ou por unidade) */
  consumption: number;
}

export interface CalcService {
  id: string;
  name: string;
  measurementType: MeasurementType;
  pricingMode: PricingMode;
  /** preço da mão de obra por unidade de medida (centavos). Em preço fixo, é o preço final por unidade. */
  laborPrice: number;
  chargeUnit: string;
  linearBasis: LinearBasis;
  materials: CalcServiceMaterial[];
}

export interface Deduction {
  id: string;
  label: string;
  width: number;
  length: number;
  quantity?: number;
}

export interface EnvironmentInput {
  id: string;
  name: string;
  serviceId: string;
  width: number;
  length: number;
  height: number;
  surface?: Surface;
  wastePct: number;
  /** preço personalizado da mão de obra (centavos), opcional */
  laborPriceOverride?: number | null;
  /** metragem linear informada manualmente (substitui a base do serviço) */
  linearOverride?: number | null;
  /** quantidade para serviços por unidade */
  quantity?: number | null;
  deductions: Deduction[];
}

export interface Installment {
  label: string;
  pct: number;
}

export interface QuoteCalcInput {
  environments: EnvironmentInput[];
  marginPct: number;
  /** quando verdadeiro, a margem incide sobre materiais + mão de obra; senão apenas sobre materiais */
  marginOnLabor: boolean;
  discountType: DiscountType;
  /** percentual (0–100) quando discountType = 'pct'; centavos quando 'value' */
  discountValue: number;
  installments: Installment[];
}

export interface MaterialLine {
  productId: string;
  name: string;
  unit: string;
  isPlate: boolean;
  /** quantidade exata calculada, antes de arredondar */
  rawQty: number;
  /** quantidade final (arredondada para cima se indivisível ou placa) */
  qty: number;
  unitCost: number;
  cost: number;
}

export interface EnvironmentResult {
  envId: string;
  name: string;
  serviceId: string;
  serviceName: string;
  measurementType: MeasurementType;
  pricingMode: PricingMode;
  chargeUnit: string;
  grossArea: number;
  deductedArea: number;
  netArea: number;
  perimeter: number;
  linear: number;
  deductedLinear: number;
  quantity: number;
  /** medida efetivamente utilizada para cobrança (m², m ou unidades) */
  measure: number;
  wastePct: number;
  laborPrice: number;
  laborCost: number;
  materials: MaterialLine[];
  materialCost: number;
  /** custo interno (materiais + mão de obra; em preço fixo, somente materiais) */
  cost: number;
  margin: number;
  price: number;
  plates: number;
  errors: string[];
}

export interface QuoteTotals {
  environments: EnvironmentResult[];
  grossArea: number;
  deductedArea: number;
  netArea: number;
  linearTotal: number;
  plates: number;
  materials: MaterialLine[];
  materialCost: number;
  laborCost: number;
  fixedPriceTotal: number;
  totalCost: number;
  marginPct: number;
  marginAmount: number;
  subtotal: number;
  discount: number;
  total: number;
  estimatedProfit: number;
  installments: (Installment & { amount: number })[];
  errors: string[];
}

const num = (v: unknown): number => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
};
const nonNeg = (v: unknown): number => Math.max(0, num(v));

export function area(width: number, length: number): number {
  return roundTo(nonNeg(width) * nonNeg(length), 4);
}

export function perimeter(width: number, length: number): number {
  return roundTo(2 * (nonNeg(width) + nonNeg(length)), 4);
}

/** Quantidade de placas = arredondamento para cima de (área × (1 + desperdício) ÷ área da placa). */
export function platesNeeded(requiredArea: number, wastePct: number, plateArea: number): number {
  if (!(plateArea > 0) || !(requiredArea > 0)) return 0;
  return ceilSafe((requiredArea * (1 + nonNeg(wastePct) / 100)) / plateArea);
}

export function isPlate(p: CalcProduct): boolean {
  return p.category === PLATE_CATEGORY && num(p.plateArea) > 0;
}

export function calculateEnvironment(
  env: EnvironmentInput,
  services: Map<string, CalcService>,
  products: Map<string, CalcProduct>,
  marginPct: number,
  marginOnLabor: boolean,
): EnvironmentResult {
  const errors: string[] = [];
  const service = services.get(env.serviceId);
  const width = nonNeg(env.width);
  const length = nonNeg(env.length);
  const height = nonNeg(env.height);
  const wastePct = nonNeg(env.wastePct);
  if (num(env.wastePct) < 0) errors.push('Desperdício não pode ser negativo.');

  const per = perimeter(width, length);
  const surface: Surface = env.surface ?? 'floor';
  const grossArea = surface === 'walls' ? roundTo(per * height, 4) : area(width, length);

  const deductions = (env.deductions ?? []).map((d) => ({
    area: roundTo(nonNeg(d.width) * nonNeg(d.length) * Math.max(1, nonNeg(d.quantity ?? 1)), 4),
    linear: roundTo(nonNeg(d.width) * Math.max(1, nonNeg(d.quantity ?? 1)), 4),
  }));
  const totalDedArea = deductions.reduce((s, d) => s + d.area, 0);
  const netArea = roundTo(Math.max(0, grossArea - totalDedArea), 4);
  const deductedArea = roundTo(grossArea - netArea, 4);

  const base: Omit<EnvironmentResult, 'serviceName' | 'measurementType' | 'pricingMode' | 'chargeUnit'> = {
    envId: env.id,
    name: env.name,
    serviceId: env.serviceId,
    grossArea,
    deductedArea,
    netArea,
    perimeter: per,
    linear: 0,
    deductedLinear: 0,
    quantity: 0,
    measure: 0,
    wastePct,
    laborPrice: 0,
    laborCost: 0,
    materials: [],
    materialCost: 0,
    cost: 0,
    margin: 0,
    price: 0,
    plates: 0,
    errors,
  };

  if (!service) {
    errors.push('Selecione um serviço válido.');
    return { ...base, serviceName: '—', measurementType: 'm2', pricingMode: 'cost_plus', chargeUnit: '' };
  }

  let measure = 0;
  let linear = 0;
  let deductedLinear = 0;
  let quantity = 0;
  if (service.measurementType === 'm2') {
    measure = netArea;
  } else if (service.measurementType === 'ml') {
    const baseLinear =
      env.linearOverride != null && num(env.linearOverride) > 0
        ? nonNeg(env.linearOverride)
        : service.linearBasis === 'width'
          ? width
          : service.linearBasis === 'length'
            ? length
            : per;
    const dedLin = deductions.reduce((s, d) => s + d.linear, 0);
    linear = roundTo(Math.max(0, baseLinear - dedLin), 4);
    deductedLinear = roundTo(baseLinear - linear, 4);
    measure = linear;
  } else {
    quantity = env.quantity != null ? nonNeg(env.quantity) : 1;
    measure = quantity;
  }

  const laborPrice =
    env.laborPriceOverride != null && num(env.laborPriceOverride) >= 0
      ? cents(num(env.laborPriceOverride))
      : service.laborPrice;

  // Materiais
  const materials: MaterialLine[] = [];
  let plates = 0;
  for (const sm of service.materials) {
    const p = products.get(sm.productId);
    if (!p) {
      errors.push('Material associado ao serviço não encontrado no cadastro.');
      continue;
    }
    let rawQty: number;
    let qty: number;
    const plate = isPlate(p);
    if (plate) {
      // Em m² a área necessária é a própria área líquida; em outros tipos, o consumo
      // representa m² de placa por unidade de medida.
      const requiredArea = service.measurementType === 'm2' ? measure * (num(sm.consumption) > 0 ? num(sm.consumption) : 1) : measure * nonNeg(sm.consumption);
      rawQty = roundTo((requiredArea * (1 + wastePct / 100)) / num(p.plateArea), 4);
      qty = platesNeeded(requiredArea, wastePct, num(p.plateArea));
      plates += qty;
    } else {
      rawQty = roundTo(measure * nonNeg(sm.consumption) * (1 + wastePct / 100), 4);
      qty = p.indivisible ? ceilSafe(rawQty) : roundTo(rawQty, 3);
    }
    const cost = cents(qty * p.unitCost);
    materials.push({ productId: p.id, name: p.name, unit: p.unit, isPlate: plate, rawQty, qty, unitCost: p.unitCost, cost });
  }
  const materialCost = materials.reduce((s, m) => s + m.cost, 0);

  let laborCost = 0;
  let cost = 0;
  let margin = 0;
  let price = 0;
  if (service.pricingMode === 'fixed') {
    // Preço fixo: valor final por unidade, sem margem. Materiais entram como custo interno.
    price = cents(measure * laborPrice);
    cost = materialCost;
  } else {
    laborCost = cents(measure * laborPrice);
    cost = materialCost + laborCost;
    const eligible = marginOnLabor ? cost : materialCost;
    margin = cents((eligible * nonNeg(marginPct)) / 100);
    price = cost + margin;
  }

  return {
    ...base,
    serviceName: service.name,
    measurementType: service.measurementType,
    pricingMode: service.pricingMode,
    chargeUnit: service.chargeUnit,
    linear,
    deductedLinear,
    quantity,
    measure: roundTo(measure, 4),
    laborPrice,
    laborCost,
    materials,
    materialCost,
    cost,
    margin,
    price,
    plates,
  };
}

/** Agrupa linhas de materiais pelo produto (somando quantidades e custos). */
export function aggregateMaterials(lines: MaterialLine[]): MaterialLine[] {
  const map = new Map<string, MaterialLine>();
  for (const l of lines) {
    const cur = map.get(l.productId);
    if (cur) {
      cur.rawQty = roundTo(cur.rawQty + l.rawQty, 4);
      cur.qty = roundTo(cur.qty + l.qty, 3);
      cur.cost += l.cost;
    } else map.set(l.productId, { ...l });
  }
  return [...map.values()];
}

export function splitInstallments(total: number, installments: Installment[]): (Installment & { amount: number })[] {
  if (!installments.length) return [];
  let acc = 0;
  return installments.map((ins, i) => {
    const amount = i === installments.length - 1 ? total - acc : cents((total * nonNeg(ins.pct)) / 100);
    acc += amount;
    return { label: ins.label, pct: nonNeg(ins.pct), amount };
  });
}

export function calculateQuote(
  input: QuoteCalcInput,
  servicesList: CalcService[],
  productsList: CalcProduct[],
): QuoteTotals {
  const services = new Map(servicesList.map((s) => [s.id, s]));
  const products = new Map(productsList.map((p) => [p.id, p]));
  const errors: string[] = [];
  const marginPct = nonNeg(input.marginPct);
  if (num(input.marginPct) < 0) errors.push('Margem de lucro não pode ser negativa.');

  const envs = input.environments.map((e) => calculateEnvironment(e, services, products, marginPct, input.marginOnLabor));
  envs.forEach((e) => e.errors.forEach((er) => errors.push(`${e.name || 'Ambiente'}: ${er}`)));

  const sum = (f: (e: EnvironmentResult) => number) => envs.reduce((s, e) => s + f(e), 0);
  const materialCost = sum((e) => e.materialCost);
  const laborCost = sum((e) => e.laborCost);
  const fixedPriceTotal = envs.filter((e) => e.pricingMode === 'fixed').reduce((s, e) => s + e.price, 0);
  const totalCost = sum((e) => e.cost);
  const marginAmount = sum((e) => e.margin);
  const subtotal = sum((e) => e.price);

  let discount = 0;
  const dv = num(input.discountValue);
  if (input.discountType === 'pct') {
    if (dv < 0 || dv > 100) errors.push('O desconto percentual deve estar entre 0% e 100%.');
    discount = cents((subtotal * Math.min(100, Math.max(0, dv))) / 100);
  } else if (input.discountType === 'value') {
    if (dv < 0) errors.push('O desconto não pode ser negativo.');
    if (dv > subtotal) errors.push('O desconto não pode ser maior que o valor do orçamento.');
    discount = Math.min(subtotal, Math.max(0, cents(dv)));
  }
  const total = subtotal - discount;

  const pctSum = roundTo(input.installments.reduce((s, i) => s + num(i.pct), 0), 4);
  if (input.installments.length === 0) errors.push('Defina ao menos uma condição de pagamento.');
  else if (Math.abs(pctSum - 100) > 0.001) errors.push(`Os percentuais das parcelas somam ${pctSum}% (devem somar 100%).`);
  if (input.installments.some((i) => num(i.pct) < 0)) errors.push('Percentual de parcela não pode ser negativo.');

  return {
    environments: envs,
    grossArea: roundTo(sum((e) => (e.measurementType === 'm2' ? e.grossArea : 0)), 4),
    deductedArea: roundTo(sum((e) => (e.measurementType === 'm2' ? e.deductedArea : 0)), 4),
    netArea: roundTo(sum((e) => (e.measurementType === 'm2' ? e.netArea : 0)), 4),
    linearTotal: roundTo(sum((e) => e.linear), 4),
    plates: sum((e) => e.plates),
    materials: aggregateMaterials(envs.flatMap((e) => e.materials)),
    materialCost,
    laborCost,
    fixedPriceTotal,
    totalCost,
    marginPct,
    marginAmount,
    subtotal,
    discount,
    total,
    estimatedProfit: total - totalCost,
    installments: splitInstallments(total, input.installments),
    errors,
  };
}
