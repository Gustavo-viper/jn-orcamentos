import type { Activity, DashboardSnapshot } from "@/types";
import { daysAgo } from "@/utils/format";

export const mockDashboard: DashboardSnapshot = {
  salesByMonth: [
    { month: "Jan", value: 32400 },
    { month: "Fev", value: 28900 },
    { month: "Mar", value: 41200 },
    { month: "Abr", value: 37800 },
    { month: "Mai", value: 45100 },
    { month: "Jun", value: 48750 },
  ],
};

export const mockActivities: Activity[] = [
  { id: "a1", message: "Maria Oliveira aprovou o orçamento #0002", date: daysAgo(0.1), type: "quote" },
  { id: "a3", message: "Nova obra OS-0003 cadastrada para Arquitetura Lume", date: daysAgo(0.8), type: "order" },
  { id: "a4", message: "Pagamento recebido — Sinal orçamento #0008", date: daysAgo(1.2), type: "finance" },
  { id: "a5", message: "Novo cliente cadastrado: Paulo Henrique Souza", date: daysAgo(2), type: "client" },
  { id: "a6", message: "Orçamento #0004 enviado pelo WhatsApp", date: daysAgo(2.5), type: "quote" },
];
