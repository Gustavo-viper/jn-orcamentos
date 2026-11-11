import { describe, expect, it } from 'vitest';
import {
  area,
  perimeter,
  platesNeeded,
  calculateQuote,
  splitInstallments,
  type CalcProduct,
  type CalcService,
  type EnvironmentInput,
  type QuoteCalcInput,
} from '../src/calc.js';
import { ceilSafe, cents, parseDecimal, roundTo, formatBRL } from '../src/money.js';
import { isValidCNPJ, isValidCPF } from '../src/validation.js';
import { can } from '../src/permissions.js';
import { financeDisplayStatus, quoteDisplayStatus, addDaysISO } from '../src/types.js';

// ---------- Cadastros de teste (somente para os testes) ----------
const placa: CalcProduct = { id: 'prod-placa', name: 'Placa ST 1,20×1,80', unit: 'un', category: 'placas', unitCost: 3290, plateArea: 2.16, indivisible: true };
const massa: CalcProduct = { id: 'prod-massa', name: 'Massa para juntas', unit: 'kg', category: 'massa', unitCost: 450, plateArea: null, indivisible: false };
const parafuso: CalcProduct = { id: 'prod-paraf', name: 'Parafuso', unit: 'un', category: 'fixacao', unitCost: 8, plateArea: null, indivisible: true };
const moldura: CalcProduct = { id: 'prod-mold', name: 'Moldura de gesso (barra 1 m)', unit: 'm', category: 'acabamento', unitCost: 900, plateArea: null, indivisible: true };
const products = [placa, massa, parafuso, moldura];

const forro: CalcService = {
  id: 'serv-forro', name: 'Forro de drywall', measurementType: 'm2', pricingMode: 'cost_plus', laborPrice: 3500, chargeUnit: 'm²', linearBasis: 'perimeter',
  materials: [
    { productId: 'prod-placa', consumption: 1 },
    { productId: 'prod-massa', consumption: 0.5 },
    { productId: 'prod-paraf', consumption: 15 },
  ],
};
const sanca: CalcService = {
  id: 'serv-sanca', name: 'Moldura / roda-teto', measurementType: 'ml', pricingMode: 'cost_plus', laborPrice: 1200, chargeUnit: 'm', linearBasis: 'perimeter',
  materials: [{ productId: 'prod-mold', consumption: 1 }],
};
const spot: CalcService = {
  id: 'serv-spot', name: 'Furo para spot', measurementType: 'unit', pricingMode: 'fixed', laborPrice: 5000, chargeUnit: 'un', linearBasis: 'perimeter', materials: [],
};
const services = [forro, sanca, spot];

const env = (over: Partial<EnvironmentInput>): EnvironmentInput => ({
  id: 'env-1', name: 'Sala', serviceId: 'serv-forro', width: 4, length: 5, height: 2.8, wastePct: 10, deductions: [], ...over,
});
const quote = (over: Partial<QuoteCalcInput>): QuoteCalcInput => ({
  environments: [], marginPct: 30, marginOnLabor: true, discountType: 'none', discountValue: 0,
  installments: [{ label: 'Entrada', pct: 50 }, { label: 'Conclusão', pct: 50 }], ...over,
});

describe('utilitários numéricos', () => {
  it('arredonda sem ruído de ponto flutuante', () => {
    expect(roundTo(0.1 + 0.2, 4)).toBe(0.3);
    expect(ceilSafe(3.0000000001)).toBe(3);
    expect(ceilSafe(3.01)).toBe(4);
    expect(ceilSafe(-2)).toBe(0);
    expect(cents(1.5)).toBe(2);
  });
  it('interpreta números digitados no padrão brasileiro', () => {
    expect(parseDecimal('1.234,56')).toBe(1234.56);
    expect(parseDecimal('3,5')).toBe(3.5);
    expect(parseDecimal('3.5')).toBe(3.5);
    expect(parseDecimal('abc')).toBeNaN();
    expect(formatBRL(123456).replace(/\s/g, ' ')).toBe('R$ 1.234,56');
  });
});

