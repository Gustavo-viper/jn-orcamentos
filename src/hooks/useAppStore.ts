import { create } from "zustand";
import { useShallow } from "zustand/react/shallow";
import type {
  Activity,
  Client,
  CompanySettings,
  FinanceEntry,
  Product,
  Quote,
  Service,
  WorkOrder,
  WorkOrderStatus,
} from "@/types";
import {
  activityService,
  clearAllStorage,
  clientService,
  defaultSettings,
  financeService,
  productService,
  quoteService,
  serviceService,
  settingsService,
  workOrderService,
} from "@/services";
import { addDays, genToken, pad, uid } from "@/utils/format";
import { hasSharedState, pullSharedState, pushInitialSharedState } from "@/services/storage";

let sharedRefreshTimer: number | undefined;
let sharedRefreshPromise: Promise<void> | undefined;
let initPromise: Promise<void> | undefined;
let sharedRefreshEventsAttached = false;

const sameData = (left: unknown, right: unknown) => JSON.stringify(left) === JSON.stringify(right);
const activityTypes = new Set<Activity["type"]>(["quote", "order", "finance", "client"]);

function normalizeActivities(value: unknown): Activity[] {
  if (!Array.isArray(value)) return [];
  return value.filter((entry): entry is Activity => {
    if (!entry || typeof entry !== "object") return false;
    const activity = entry as Partial<Activity>;
    return typeof activity.id === "string"
      && typeof activity.message === "string"
      && typeof activity.date === "string"
      && activityTypes.has(activity.type as Activity["type"]);
  });
}

async function refreshSharedState() {
  if (sharedRefreshPromise) return sharedRefreshPromise;

  const refresh = (async () => {
    const current = useAppStore.getState();
    const shared = {
      clients: current.clients,
      products: current.products,
      services: current.services,
      quotes: current.quotes,
      workOrders: current.workOrders,
      finance: current.finance,
      activities: current.activities,
      settings: current.settings,
    };

    try {
      const hasCloud = await hasSharedState();
      if (!hasCloud) await pushInitialSharedState(shared);
      const pulled = await pullSharedState(shared);
      const secureQuotes = pulled.quotes.map((quote) => ({
        ...quote,
        token: /^[A-F0-9]{32}$/i.test(quote.token) ? quote.token : genToken(),
      }));
      const rotatedQuotes = secureQuotes.filter((quote, index) => quote.token !== pulled.quotes[index].token);
      await Promise.all(rotatedQuotes.map((quote) => quoteService.update(quote.id, { token: quote.token })));

      const latest = { ...pulled, quotes: secureQuotes, activities: normalizeActivities(pulled.activities) };
      const currentAfterPull = useAppStore.getState();
      const changes: Partial<AppState> = {};
      for (const key of ["clients", "products", "services", "quotes", "workOrders", "finance", "activities", "settings"] as const) {
        if (!sameData(currentAfterPull[key], latest[key])) changes[key] = latest[key] as never;
      }

      if (Object.keys(changes).length) {
        if (changes.settings) document.documentElement.classList.toggle("dark", changes.settings.theme === "dark");
        useAppStore.setState(changes);
      }
    } catch (error) {
      console.warn("Sincronização compartilhada indisponível; mantendo os dados locais", error);
    }
  })();

  sharedRefreshPromise = refresh;
  try {
    await refresh;
  } finally {
    if (sharedRefreshPromise === refresh) sharedRefreshPromise = undefined;
  }
}

function startSharedRefresh() {
  if (sharedRefreshTimer || typeof window === "undefined") return;
  const refreshWhenVisible = () => {
    if (document.visibilityState === "visible") void refreshSharedState();
  };
  // Pull updates frequently so the second user sees new quotes and changes quickly.
  sharedRefreshTimer = window.setInterval(refreshWhenVisible, 5_000);
  if (!sharedRefreshEventsAttached) {
    window.addEventListener("focus", refreshWhenVisible);
    window.addEventListener("online", refreshWhenVisible);
    document.addEventListener("visibilitychange", refreshWhenVisible);
    sharedRefreshEventsAttached = true;
  }
}

interface AppState {
  loading: boolean;
  loaded: boolean;
  clients: Client[];
  products: Product[];
  services: Service[];
  quotes: Quote[];
  workOrders: WorkOrder[];
  finance: FinanceEntry[];
  activities: Activity[];
  settings: CompanySettings;

