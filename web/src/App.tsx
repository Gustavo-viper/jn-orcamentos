import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import type { Action, Module } from '@jn/shared';
import { useAuth } from './lib/auth';
import { Layout } from './components/Layout';
import { ConfirmHost, EmptyState, LoadingBlock, ToastHost } from './components/ui';
import { UpdatePrompt } from './components/UpdatePrompt';
import { ShieldOff } from 'lucide-react';

// carregamento sob demanda das páginas
const Login = lazy(() => import('./pages/auth/Login'));
const ResetPassword = lazy(() => import('./pages/auth/ResetPassword'));
const Dashboard = lazy(() => import('./pages/Dashboard'));
const ClientsList = lazy(() => import('./pages/clients/ClientsList'));
const ClientDetail = lazy(() => import('./pages/clients/ClientDetail'));
const Services = lazy(() => import('./pages/services/Services'));
const Products = lazy(() => import('./pages/products/Products'));
const ProductDetail = lazy(() => import('./pages/products/ProductDetail'));
const QuotesList = lazy(() => import('./pages/quotes/QuotesList'));
const QuoteEditor = lazy(() => import('./pages/quotes/QuoteEditor'));
const QuoteView = lazy(() => import('./pages/quotes/QuoteView'));
const JobsList = lazy(() => import('./pages/jobs/JobsList'));
const JobDetail = lazy(() => import('./pages/jobs/JobDetail'));
const Finance = lazy(() => import('./pages/finance/Finance'));
const Reports = lazy(() => import('./pages/reports/Reports'));
const SettingsPage = lazy(() => import('./pages/settings/Settings'));
const Portal = lazy(() => import('./pages/portal/Portal'));

function Guard({ module, action = 'view', children }: { module: Module; action?: Action; children: ReactNode }) {
  const { can } = useAuth();
  if (!can(module, action))
    return <EmptyState icon={<ShieldOff className="h-6 w-6" />} title="Acesso não permitido" description="Seu usuário não tem permissão para esta área. Fale com o administrador." />;
  return <>{children}</>;
}

function Private({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const loc = useLocation();
  if (!ready) return <LoadingBlock />;
  if (!user) return <Navigate to="/entrar" replace state={{ from: loc.pathname }} />;
  return <>{children}</>;
}

export function App() {
  const { user, can } = useAuth();
  return (
    <>
      <Suspense fallback={<LoadingBlock />}>
        <Routes>
          <Route path="/entrar" element={<Login />} />
          <Route path="/redefinir-senha" element={<ResetPassword />} />
          <Route path="/portal/:token" element={<Portal />} />
          <Route
            element={
              <Private>
                <Layout />
              </Private>
            }
          >
            <Route index element={can('dashboard') || !user ? <Guard module="dashboard"><Dashboard /></Guard> : <Navigate to={can('quotes') ? '/orcamentos' : '/configuracoes'} replace />} />
            <Route path="clientes" element={<Guard module="clients"><ClientsList /></Guard>} />
            <Route path="clientes/:id" element={<Guard module="clients"><ClientDetail /></Guard>} />
            <Route path="servicos" element={<Guard module="services"><Services /></Guard>} />
            <Route path="estoque" element={<Guard module="products"><Products /></Guard>} />
            <Route path="estoque/:id" element={<Guard module="products"><ProductDetail /></Guard>} />
            <Route path="orcamentos" element={<Guard module="quotes"><QuotesList /></Guard>} />
            <Route path="orcamentos/novo" element={<Guard module="quotes" action="create"><QuoteEditor /></Guard>} />
            <Route path="orcamentos/:id" element={<Guard module="quotes"><QuoteView /></Guard>} />
            <Route path="orcamentos/:id/editar" element={<Guard module="quotes" action="edit"><QuoteEditor /></Guard>} />
            <Route path="obras" element={<Guard module="jobs"><JobsList /></Guard>} />
            <Route path="obras/:id" element={<Guard module="jobs"><JobDetail /></Guard>} />
            <Route path="financeiro" element={<Guard module="finance"><Finance /></Guard>} />
            <Route path="relatorios" element={<Guard module="reports"><Reports /></Guard>} />
            <Route path="configuracoes" element={<SettingsPage />} />
            <Route path="*" element={<EmptyState title="Página não encontrada" description="O endereço acessado não existe." />} />
          </Route>
        </Routes>
      </Suspense>
      <ToastHost />
      <ConfirmHost />
      <UpdatePrompt />
    </>
  );
}