describe('cálculos geométricos', () => {
  it('área = largura × comprimento', () => {
    expect(area(4, 5)).toBe(20);
    expect(area(3.35, 2.7)).toBe(9.045);
  });
  it('perímetro = 2 × (largura + comprimento)', () => {
    expect(perimeter(4, 5)).toBe(18);
    expect(perimeter(3.35, 2.7)).toBe(12.1);
  });
  it('medidas negativas são tratadas como zero', () => {
    expect(area(-4, 5)).toBe(0);
  });
  it('paredes: comprimento × altura (sem largura)', () => {
    const r = calculateQuote(quote({ environments: [env({ surface: 'walls' })] }), services, products);
    expect(r.environments[0].grossArea).toBe(14);
  });
});

describe('descontos de áreas (portas, janelas, vãos)', () => {
  it('subtrai portas e janelas da área total', () => {
    const r = calculateQuote(
      quote({ environments: [env({ deductions: [
        { id: 'd-porta01', label: 'Porta', width: 0.8, length: 2.1 },
        { id: 'd-janela1', label: 'Janela', width: 1.2, length: 1, quantity: 2 },
      ] })] }),
      services, products,
    );
    const e = r.environments[0];
    expect(e.grossArea).toBe(20);
    expect(e.deductedArea).toBe(4.08); // 1,68 + 2 × 1,20
    expect(e.netArea).toBe(15.92);
  });
  it('nunca gera área negativa', () => {
    const r = calculateQuote(quote({ environments: [env({ width: 1, length: 1, deductions: [{ id: 'd-grande1', label: 'Vão', width: 3, length: 3 }] })] }), services, products);
    expect(r.environments[0].netArea).toBe(0);
    expect(r.environments[0].deductedArea).toBe(1);
    expect(r.total).toBe(0);
  });
});

describe('cálculo de placas', () => {
  it('aplica desperdício e arredonda para cima', () => {
    // 17,12 m² × 1,10 = 18,832 ÷ 2,16 = 8,718 → 9 placas
    expect(platesNeeded(17.12, 10, 2.16)).toBe(9);
  });
  it('não arredonda indevidamente quando a divisão é exata', () => {
    expect(platesNeeded(21.6, 0, 2.16)).toBe(10);
    expect(platesNeeded(0.1 + 0.2, 0, 0.3)).toBe(1);
  });
  it('retorna zero para área zero ou placa sem área', () => {
    expect(platesNeeded(0, 10, 2.16)).toBe(0);
    expect(platesNeeded(10, 10, 0)).toBe(0);
  });
});

describe('orçamento completo de forro (m²)', () => {
  // Sala 4 × 5 com porta 0,8 × 2,1 → área líquida 18,32 m², desperdício 10%
  const r = calculateQuote(
    quote({ environments: [env({ deductions: [{ id: 'd-porta01', label: 'Porta', width: 0.8, length: 2.1 }] })] }),
    services, products,
  );
  const e = r.environments[0];
  it('área líquida', () => expect(e.netArea).toBe(18.32));
  it('placas: ceil(18,32 × 1,1 ÷ 2,16) = 10', () => {
    const line = e.materials.find((m) => m.productId === 'prod-placa')!;
    expect(line.qty).toBe(10);
    expect(line.cost).toBe(32900);
    expect(r.plates).toBe(10);
  });
  it('massa (divisível): 18,32 × 0,5 × 1,1 = 10,076 kg', () => {
    const line = e.materials.find((m) => m.productId === 'prod-massa')!;
    expect(line.qty).toBe(10.076);
    expect(line.cost).toBe(4534); // 10,076 × 4,50 = 45,342
  });
  it('parafusos (indivisível): 18,32 × 15 × 1,1 = 302,28 → 303', () => {
    const line = e.materials.find((m) => m.productId === 'prod-paraf')!;
    expect(line.qty).toBe(303);
    expect(line.cost).toBe(2424);
  });
  it('mão de obra = 18,32 × R$ 35,00 = R$ 641,20', () => expect(e.laborCost).toBe(64120));
  it('custo, margem de 30% e preço final', () => {
    const materials = 32900 + 4534 + 2424;
    expect(r.materialCost).toBe(materials);
    expect(r.totalCost).toBe(materials + 64120);
    expect(r.marginAmount).toBe(Math.round((materials + 64120) * 0.3));
    expect(r.total).toBe(r.totalCost + r.marginAmount);
    expect(r.estimatedProfit).toBe(r.marginAmount);
    expect(r.errors).toEqual([]);
  });
  it('margem somente sobre materiais quando configurado', () => {
    const r2 = calculateQuote(quote({ marginOnLabor: false, environments: [env({})] }), services, products);
    expect(r2.marginAmount).toBe(Math.round(r2.materialCost * 0.3));
  });
  it('preço personalizado da mão de obra', () => {
    const r2 = calculateQuote(quote({ environments: [env({ laborPriceOverride: 4000 })] }), services, products);
    expect(r2.laborCost).toBe(80000); // 20 m² × R$ 40
  });
});