  init: () => Promise<void>;
  resetData: () => Promise<void>;

  // Clientes
  createClient: (c: Omit<Client, "id" | "createdAt">) => Promise<Client>;
  updateClient: (id: string, patch: Partial<Client>) => Promise<void>;
  deleteClient: (id: string) => Promise<void>;

  // Serviços
  updateService: (id: string, patch: Partial<Service>) => Promise<void>;
  createService: (s: Omit<Service, "id">) => Promise<Service>;
  deleteService: (id: string) => Promise<void>;

  // Orçamentos
  createQuote: (q: Omit<Quote, "id" | "number" | "token" | "createdAt">) => Promise<Quote>;
  updateQuote: (id: string, patch: Partial<Quote>) => Promise<void>;
  deleteQuote: (id: string) => Promise<void>;
  approveQuote: (id: string) => Promise<{ workOrder: WorkOrder }>;
  rejectQuote: (id: string) => Promise<void>;

  // Obras
  createWorkOrder: (w: Omit<WorkOrder, "id" | "number" | "createdAt" | "timeline">) => Promise<WorkOrder>;
  updateWorkOrderStatus: (id: string, status: WorkOrderStatus, note?: string) => Promise<void>;
  updateWorkOrder: (id: string, patch: Partial<WorkOrder>) => Promise<void>;

  // Financeiro
  createFinance: (f: Omit<FinanceEntry, "id">) => Promise<void>;
  updateFinance: (id: string, patch: Partial<FinanceEntry>) => Promise<void>;
  markPaid: (id: string) => Promise<void>;
  deleteFinance: (id: string) => Promise<void>;

  // Configurações
  saveSettings: (s: CompanySettings) => Promise<void>;
  setTheme: (t: "light" | "dark") => void;

  addActivity: (message: string, type: Activity["type"]) => Promise<void>;
}

const nextNumber = (items: { number: string }[], prefix = "") => {
  const max = items.reduce((m, i) => {
    const n = parseInt(i.number.replace(/\D/g, ""), 10);
    return isNaN(n) ? m : Math.max(m, n);
  }, 0);
  return `${prefix}${pad(max + 1)}`;
};

