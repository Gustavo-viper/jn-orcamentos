import { useEffect, useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  BarChart3,
  Boxes,
  Calculator,
  ClipboardList,
  CloudOff,
  FileText,
  HardHat,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  Plus,
  RefreshCw,
  Settings,
  Sun,
  Users,
  Wallet,
  Wrench,
  X,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import type { Module } from '@jn/shared';
import { useAuth, useSyncState } from '../lib/auth';
import { usePendingOps } from '../lib/data';
import { syncNow } from '../lib/sync';
import { useTheme } from '../lib/theme';
import { relativeTime } from '../lib/format';
import { clsx } from './ui';
import { Logo } from './Logo';

interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  module: Module | null;
  action?: 'view' | 'create';
  end?: boolean;
}

const NAV: NavItem[] = [
  { to: '/', label: 'Painel', icon: <LayoutDashboard className="h-[18px] w-[18px]" />, module: 'dashboard', end: true },
  { to: '/clientes', label: 'Clientes', icon: <Users className="h-[18px] w-[18px]" />, module: 'clients' },
  { to: '/orcamentos/novo', label: 'Calculadora', icon: <Calculator className="h-[18px] w-[18px]" />, module: 'quotes', action: 'create', end: true },
  { to: '/orcamentos', label: 'Orçamentos', icon: <FileText className="h-[18px] w-[18px]" />, module: 'quotes' },
  { to: '/obras', label: 'Obras / OS', icon: <HardHat className="h-[18px] w-[18px]" />, module: 'jobs' },
  { to: '/financeiro', label: 'Financeiro', icon: <Wallet className="h-[18px] w-[18px]" />, module: 'finance' },
  { to: '/servicos', label: 'Serviços', icon: <Wrench className="h-[18px] w-[18px]" />, module: 'services' },
  { to: '/estoque', label: 'Produtos e estoque', icon: <Boxes className="h-[18px] w-[18px]" />, module: 'products' },
  { to: '/relatorios', label: 'Relatórios', icon: <BarChart3 className="h-[18px] w-[18px]" />, module: 'reports' },
  { to: '/configuracoes', label: 'Configurações', icon: <Settings className="h-[18px] w-[18px]" />, module: null },
];

export function SyncBadge({ compact }: { compact?: boolean }) {
  const s = useSyncState();
  const ops = usePendingOps();
  const pending = ops.filter((o) => o.status === 'pending').length;
  const errors = ops.filter((o) => o.status === 'error').length;
  const navigate = useNavigate();
  let tone = 'text-emerald-600 dark:text-emerald-400';
  let icon = <CheckCircle2 className="h-4 w-4" />;
  let text = s.lastSync ? `Sincronizado ${relativeTime(s.lastSync)}` : 'Aguardando sincronização';
  if (!s.online) {
    tone = 'text-amber-600 dark:text-amber-400';
    icon = <CloudOff className="h-4 w-4" />;
    text = pending ? `Offline · ${pending} pendente(s)` : 'Offline — dados salvos no aparelho';
  } else if (s.syncing) {
    tone = 'text-navy-500 dark:text-navy-200';
    icon = <RefreshCw className="h-4 w-4 animate-spin" />;
    text = 'Sincronizando...';
  } else if (errors) {
    tone = 'text-red-600 dark:text-red-400';
    icon = <AlertTriangle className="h-4 w-4" />;
    text = `${errors} alteração(ões) rejeitada(s)`;
  } else if (pending) {
    tone = 'text-navy-500 dark:text-navy-200';
    icon = <RefreshCw className="h-4 w-4" />;
    text = `${pending} pendente(s)`;
  }
  return (
    <button
      type="button"
      title="Ver status da sincronização"
      onClick={() => (errors ? navigate('/configuracoes?aba=sistema') : void syncNow())}
      className={clsx('flex min-w-0 items-center gap-2 rounded-lg px-2 py-1 text-xs font-medium transition hover:bg-graphite-100 dark:hover:bg-white/5', tone)}
    >
      {icon}
      {!compact && <span className="hidden truncate sm:inline">{text}</span>}
    </button>
  );
}

function ThemeButton() {
  const [pref, setPref] = useTheme();
  const dark = document.documentElement.classList.contains('dark');
  return (
    <button
      type="button"
      onClick={() => setPref(dark ? 'light' : 'dark')}
      className="flex h-9 w-9 items-center justify-center rounded-xl text-graphite-500 transition hover:bg-graphite-100 dark:text-graphite-300 dark:hover:bg-white/5"
      aria-label={dark ? 'Ativar modo claro' : 'Ativar modo escuro'}
      title={pref === 'system' ? 'Tema do sistema' : dark ? 'Modo escuro' : 'Modo claro'}
    >
      {dark ? <Sun className="h-[18px] w-[18px]" /> : <Moon className="h-[18px] w-[18px]" />}
    </button>
  );
}

