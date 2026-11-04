import type { Product, QuoteItem, QuoteMaterial, Service } from "@/types";
import { uid } from "./format";

export interface MeasureInput {
  width: number;
  length: number;
  height: number;
}

export interface MeasureResult {
  area: number;
  perimeter: number;
  linear: number;
}

/** Calcula área, perímetro e metro linear a partir das medidas. */
export function calcMeasures(m: MeasureInput): MeasureResult {
  const w = m.width || 0;
  const l = m.length || 0;
  const area = +(w * l).toFixed(4);
  const perimeter = +(2 * (w + l)).toFixed(4);
  // Metro linear: usa o comprimento informado (ou largura se só houver uma)
  const linear = l > 0 ? l : w;
  return { area, perimeter, linear };
}

/** Calcula quantidade de placas para uma área. */
export function calcPlates(area: number, plateArea: number, wastePercent = 0) {
  if (!plateArea || plateArea <= 0) return { rawQuantity: 0, quantity: 0 };
  const effectiveArea = area * (1 + wastePercent / 100);
  const raw = effectiveArea / plateArea;
  return { rawQuantity: +raw.toFixed(2), quantity: Math.ceil(raw) };
}

export interface BuildItemParams {
  service: Service;
  products: Product[];
  measures: MeasureInput;
  wastePercent: number;
  laborUnitPrice?: number;
  roomName?: string;
  negativeMeasures?: { id: string; label: string; width: number; length: number }[];
}

/** Monta um item de orçamento completo com materiais calculados. */
export function buildQuoteItem(p: BuildItemParams): QuoteItem {
  const { service, products, measures, wastePercent } = p;
  const mr = calcMeasures(measures);
  const negativeArea = +(p.negativeMeasures ?? []).reduce((sum, item) => sum + item.width * item.length, 0).toFixed(4);
  const negativePerimeter = +(p.negativeMeasures ?? []).reduce((sum, item) => sum + 2 * (item.width + item.length), 0).toFixed(4);
  const netArea = +Math.max(0, mr.area - negativeArea).toFixed(4);
  const measureValue = service.measureType === "area" ? netArea : mr.linear;
  const wasteFactor = 1 + wastePercent / 100;

  let plateInfo: QuoteItem["plateInfo"];
  const materials: QuoteMaterial[] = service.materials
    .map((sm) => {
      const prod = products.find((pr) => pr.id === sm.productId);
      if (!prod) return null;
      let quantity = 0;
      let consumptionLabel = "";
      if (sm.mode === "per_plate") {
        const plateArea = prod.areaPerUnit || 1;
        const plates = calcPlates(netArea, plateArea, wastePercent);
        quantity = plates.quantity;
        plateInfo = { plateArea, ...plates };
        consumptionLabel = `${plateArea.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} m²/un`;
      } else {
        quantity = +(measureValue * sm.consumption * wasteFactor).toFixed(2);
        consumptionLabel = `${sm.consumption.toLocaleString("pt-BR", { minimumFractionDigits: 2 })} ${prod.unit}/${service.unitLabel}`;
        if (prod.unit === "un") quantity = Math.ceil(quantity);
      }
      const total = +(quantity * prod.cost).toFixed(2);
      return {
        productId: prod.id,
        productName: prod.name,
        unit: prod.unit,
        consumption: sm.consumption,
        consumptionLabel,
        quantity,
        unitCost: prod.cost,
        total,
      } as QuoteMaterial;
    })
    .filter(Boolean) as QuoteMaterial[];

  const materialsCost = +materials.reduce((s, m) => s + m.total, 0).toFixed(2);
  const laborUnitPrice = p.laborUnitPrice ?? service.laborPrice;
  const laborTotal = +(measureValue * laborUnitPrice).toFixed(2);

  return {
    id: uid(),
    roomName: p.roomName?.trim() || undefined,
    serviceId: service.id,
    serviceName: service.name,
    measureType: service.measureType,
    unitLabel: service.unitLabel,
    fixedRate: service.fixedRate,
    width: measures.width,
    length: measures.length,
    height: measures.height,
    area: mr.area,
    negativeArea,
    perimeter: mr.perimeter,
    negativePerimeter,
    linear: mr.linear,
    measureValue,
    wastePercent,
    negativeMeasures: p.negativeMeasures ?? [],
    plateInfo,
    materials,
    materialsCost,
    laborUnitPrice,
    laborTotal,
  };
}

export interface TotalsParams {
  items: QuoteItem[];
  marginPercent: number;
  discountType: "percent" | "value";
  discountValue: number;
}

export function calcTotals(p: TotalsParams) {
  const materialsCost = +p.items.reduce((s, i) => s + i.materialsCost, 0).toFixed(2);
  const laborCost = +p.items.reduce((s, i) => s + i.laborTotal, 0).toFixed(2);
  const totalCost = +(materialsCost + laborCost).toFixed(2);
  const marginBase = +p.items.reduce((s, item) => s + (item.fixedRate ? 0 : item.materialsCost + item.laborTotal), 0).toFixed(2);
  const profit = +(marginBase * (p.marginPercent / 100)).toFixed(2);
  const priceBeforeDiscount = +(totalCost + profit).toFixed(2);
  const discountAmount =
    p.discountType === "percent"
      ? +(priceBeforeDiscount * (p.discountValue / 100)).toFixed(2)
      : Math.min(p.discountValue || 0, priceBeforeDiscount);
  const total = +(priceBeforeDiscount - discountAmount).toFixed(2);
  return {
    materialsCost,
    laborCost,
    totalCost,
    profit,
    priceBeforeDiscount,
    discountAmount,
    total,
  };
}