export const useAppStore = create<AppState>((set, get) => ({
  loading: true,
  loaded: false,
  clients: [],
  products: [],
  services: [],
  quotes: [],
  workOrders: [],
  finance: [],
  activities: [],
  settings: defaultSettings,

  async init() {
    if (initPromise) return initPromise;

    const load = (async () => {
      set({ loading: !get().loaded });
      try {
      const [clients, products, services, quotes, workOrders, finance, activities, settings] =
        await Promise.all([
          clientService.list(),
          productService.list(),
          serviceService.list(),
          quoteService.list(),
          workOrderService.list(),
          financeService.list(),
          activityService.list(),
          settingsService.get(),
        ]);
      // Atualiza orçamentos expirados automaticamente
      const now = Date.now();
      const fixed = quotes.map((q) =>
        q.status === "pendente" && new Date(q.validUntil).getTime() < now ? { ...q, status: "expirado" as const } : q
      );
      const currentActivities = normalizeActivities(activities);
      const shared = { clients, products, services, quotes: fixed, workOrders, finance, activities: currentActivities, settings };
      const secureQuotes = shared.quotes.map((quote) => ({
        ...quote,
        token: /^[A-F0-9]{32}$/i.test(quote.token) ? quote.token : genToken(),
      }));
      const rotatedQuotes = secureQuotes.filter((quote, index) => quote.token !== shared.quotes[index].token);
      await Promise.all(rotatedQuotes.map((quote) => quoteService.update(quote.id, { token: quote.token })));
      const localState = { ...shared, quotes: secureQuotes };
      document.documentElement.classList.toggle("dark", localState.settings.theme === "dark");
      set({ ...localState, loading: false, loaded: true });
      startSharedRefresh();
      void refreshSharedState();
      } catch (error) {
        console.error("Falha ao carregar dados locais", error);
        document.documentElement.classList.toggle("dark", get().settings.theme === "dark");
        set({ loading: false, loaded: true });
      }
    })();

    initPromise = load;
    try {
      await load;
    } finally {
      if (initPromise === load) initPromise = undefined;
    }
  },

  async resetData() {
    await clearAllStorage();
    await get().init();
  },

  async addActivity(message, type) {
    const a: Activity = { id: uid(), message, type, date: new Date().toISOString() };
    await activityService.create(a);
    set((s) => ({ activities: [a, ...s.activities].slice(0, 30) }));
  },

  // ---------- Clientes ----------
  async createClient(c) {
    const client: Client = { ...c, id: uid(), createdAt: new Date().toISOString() };
    await clientService.create(client);
    set((s) => ({ clients: [client, ...s.clients] }));
    get().addActivity(`Novo cliente cadastrado: ${client.name}`, "client");
    return client;
  },
  async updateClient(id, patch) {
    await clientService.update(id, patch);
    set((s) => ({ clients: s.clients.map((c) => (c.id === id ? { ...c, ...patch } : c)) }));
  },
  async deleteClient(id) {
    await clientService.remove(id);
    set((s) => ({ clients: s.clients.filter((c) => c.id !== id) }));
  },

  // ---------- Serviços ----------
  async updateService(id, patch) {
    await serviceService.update(id, patch);
    set((s) => ({ services: s.services.map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  },
  async createService(sv) {
    const service: Service = { ...sv, id: uid() };
    await serviceService.create(service);
    set((s) => ({ services: [...s.services, service] }));
    return service;
  },
  async deleteService(id) {
    await serviceService.remove(id);
    set((s) => ({ services: s.services.filter((x) => x.id !== id) }));
  },

  // ---------- Orçamentos ----------
  async createQuote(q) {
    const quote: Quote = {
      ...q,
      id: uid(),
      number: nextNumber(get().quotes),
      token: genToken(),
      createdAt: new Date().toISOString(),
    };
    await quoteService.create(quote);
    set((s) => ({ quotes: [quote, ...s.quotes] }));
    get().addActivity(`Orçamento #${quote.number} criado para ${quote.clientName}`, "quote");
    return quote;
  },
  async updateQuote(id, patch) {
    await quoteService.update(id, patch);
    set((s) => ({ quotes: s.quotes.map((q) => (q.id === id ? { ...q, ...patch } : q)) }));
  },
  async deleteQuote(id) {
    await quoteService.remove(id);
    set((s) => ({ quotes: s.quotes.filter((q) => q.id !== id) }));
  },

  async rejectQuote(id) {
    await get().updateQuote(id, { status: "recusado" });
    const q = get().quotes.find((x) => x.id === id);
    if (q) get().addActivity(`${q.clientName} recusou o orçamento #${q.number}`, "quote");
  },

  /**
   * FLUXO PRINCIPAL DE APROVAÇÃO:
   * 1. Marca orçamento como aprovado
   * 2. Calcula os materiais necessários para a ordem de serviço
   * 3. Cria Ordem de Serviço
   * 4. Cria lançamentos financeiros (sinal + restante)
   */
  async approveQuote(id) {
    const state = get();
    const quote = state.quotes.find((q) => q.id === id);
    if (!quote) throw new Error("Orçamento não encontrado");
    if (quote.status === "aprovado") {
      const existing = state.workOrders.find((w) => w.quoteId === id);
      if (existing) return { workOrder: existing };
      throw new Error("Este orçamento já foi aprovado");
    }
    if (quote.status !== "pendente" && quote.status !== "rascunho") throw new Error("Este orçamento não pode ser aprovado");
    const client = state.clients.find((c) => c.id === quote.clientId);
    const approvedAt = new Date().toISOString();

    // Agrupa materiais para registrar a lista necessária na ordem de serviço.
    const agg = new Map<string, { qty: number; unit: string; name: string }>();
    quote.items.forEach((it) =>
      it.materials.forEach((m) => {
        const cur = agg.get(m.productId);
        agg.set(m.productId, { qty: (cur?.qty || 0) + m.quantity, unit: m.unit, name: m.productName });
      })
    );
    await state.updateQuote(id, { status: "aprovado", approvedAt });

    // 3. Ordem de serviço
    const workOrder = await state.createWorkOrder({
      quoteId: quote.id,
      quoteNumber: quote.number,
      clientId: quote.clientId,
      clientName: quote.clientName,
      address: client ? `${client.address}, ${client.number} — ${client.district}, ${client.city}/${client.state}` : "—",
      serviceName: quote.items.map((i) => i.serviceName).join(", "),
      team: "A definir",
      startDate: addDays(3),
      expectedEnd: addDays(10),
      status: "aguardando",
      materials: Array.from(agg.values()).map((v) => ({ productName: v.name, quantity: v.qty, unit: v.unit })),
      total: quote.total,
      notes: `Gerada automaticamente a partir do orçamento #${quote.number}.`,
    });

    // 4. Financeiro
    const down = +(quote.total * (quote.downPaymentPercent / 100)).toFixed(2);
    const rest = +(quote.total - down).toFixed(2);
    await state.createFinance({
      description: `Sinal ${quote.downPaymentPercent}% — Orçamento #${quote.number}`,
      clientId: quote.clientId,
      clientName: quote.clientName,
      type: "entrada",
      category: "servico",
      amount: down,
      dueDate: addDays(2),
      status: "pendente",
      quoteId: quote.id,
      workOrderId: workOrder.id,
    });
    await state.createFinance({
      description: `Restante ${100 - quote.downPaymentPercent}% — Orçamento #${quote.number}`,
      clientId: quote.clientId,
      clientName: quote.clientName,
      type: "entrada",
      category: "servico",
      amount: rest,
      dueDate: addDays(12),
      status: "pendente",
      quoteId: quote.id,
      workOrderId: workOrder.id,
    });

    await state.addActivity(`${quote.clientName} aprovou o orçamento #${quote.number}`, "quote");
    await state.addActivity(`Nova obra ${workOrder.number} criada automaticamente`, "order");
    return { workOrder };
  },

  // ---------- Obras ----------
  async createWorkOrder(w) {
    const now = new Date().toISOString();
    const wo: WorkOrder = {
      ...w,
      id: uid(),
      number: nextNumber(get().workOrders, "OS-"),
      createdAt: now,
      timeline: [{ id: uid(), date: now, title: "OS criada — aguardando início", status: "aguardando", description: w.notes }],
    };
    await workOrderService.create(wo);
    set((s) => ({ workOrders: [wo, ...s.workOrders] }));
    return wo;
  },
  async updateWorkOrder(id, patch) {
    await workOrderService.update(id, patch);
    set((s) => ({ workOrders: s.workOrders.map((w) => (w.id === id ? { ...w, ...patch } : w)) }));
  },
  async updateWorkOrderStatus(id, status, note) {
    const wo = get().workOrders.find((w) => w.id === id);
    if (!wo) return;
    const titles: Record<WorkOrderStatus, string> = {
      aguardando: "Aguardando início",
      agendada: "Obra agendada",
      em_andamento: "Obra iniciada",
      pausada: "Obra pausada",
      concluida: "Obra concluída",
      cancelada: "Obra cancelada",
    };
    const timeline = [...wo.timeline, { id: uid(), date: new Date().toISOString(), title: titles[status], status, description: note }];
    await get().updateWorkOrder(id, { status, timeline });
    get().addActivity(`${wo.number} — ${titles[status]}`, "order");
  },

  // ---------- Financeiro ----------
  async createFinance(f) {
    const entry: FinanceEntry = { ...f, id: uid() };
    await financeService.create(entry);
    set((s) => ({ finance: [entry, ...s.finance] }));
  },
  async updateFinance(id, patch) {
    await financeService.update(id, patch);
    set((s) => ({ finance: s.finance.map((f) => (f.id === id ? { ...f, ...patch } : f)) }));
  },
  async markPaid(id) {
    const f = get().finance.find((x) => x.id === id);
    await get().updateFinance(id, { status: "pago", paidAt: new Date().toISOString() });
    if (f) get().addActivity(`${f.type === "entrada" ? "Pagamento recebido" : "Pagamento efetuado"} — ${f.description}`, "finance");
  },
  async deleteFinance(id) {
    await financeService.remove(id);
    set((s) => ({ finance: s.finance.filter((f) => f.id !== id) }));
  },

  // ---------- Configurações ----------
  async saveSettings(st) {
    await settingsService.save(st);
    document.documentElement.classList.toggle("dark", st.theme === "dark");
    set({ settings: st });
  },
  setTheme(t) {
    const st = { ...get().settings, theme: t };
    document.documentElement.classList.toggle("dark", t === "dark");
    settingsService.save(st);
    set({ settings: st });
  },
}));

export function useAppStoreShallow<T extends object>(selector: (state: AppState) => T): T {
  return useAppStore(useShallow(selector));
}

