import type { WorkOrder, WorkOrderStatus } from "@/types";
import { addDays, daysAgo, pad } from "@/utils/format";
import { mockClients } from "./clients";
import { mockQuotes } from "./quotes";

const teams = ["Equipe A — Marcos e Júlio", "Equipe B — Rafael e Tiago", "Equipe C — Ednaldo e Pedro"];

const seeds: { quoteIdx: number; status: WorkOrderStatus; team: number; start: number; days: number }[] = [
  { quoteIdx: 1, status: "em_andamento", team: 0, start: -3, days: 5 },
  { quoteIdx: 2, status: "em_andamento", team: 1, start: -6, days: 10 },
  { quoteIdx: 5, status: "agendada", team: 2, start: 2, days: 6 },
  { quoteIdx: 7, status: "em_andamento", team: 0, start: -10, days: 14 },
  { quoteIdx: 9, status: "concluida", team: 1, start: -18, days: 3 },
  { quoteIdx: 10, status: "pausada", team: 2, start: -20, days: 15 },
  { quoteIdx: 12, status: "concluida", team: 0, start: -28, days: 4 },
  { quoteIdx: 17, status: "concluida", team: 1, start: -38, days: 2 },
  { quoteIdx: 19, status: "cancelada", team: 2, start: -45, days: 5 },
  { quoteIdx: 3, status: "aguardando", team: 0, start: 5, days: 3 },
];

const statusTitle: Record<WorkOrderStatus, string> = {
  aguardando: "OS criada — aguardando início",
  agendada: "Obra agendada",
  em_andamento: "Obra iniciada",
  pausada: "Obra pausada",
  concluida: "Obra concluída",
  cancelada: "Obra cancelada",
};

export const mockWorkOrders: WorkOrder[] = seeds.map((s, idx) => {
  const quote = mockQuotes[s.quoteIdx];
  const client = mockClients.find((c) => c.id === quote.clientId)!;
  const startDate = addDays(s.start);
  const createdAt = daysAgo(Math.abs(s.start) + 2);
  const flow: WorkOrderStatus[] = ["aguardando"];
  if (["agendada", "em_andamento", "pausada", "concluida"].includes(s.status)) flow.push("agendada");
  if (["em_andamento", "pausada", "concluida"].includes(s.status)) flow.push("em_andamento");
  if (s.status === "pausada") flow.push("pausada");
  if (s.status === "concluida") flow.push("concluida");
  if (s.status === "cancelada") flow.push("cancelada");
  return {
    id: `os${idx + 1}`,
    number: `OS-${pad(idx + 1)}`,
    quoteId: quote.id,
    quoteNumber: quote.number,
    clientId: client.id,
    clientName: client.name,
    address: `${client.address}, ${client.number} — ${client.district}, ${client.city}/${client.state}`,
    serviceName: quote.items[0].serviceName,
    team: teams[s.team],
    startDate,
    expectedEnd: addDays(s.days, new Date(startDate)),
    status: s.status,
    materials: quote.items[0].materials.map((m) => ({ productName: m.productName, quantity: m.quantity, unit: m.unit })),
    timeline: flow.map((st, i) => ({
      id: `${idx}-${i}`,
      date: addDays(i * 2, new Date(createdAt)),
      title: statusTitle[st],
      status: st,
    })),
    total: quote.total,
    createdAt,
  };
});
