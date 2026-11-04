import type { FinanceEntry } from "@/types";
import { addDays, daysAgo } from "@/utils/format";
import { mockQuotes } from "./quotes";

const approved = mockQuotes.filter((q) => q.status === "aprovado");

const incomes: FinanceEntry[] = approved.flatMap((q, i) => {
  const half = +(q.total / 2).toFixed(2);
  const base = new Date(q.approvedAt || q.createdAt);
  const paidFirst = true;
  const secondStatus = i % 3 === 0 ? "pago" : i % 3 === 1 ? "pendente" : "atrasado";
  return [
    {
      id: `f-in-${q.id}-1`,
      description: `Sinal 50% — Orçamento #${q.number}`,
      clientId: q.clientId,
      clientName: q.clientName,
      type: "entrada" as const,
      category: "servico" as const,
      amount: half,
      dueDate: base.toISOString(),
      paidAt: paidFirst ? base.toISOString() : undefined,
      status: "pago" as const,
      quoteId: q.id,
    },
    {
      id: `f-in-${q.id}-2`,
      description: `Restante 50% — Orçamento #${q.number}`,
      clientId: q.clientId,
      clientName: q.clientName,
      type: "entrada" as const,
      category: "servico" as const,
      amount: half,
      dueDate: secondStatus === "atrasado" ? daysAgo(4) : addDays(10, base),
      paidAt: secondStatus === "pago" ? addDays(9, base) : undefined,
      status: secondStatus,
      quoteId: q.id,
    },
  ];
});

const expenses: FinanceEntry[] = [
  { id: "f-out-1", description: "Compra de placas — Gesso Forte", type: "saida", category: "material", amount: 3420, dueDate: daysAgo(12), paidAt: daysAgo(12), status: "pago" },
  { id: "f-out-2", description: "Combustível — Van", type: "saida", category: "combustivel", amount: 480, dueDate: daysAgo(7), paidAt: daysAgo(7), status: "pago" },
  { id: "f-out-3", description: "Parafusadeira Makita", type: "saida", category: "ferramentas", amount: 890, dueDate: daysAgo(20), paidAt: daysAgo(19), status: "pago" },
  { id: "f-out-4", description: "Fornecedor — Perfis metálicos", type: "saida", category: "fornecedor", amount: 2150, dueDate: addDays(5), status: "pendente" },
  { id: "f-out-5", description: "Pagamento equipe — quinzena", type: "saida", category: "funcionario", amount: 6200, dueDate: daysAgo(2), paidAt: daysAgo(2), status: "pago" },
  { id: "f-out-6", description: "Aluguel do galpão", type: "saida", category: "outros", amount: 2800, dueDate: addDays(3), status: "pendente" },
  { id: "f-out-7", description: "Gesso em pó — 40 sacos", type: "saida", category: "material", amount: 1680, dueDate: daysAgo(30), paidAt: daysAgo(30), status: "pago" },
  { id: "f-out-8", description: "Seguro da van", type: "saida", category: "outros", amount: 390, dueDate: daysAgo(6), status: "atrasado" },
];

export const mockFinance: FinanceEntry[] = [...incomes, ...expenses];
