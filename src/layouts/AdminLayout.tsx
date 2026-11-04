import { Logo } from "@/components/Logo";
import { Tooltip } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { cn } from "@/utils/cn";
import {
  BarChart3, Bell, Calculator, ClipboardList, FileText, Globe, HardHat, LayoutDashboard,
  LogOut, Menu, Moon, Search, Settings, Sun, Users, Wallet, X, Wrench,
} from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { relativeTime } from "@/utils/format";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { getCurrentUser, signOut } from "@/services/authService";

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard },
  { to: "/calculadora", label: "Calculadora", icon: Calculator },
  { to: "/orcamentos", label: "Orçamentos", icon: FileText },
  { to: "/clientes", label: "Clientes", icon: Users },
  { to: "/servicos", label: "Serviços", icon: Wrench },
  { to: "/obras", label: "Obras / OS", icon: HardHat },
  { to: "/financeiro", label: "Financeiro", icon: Wallet },
  { to: "/portal", label: "Portal do Cliente", icon: Globe },
  { to: "/relatorios", label: "Relatórios", icon: BarChart3 },
  { to: "/configuracoes", label: "Configurações", icon: Settings },
];

export function AdminLayout() {
  const [open, setOpen] = useState(false);
  const [notif, setNotif] = useState(false);
  const [search, setSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const user = getCurrentUser();
  const { settings, setTheme, activities, clients, quotes } = useAppStoreShallow((state) => ({ settings: state.settings, setTheme: state.setTheme, activities: state.activities, clients: state.clients, quotes: state.quotes }));

  useEffect(() => setOpen(false), [location.pathname]);

  const results = search.trim().length >= 2
    ? [
        ...clients.filter((c) => c.name.toLowerCase().includes(search.toLowerCase())).slice(0, 4).map((c) => ({ label: c.name, sub: "Cliente", to: `/clientes/${c.id}` })),
        ...quotes.filter((q) => q.number.includes(search) || q.clientName.toLowerCase().includes(search.toLowerCase())).slice(0, 4).map((q) => ({ label: `Orçamento #${q.number}`, sub: q.clientName, to: `/orcamentos/${q.id}` })),
      ]
    : [];

  const Sidebar = (
    <aside className="flex h-full flex-col">
      <div className="px-5 py-5 flex items-center justify-between">
        <Logo size="sm" />
        <button className="lg:hidden text-muted cursor-pointer" onClick={() => setOpen(false)} aria-label="Fechar menu"><X className="h-5 w-5" /></button>
      </div>
      <nav className="flex-1 px-3 space-y-1 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-all",
                isActive
                  ? "coffee-gradient text-white shadow-md shadow-coffee-900/25"
                  : "text-main hover:bg-white/50 dark:hover:bg-white/10"
              )
            }
          >
            <n.icon className="h-4.5 w-4.5 shrink-0" style={{ width: 18, height: 18 }} />
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="p-4">
        <div className="glass-subtle rounded-2xl p-3 text-xs text-muted">
          <p className="font-semibold text-main">Modo offline-first</p>
          <p>Dados salvos no dispositivo e prontos para sincronização.</p>
        </div>
      </div>
    </aside>
  );

  return (
    <div className="admin-layout min-h-screen flex">
      {/* Sidebar desktop */}
      <div className="admin-sidebar no-print hidden lg:block fixed inset-y-0 left-0 w-[260px] p-3 z-30">
        <div className="sidebar-glass rounded-3xl h-full">{Sidebar}</div>
      </div>

      {/* Sidebar mobile */}
      {open && (
        <div className="admin-sidebar no-print fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-coffee-950/40 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <div className="sidebar-glass absolute inset-y-0 left-0 w-[280px] rounded-r-3xl animate-slide-in">{Sidebar}</div>
        </div>
      )}

      {/* Main */}
      <div className="admin-main flex-1 lg:pl-[260px] flex flex-col min-w-0">
        {/* Topbar */}
        <header className="admin-topbar no-print sticky top-0 z-40 p-3 pb-0">
          <div className="glass rounded-2xl px-3 sm:px-4 py-2.5 flex items-center gap-2 sm:gap-3">
            <button className="lg:hidden rounded-xl p-2 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer" onClick={() => setOpen(true)} aria-label="Abrir menu">
              <Menu className="h-5 w-5 text-main" />
            </button>
            <div className="lg:hidden"><Logo size="sm" /></div>
            <div className="relative flex-1 hidden sm:block max-w-md ml-auto lg:ml-0">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar clientes, orçamentos..."
                className="input-glass pl-9 py-2"
              />
              {results.length > 0 && (
                <div className="glass-strong absolute top-full mt-2 w-full rounded-2xl p-2 z-50">
                  {results.map((r, i) => (
                    <button key={i} onClick={() => { navigate(r.to); setSearch(""); }} className="w-full text-left rounded-xl px-3 py-2 hover:bg-white/60 dark:hover:bg-white/10 cursor-pointer">
                      <p className="text-sm font-medium text-main">{r.label}</p>
                      <p className="text-xs text-muted">{r.sub}</p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div className="ml-auto flex items-center gap-1 sm:gap-2">
              <ConnectionStatus />
              <Tooltip label={settings.theme === "dark" ? "Modo claro" : "Modo escuro"}>
                <button onClick={() => setTheme(settings.theme === "dark" ? "light" : "dark")} className="rounded-xl p-2 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer" aria-label="Alternar tema">
                  {settings.theme === "dark" ? <Sun className="h-5 w-5 text-champagne-400" /> : <Moon className="h-5 w-5 text-coffee-700" />}
                </button>
              </Tooltip>
              <div className="relative">
                <button onClick={() => setNotif(!notif)} className="rounded-xl p-2 hover:bg-white/50 dark:hover:bg-white/10 relative cursor-pointer" aria-label="Notificações">
                  <Bell className="h-5 w-5 text-main" />
                  <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-red-500 ring-2 ring-white/70" />
                </button>
                {notif && (
                  <>
                    <div className="fixed inset-0 z-40" onClick={() => setNotif(false)} />
                    <div className="glass-strong absolute right-0 top-full mt-2 w-80 rounded-2xl p-3 z-50 animate-fade-up">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted px-2 pb-2">Notificações</p>
                      <div className="max-h-72 overflow-y-auto space-y-1">
                        {activities.slice(0, 6).map((a) => (
                          <div key={a.id} className="rounded-xl px-2 py-2 hover:bg-white/50 dark:hover:bg-white/10">
                            <p className="text-sm text-main">{a.message}</p>
                            <p className="text-xs text-muted">{relativeTime(a.date)}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </>
                )}
              </div>
              <button onClick={() => navigate("/configuracoes")} className="flex items-center gap-2 rounded-xl pl-1 pr-2 py-1 hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer">
                <div className="coffee-gradient h-8 w-8 rounded-full flex items-center justify-center text-white text-xs font-bold">{(user || "JN").slice(0, 2).toUpperCase()}</div>
                <div className="hidden md:block text-left leading-tight">
                  <p className="text-sm font-semibold text-main">{user || "J&N"}</p>
                  <p className="text-[11px] text-muted">Acesso local</p>
                </div>
              </button>
              <Tooltip label="Sair"><button onClick={() => { signOut(); window.location.reload(); }} className="rounded-xl p-2 hover:bg-white/50 dark:hover:bg-white/10" aria-label="Sair"><LogOut className="h-4 w-4 text-muted" /></button></Tooltip>
            </div>
          </div>
        </header>

        <main className="admin-main-content flex-1 min-w-0 p-3 sm:p-5 lg:p-6 pb-24 lg:pb-6">
          <div className="admin-main-inner min-w-0 max-w-[1400px] mx-auto">
            <Outlet />
          </div>
        </main>
      </div>
      {/* Mobile quick nav */}
      <MobileNav />
    </div>
  );
}

function MobileNav() {
  const items = [
    { to: "/dashboard", icon: LayoutDashboard, label: "Início" },
    { to: "/calculadora", icon: Calculator, label: "Calcular" },
    { to: "/orcamentos", icon: ClipboardList, label: "Orçam." },
    { to: "/clientes", icon: Users, label: "Clientes" },
    { to: "/financeiro", icon: Wallet, label: "Finan." },
  ];
  return (
    <div className="admin-mobile-nav no-print lg:hidden fixed bottom-3 inset-x-3 z-40">
      <div className="glass-strong rounded-2xl flex justify-around py-1.5">
        {items.map((i) => (
          <NavLink key={i.to} to={i.to} className={({ isActive }) => cn("flex flex-col items-center gap-0.5 px-2 py-1 rounded-xl text-[10px] font-medium", isActive ? "text-coffee-700 dark:text-champagne-300" : "text-muted")}>
            <i.icon className="h-5 w-5" />
            {i.label}
          </NavLink>
        ))}
      </div>
    </div>
  );
}

