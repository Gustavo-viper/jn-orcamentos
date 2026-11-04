import type { Quote } from "@/types";

export interface QuoteLine {
  id: string;
  local: string;
  service: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  total: number;
}

const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

export function getQuoteLines(quote: Quote): QuoteLine[] {
  if (!quote.items.length) return [];
  const rawTotals = quote.items.map((item) => {
    if (item.fixedRate) return item.laborTotal;
    const cost = item.materialsCost + item.laborTotal;
    return cost * (1 + quote.marginPercent / 100);
  });
  const rawSum = rawTotals.reduce((sum, value) => sum + value, 0);
  const subtotal = quote.priceBeforeDiscount || rawSum;
  const discountShare = subtotal > 0 ? quote.discountAmount / subtotal : 0;
  const totals = rawTotals.map((value) => money(value * (1 - discountShare)));
  const last = totals.length - 1;
  if (last >= 0) totals[last] = money(totals[last] + quote.total - totals.reduce((sum, value) => sum + value, 0));

  return quote.items.map((item, index) => {
    const unit = item.measureType === "area"
      ? "m²"
      : item.unitLabel?.toLocaleLowerCase("pt-BR") === "m" ? "ml" : item.unitLabel || "ml";
    const quantity = item.measureValue;
    return {
      id: item.id,
      local: item.roomName?.trim() || "—",
      service: item.serviceName,
      quantity,
      unit,
      unitPrice: item.quotedUnitPrice ?? (quantity > 0 ? totals[index] / quantity : 0),
      total: totals[index],
    };
  });
}