describe('metro linear', () => {
  it('usa o perímetro e desconta a largura dos vãos', () => {
    const r = calculateQuote(
      quote({ marginPct: 0, environments: [env({ serviceId: 'serv-sanca', wastePct: 5, deductions: [{ id: 'd-porta01', label: 'Porta', width: 0.8, length: 2.1 }] })] }),
      services, products,
    );
    const e = r.environments[0];
    expect(e.linear).toBe(17.2);
    expect(r.linearTotal).toBe(17.2);
    expect(e.laborCost).toBe(20640); // 17,2 × 12
    // 17,2 × 1 × 1,05 = 18,06 → 19 barras
    expect(e.materials[0].qty).toBe(19);
    expect(r.netArea).toBe(0); // serviço linear não soma área
  });
  it('metragem manual substitui a base do serviço', () => {
    const r = calculateQuote(quote({ environments: [env({ serviceId: 'serv-sanca', linearOverride: 7.5, wastePct: 0 })] }), services, products);
    expect(r.environments[0].linear).toBe(7.5);
  });
});

describe('preço fixo', () => {
  it('não aplica margem em serviço de preço fixo', () => {
    const r = calculateQuote(quote({ marginPct: 50, environments: [env({ serviceId: 'serv-spot', quantity: 6 })] }), services, products);
    expect(r.environments[0].price).toBe(30000);
    expect(r.marginAmount).toBe(0);
    expect(r.fixedPriceTotal).toBe(30000);
    expect(r.total).toBe(30000);
  });
});

describe('descontos comerciais', () => {
  const base = quote({ marginPct: 0, environments: [env({ serviceId: 'serv-spot', quantity: 8 })] }); // R$ 400,00
  it('desconto percentual', () => {
    const r = calculateQuote({ ...base, discountType: 'pct', discountValue: 10 }, services, products);
    expect(r.subtotal).toBe(40000);
    expect(r.discount).toBe(4000);
    expect(r.total).toBe(36000);
  });
  it('desconto em reais', () => {
    const r = calculateQuote({ ...base, discountType: 'value', discountValue: 5000 }, services, products);
    expect(r.total).toBe(35000);
  });
  it('não permite desconto maior que o valor disponível', () => {
    const r = calculateQuote({ ...base, discountType: 'value', discountValue: 50000 }, services, products);
    expect(r.total).toBe(0);
    expect(r.errors.join()).toMatch(/maior que o valor/);
    const r2 = calculateQuote({ ...base, discountType: 'pct', discountValue: 120 }, services, products);
    expect(r2.errors.join()).toMatch(/entre 0% e 100%/);
  });
});

describe('condições de pagamento', () => {
  it('50% / 50% de R$ 4.000,00', () => {
    expect(splitInstallments(400000, [{ label: 'Entrada', pct: 50 }, { label: 'Final', pct: 50 }]).map((i) => i.amount)).toEqual([200000, 200000]);
  });
  it('preserva os centavos na última parcela', () => {
    const parts = splitInstallments(100001, [{ label: 'A', pct: 33.33 }, { label: 'B', pct: 33.33 }, { label: 'C', pct: 33.34 }]);
    expect(parts.reduce((s, p) => s + p.amount, 0)).toBe(100001);
  });
  it('acusa erro quando parcelas não somam 100%', () => {
    const r = calculateQuote(quote({ installments: [{ label: 'Entrada', pct: 40 }], environments: [env({})] }), services, products);
    expect(r.errors.join()).toMatch(/somam 40%/);
  });
});

describe('vários ambientes', () => {
  it('soma totais e agrega materiais por produto', () => {
    const r = calculateQuote(
      quote({ environments: [env({ id: 'env-aaaa1' }), env({ id: 'env-bbbb2', name: 'Quarto', width: 3, length: 3 })] }),
      services, products,
    );
    expect(r.grossArea).toBe(29);
    // placas por ambiente: ceil(20×1,1/2,16)=11 e ceil(9×1,1/2,16)=5
    expect(r.plates).toBe(16);
    expect(r.materials.find((m) => m.productId === 'prod-placa')!.qty).toBe(16);
    expect(r.total).toBe(r.environments[0].price + r.environments[1].price);
  });
  it('serviço inexistente gera erro e não soma valor', () => {
    const r = calculateQuote(quote({ environments: [env({ serviceId: 'nao-existe' })] }), services, products);
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.total).toBe(0);
  });
});

