import { useEffect } from "react";
import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AdminLayout } from "@/layouts/AdminLayout";
import { useAppStore } from "@/hooks/useAppStore";
import { Toaster } from "@/components/ui";
import { Logo } from "@/components/Logo";
import { AuthGate } from "@/components/AuthGate";
import DashboardPage from "@/pages/DashboardPage";
import CalculatorPage from "@/pages/CalculatorPage";
import QuotesPage from "@/pages/QuotesPage";
import QuoteDetailPage from "@/pages/QuoteDetailPage";
import ClientsPage from "@/pages/ClientsPage";
import ClientDetailPage from "@/pages/ClientDetailPage";
import ServicesPage from "@/pages/ServicesPage";
import WorkOrdersPage from "@/pages/WorkOrdersPage";
import FinancePage from "@/pages/FinancePage";
import ReportsPage from "@/pages/ReportsPage";
import SettingsPage from "@/pages/SettingsPage";
import PortalIndexPage from "@/pages/PortalIndexPage";
import PortalQuotePage from "@/pages/PortalQuotePage";
import NotFoundPage from "@/pages/NotFoundPage";

function SplashScreen() {
  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="glass rounded-3xl p-10 flex flex-col items-center gap-5 animate-fade-up">
        <Logo size="lg" />
        <div className="h-1.5 w-40 rounded-full bg-white/40 overflow-hidden">
          <div className="h-full w-1/2 gold-gradient rounded-full animate-[shimmer_1.2s_infinite_linear]" />
        </div>
        <p className="text-xs text-muted">Carregando sistema…</p>
      </div>
    </div>
  );
}

export default function App() {
  const { init, loaded } = useAppStore();
  useEffect(() => {
    init();
  }, [init]);

  if (!loaded) return <SplashScreen />;

  return (
    <HashRouter>
      <Toaster />
      <Routes>
        <Route path="/portal/orcamento/:token" element={<PortalQuotePage />} />
        <Route element={<AuthGate><AdminLayout /></AuthGate>}>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/dashboard" element={<DashboardPage />} />
          <Route path="/calculadora" element={<CalculatorPage />} />
          <Route path="/orcamentos" element={<QuotesPage />} />
          <Route path="/orcamentos/:id" element={<QuoteDetailPage />} />
          <Route path="/clientes" element={<ClientsPage />} />
          <Route path="/clientes/:id" element={<ClientDetailPage />} />
          <Route path="/servicos" element={<ServicesPage />} />
          <Route path="/obras" element={<WorkOrdersPage />} />
          <Route path="/obras/:id" element={<WorkOrdersPage />} />
          <Route path="/financeiro" element={<FinancePage />} />
          <Route path="/portal" element={<PortalIndexPage />} />
          <Route path="/relatorios" element={<ReportsPage />} />
          <Route path="/configuracoes" element={<SettingsPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Route>
      </Routes>
    </HashRouter>
  );
}
