import { useMemo } from 'react';
import type { CalcProduct, CalcService, Product, Service } from '@jn/shared';
import { useTable } from './data';

export function toCalcService(s: Service): CalcService {
  return { id: s.id, name: s.name, measurementType: s.measurementType, pricingMode: s.pricingMode, laborPrice: s.laborPrice, chargeUnit: s.chargeUnit, linearBasis: s.linearBasis, materials: s.materials };
}
export function toCalcProduct(p: Product): CalcProduct {
  return { id: p.id, name: p.name, unit: p.unit, category: p.category, unitCost: p.unitCost, plateArea: p.plateArea, indivisible: p.indivisible };
}

/** Catálogo local (serviços e produtos) usado pela calculadora — disponível offline. */
export function useCatalog() {
  const services = useTable('services');
  const products = useTable('products');
  return useMemo(
    () => ({
      ready: !!services && !!products,
      services: services ?? [],
      products: products ?? [],
      calcServices: (services ?? []).map(toCalcService),
      calcProducts: (products ?? []).map(toCalcProduct),
    }),
    [services, products],
  );
}