describe('documentos, permissões e situações', () => {
  it('valida CPF e CNPJ', () => {
    expect(isValidCPF('529.982.247-25')).toBe(true);
    expect(isValidCPF('111.111.111-11')).toBe(false);
    expect(isValidCNPJ('11.222.333/0001-81')).toBe(true);
    expect(isValidCNPJ('11.222.333/0001-80')).toBe(false);
  });
  it('controle de permissões', () => {
    const emp = { role: 'employee' as const, permissions: { clients: { view: true, edit: true }, finance: { edit: true } } };
    expect(can(emp, 'clients', 'edit')).toBe(true);
    expect(can(emp, 'clients', 'delete')).toBe(false);
    expect(can(emp, 'finance', 'edit')).toBe(false); // sem "visualizar" não pode alterar
    expect(can({ role: 'admin', permissions: {} }, 'finance', 'delete')).toBe(true);
    expect(can({ role: 'admin', permissions: {}, active: false }, 'finance')).toBe(false);
  });
  it('situação derivada: atrasado e expirado', () => {
    expect(financeDisplayStatus({ status: 'pending', dueDate: '2026-01-01' }, '2026-02-01')).toBe('overdue');
    expect(financeDisplayStatus({ status: 'paid', dueDate: '2026-01-01' }, '2026-02-01')).toBe('paid');
    expect(quoteDisplayStatus({ status: 'pending', validUntil: '2026-01-01' }, '2026-02-01')).toBe('expired');
    expect(addDaysISO('2026-01-30', 15)).toBe('2026-02-14');
  });
});

describe('adicionais do serviço', () => {
  const tabica = { id: 'ad-1', addonId: 'tab', name: 'Tabica', measurementType: 'ml' as const, chargeUnit: 'm', laborPrice: 1000, width: 0, length: 18 };
  const elevacao = { id: 'ad-2', addonId: 'ele', name: 'Elevação', measurementType: 'm2' as const, chargeUnit: 'm²', laborPrice: 2000, width: 2, length: 3 };
  const pendente = { id: 'ad-3', name: 'Pendente', measurementType: 'unit' as const, chargeUnit: 'un', laborPrice: 1500, width: 0, length: 0, quantity: 2 };

  it('soma adicionais (custo + margem) ao ambiente', () => {
    const semAd = calculateQuote(quote({ environments: [env({})] }), services, products).environments[0]!;
    const r = calculateQuote(quote({ environments: [env({ addons: [tabica, elevacao, pendente] })] }), services, products);
    const e = r.environments[0]!;
    expect(e.addons.map((a) => a.measure)).toEqual([18, 6, 2]);
    expect(e.addons.map((a) => a.laborCost)).toEqual([18000, 12000, 3000]);
    // margem de 30% sobre a mão de obra dos adicionais
    expect(e.addons.map((a) => a.price)).toEqual([23400, 15600, 3900]);
    expect(e.basePrice).toBe(semAd.price);
    expect(e.price).toBe(semAd.price + 23400 + 15600 + 3900);
    expect(e.laborCost).toBe(semAd.laborCost + 33000);
    expect(r.subtotal).toBe(e.price);
  });

  it('sem margem sobre mão de obra, adicional não recebe margem', () => {
    const e = calculateQuote(quote({ marginOnLabor: false, environments: [env({ addons: [tabica] })] }), services, products).environments[0]!;
    expect(e.addons[0]!.price).toBe(18000);
    expect(e.addons[0]!.margin).toBe(0);
  });

  it('em serviço de preço fixo, adicional é preço final', () => {
    const e = calculateQuote(quote({ environments: [env({ serviceId: 'serv-spot', quantity: 1, addons: [tabica] })] }), services, products).environments[0]!;
    expect(e.basePrice).toBe(5000);
    expect(e.addons[0]!.price).toBe(18000);
    expect(e.price).toBe(23000);
    expect(e.laborCost).toBe(0);
  });
});