export function Layout() {
  const { user, can, logout } = useAuth();
  const [moreOpen, setMoreOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  useEffect(() => setMoreOpen(false), [location.pathname]);
  const items = NAV.filter((n) => !n.module || can(n.module, n.action ?? 'view'));
  const initials = (user?.name ?? '?')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase();

  const linkCls = (to: string) => ({ isActive }: { isActive: boolean }) =>
    clsx(
      'group flex items-center gap-3 rounded-xl px-3 py-2.5 text-[14px] font-medium transition-all',
      isActive && !(to === '/orcamentos' && location.pathname.startsWith('/orcamentos/novo')) ? 'bg-white/10 text-white shadow-[inset_2px_0_0_var(--color-gold-400)]' : 'text-navy-100/70 hover:bg-white/5 hover:text-white',
    );

  const mobileMain: NavItem[] = [NAV[0], NAV[1], NAV[3]].filter((n) => !n.module || can(n.module));

  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Menu lateral (desktop) */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col bg-gradient-to-b from-navy-900 to-navy-950 lg:flex">
        <div className="px-5 pt-5 pb-3">
          <Logo className="h-auto w-full drop-shadow-[0_4px_12px_rgba(0,0,0,0.35)]" />
          <div className="mt-2 text-center text-[11px] font-medium tracking-[0.2em] text-gold-300/80 uppercase">Orçamentos</div>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-3" aria-label="Menu principal">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={linkCls(n.to)}>
              <span className="opacity-90">{n.icon}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t border-white/5 p-3">
          <div className="flex items-center gap-3 rounded-xl px-2 py-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gold-400/15 text-xs font-semibold text-gold-200">{initials}</div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium text-white">{user?.name}</div>
              <div className="truncate text-[11px] text-navy-200/60">{user?.role === 'admin' ? 'Administrador' : 'Funcionário'}</div>
            </div>
            <button onClick={() => void logout()} className="rounded-lg p-2 text-navy-200/70 hover:bg-white/5 hover:text-white" aria-label="Sair" title="Sair">
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* Barra superior */}
      <header className="sticky top-0 z-20 border-b border-graphite-200/60 bg-graphite-50/85 backdrop-blur-md dark:border-white/5 dark:bg-graphite-950/80">
        <div className="mx-auto flex h-14 max-w-7xl items-center gap-2 px-4 lg:h-16 lg:px-8" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
          <div className="flex items-center gap-2 lg:hidden">
            <span className="rounded-xl bg-gradient-to-b from-navy-900 to-navy-950 px-2 py-0.5 shadow-sm">
              <Logo className="h-9 w-auto" />
            </span>
          </div>
          <div className="flex-1" />
          <SyncBadge />
          <ThemeButton />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 pt-4 pb-28 sm:pt-6 lg:px-8 lg:pb-12">
        <Outlet />
      </main>

      {/* Navegação inferior (celular / tablet) */}
      <nav className="safe-bottom fixed inset-x-0 bottom-0 z-30 border-t border-graphite-200/70 bg-white/95 backdrop-blur-md lg:hidden dark:border-white/5 dark:bg-graphite-900/95" aria-label="Navegação">
        <div className="mx-auto grid h-16 max-w-lg grid-cols-5 items-center">
          {mobileMain.slice(0, 2).map((n) => (
            <BottomLink key={n.to} item={n} />
          ))}
          {can('quotes', 'create') ? (
            <div className="flex justify-center">
              <button
                onClick={() => navigate('/orcamentos/novo')}
                className="-mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 shadow-lg shadow-gold-500/30 transition active:scale-95"
                aria-label="Novo orçamento"
              >
                <Plus className="h-7 w-7" />
              </button>
            </div>
          ) : (
            <div />
          )}
          {mobileMain[2] ? <BottomLink item={mobileMain[2]} /> : <div />}
          <button onClick={() => setMoreOpen(true)} className="flex flex-col items-center gap-1 py-1 text-[11px] font-medium text-graphite-500 dark:text-graphite-400">
            <Menu className="h-5 w-5" />
            Mais
          </button>
        </div>
      </nav>

      {/* Menu "Mais" (celular) */}
      {moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-fade-in bg-navy-950/50" onClick={() => setMoreOpen(false)} />
          <div className="safe-bottom absolute inset-x-0 bottom-0 animate-slide-up rounded-t-3xl bg-white p-4 dark:bg-graphite-900">
            <div className="mb-3 flex items-center justify-between px-1">
              <div>
                <div className="text-sm font-semibold">{user?.name}</div>
                <div className="text-xs text-graphite-500">{user?.email}</div>
              </div>
              <button onClick={() => setMoreOpen(false)} className="rounded-lg p-2 text-graphite-500" aria-label="Fechar">
                <X className="h-5 w-5" />
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {items.map((n) => (
                <NavLink
                  key={n.to}
                  to={n.to}
                  end={n.end}
                  className={({ isActive }) =>
                    clsx('flex flex-col items-center gap-2 rounded-2xl px-2 py-3 text-center text-xs font-medium transition', isActive ? 'bg-navy-800 text-white dark:bg-gold-400 dark:text-navy-950' : 'bg-graphite-50 text-graphite-700 dark:bg-white/5 dark:text-graphite-200')
                  }
                >
                  {n.icon}
                  {n.label}
                </NavLink>
              ))}
              <button onClick={() => void logout()} className="flex flex-col items-center gap-2 rounded-2xl bg-red-50 px-2 py-3 text-xs font-medium text-red-700 dark:bg-red-500/10 dark:text-red-300">
                <LogOut className="h-[18px] w-[18px]" />
                Sair
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function BottomLink({ item }: { item: NavItem }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      className={({ isActive }) => clsx('flex flex-col items-center gap-1 py-1 text-[11px] font-medium transition', isActive ? 'text-navy-800 dark:text-gold-300' : 'text-graphite-500 dark:text-graphite-400')}
    >
      {item.icon}
      {item.label}
    </NavLink>
  );
}

export const ClipboardIcon = ClipboardList;
