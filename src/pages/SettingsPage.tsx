import { Button, ConfirmModal, Field, GlassCard, Input, PageHeader, Textarea } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import type { CompanySettings } from "@/types";
import { cn } from "@/utils/cn";
import { getOfflineStatus, syncPending, type OfflineStatus } from "@/services/offlineService";
import { Building2, Cloud, CloudOff, Database, FileText, Moon, Palette, RefreshCw, RotateCcw, Save, Sun } from "lucide-react";
import { useEffect, useState } from "react";

export default function SettingsPage() {
  const { settings, saveSettings, resetData } = useAppStoreShallow((state) => ({ settings: state.settings, saveSettings: state.saveSettings, resetData: state.resetData }));
  const [f, setF] = useState<CompanySettings>(settings);
  const [tab, setTab] = useState<"empresa" | "orcamento" | "aparencia" | "dados">("empresa");
  const [busy, setBusy] = useState(false);
  const [reset, setReset] = useState(false);
  const [syncStatus, setSyncStatus] = useState<OfflineStatus | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  useEffect(() => setF(settings), [settings]);
  useEffect(() => {
    let mounted = true;
    const refresh = async () => {
      const next = await getOfflineStatus();
      if (mounted) setSyncStatus(next);
    };
    void refresh();
    const timer = window.setInterval(() => { void refresh(); }, 5_000);
    window.addEventListener("online", refresh);
    window.addEventListener("focus", refresh);
    return () => {
      mounted = false;
      window.clearInterval(timer);
      window.removeEventListener("online", refresh);
      window.removeEventListener("focus", refresh);
    };
  }, []);

  const set = (k: keyof CompanySettings) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF((x) => ({ ...x, [k]: e.target.type === "number" ? Number(e.target.value) : e.target.value }));
  const save = async () => { setBusy(true); await saveSettings(f); setBusy(false); toast.success("Configurações salvas"); };
  const syncNow = async () => {
    setSyncBusy(true);
    try {
      await syncPending();
      setSyncStatus(await getOfflineStatus());
    } finally {
      setSyncBusy(false);
    }
  };

  const tabs = [{ k: "empresa", l: "Empresa", i: Building2 }, { k: "orcamento", l: "Orçamento", i: FileText }, { k: "aparencia", l: "Aparência", i: Palette }, { k: "dados", l: "Dados", i: Database }] as const;

  return (
    <div>
      <PageHeader title="Configurações" subtitle="Dados da empresa, padrões de orçamento e aparência" actions={<Button variant="gold" icon={Save} loading={busy} onClick={save}>Salvar</Button>} />
      <div className="grid lg:grid-cols-4 gap-4">
        <GlassCard className="p-3 space-y-1 h-fit">{tabs.map((t) => <button key={t.k} onClick={() => setTab(t.k)} className={cn("w-full flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium cursor-pointer", tab === t.k ? "coffee-gradient text-white shadow-md" : "text-main hover:bg-white/50 dark:hover:bg-white/10")}><t.i className="h-4 w-4" />{t.l}</button>)}</GlassCard>

        <GlassCard className="p-5 lg:col-span-3">
          {tab === "empresa" && (
            <div className="grid sm:grid-cols-2 gap-4">
              <div className="sm:col-span-2 flex items-center gap-4 mb-2">
                <div className="gold-gradient h-16 w-16 rounded-2xl flex items-center justify-center font-display font-bold text-xl text-coffee-950">{f.logoText}</div>
                <Field label="Texto do logo" hint="Upload de imagem será habilitado na Fase 2"><Input value={f.logoText} onChange={set("logoText")} maxLength={4} className="w-32" /></Field>
              </div>
              <Field label="Nome da empresa" className="sm:col-span-2"><Input value={f.name} onChange={set("name")} /></Field>
              <Field label="CPF / CNPJ"><Input value={f.document} onChange={set("document")} /></Field>
              <Field label="E-mail"><Input value={f.email} onChange={set("email")} /></Field>
              <Field label="Telefone"><Input value={f.phone} onChange={set("phone")} /></Field>
              <Field label="WhatsApp"><Input value={f.whatsapp} onChange={set("whatsapp")} /></Field>
              <Field label="Endereço" className="sm:col-span-2"><Input value={f.address} onChange={set("address")} /></Field>
              <Field label="Cidade"><Input value={f.city} onChange={set("city")} /></Field>
              <div className="grid grid-cols-2 gap-4"><Field label="Estado"><Input value={f.state} onChange={set("state")} maxLength={2} /></Field><Field label="CEP"><Input value={f.zip} onChange={set("zip")} /></Field></div>
            </div>
          )}
          {tab === "orcamento" && (
            <div className="grid sm:grid-cols-3 gap-4">
              <Field label="Validade padrão (dias)"><Input type="number" value={f.quoteValidityDays} onChange={set("quoteValidityDays")} /></Field>
              <Field label="Margem padrão (%)"><Input type="number" value={f.defaultMargin} onChange={set("defaultMargin")} /></Field>
              <Field label="Percentual de entrada (%)"><Input type="number" value={f.downPaymentPercent} onChange={set("downPaymentPercent")} /></Field>
              <Field label="Condições de pagamento" className="sm:col-span-3"><Textarea value={f.paymentTerms} onChange={set("paymentTerms")} /></Field>
              <div className="sm:col-span-3 glass-subtle rounded-2xl p-4 text-sm text-muted">Exemplo com R$ 3.000,00: sinal de <b className="text-main">R$ {(3000 * f.downPaymentPercent / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b> e restante de <b className="text-main">R$ {(3000 * (100 - f.downPaymentPercent) / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</b>.</div>
            </div>
          )}
          {tab === "aparencia" && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-3">Tema</p>
              <div className="grid sm:grid-cols-2 gap-3 max-w-lg">
                {(["light", "dark"] as const).map((t) => (
                  <button key={t} onClick={() => { setF({ ...f, theme: t }); saveSettings({ ...f, theme: t }); }} className={cn("rounded-2xl p-5 text-left cursor-pointer transition-all border-2", f.theme === t ? "border-champagne-500 glass-strong" : "border-transparent glass-subtle")}>
                    {t === "light" ? <Sun className="h-6 w-6 text-champagne-500 mb-2" /> : <Moon className="h-6 w-6 text-coffee-500 mb-2" />}
                    <p className="font-semibold text-main">{t === "light" ? "Modo claro" : "Modo escuro"}</p>
                    <p className="text-xs text-muted">{t === "light" ? "Vidro claro com tons de champagne." : "Vidro escuro com tons café."}</p>
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted mt-4">O estilo "glass" (vidro fosco) é aplicado em todos os componentes do sistema.</p>
            </div>
          )}
          {tab === "dados" && (
            <div className="space-y-4">
              <div className="glass-subtle rounded-2xl p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    {syncStatus?.apiConfigured && syncStatus.apiOnline ? <Cloud className="h-5 w-5 text-emerald-600" /> : <CloudOff className="h-5 w-5 text-amber-600" />}
                    <p className="font-semibold text-main">Sincronização com o Railway</p>
                  </div>
                  <span className={cn("rounded-full px-3 py-1 text-xs font-semibold", syncStatus?.apiConfigured && syncStatus.apiOnline ? "bg-emerald-500/10 text-emerald-700" : "bg-amber-500/10 text-amber-700")}>
                    {!syncStatus ? "Verificando conexão…" : !syncStatus.apiConfigured ? "API não configurada" : syncStatus.apiOnline ? "Conectado" : "Sem conexão"}
                  </span>
                </div>
                <p className="text-sm text-muted">
                  {!syncStatus ? "Verificando se esta instalação alcança o banco compartilhado." : !syncStatus.apiConfigured ? "Esta instalação não detectou a URL da API. Reinstale a versão mais recente para habilitar a sincronização." : syncStatus.apiOnline ? syncStatus.pending ? `${syncStatus.pending} alteração(ões) aguardando envio ao Railway.` : "As alterações deste dispositivo são enviadas ao Railway e compartilhadas com os outros usuários." : "Os dados continuam salvos neste dispositivo. O envio será retomado quando o Railway voltar a responder."}
                </p>
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-black/5 pt-3 text-xs text-muted dark:border-white/10">
                  <span>Última sincronização: {syncStatus?.lastSyncAt ? new Date(syncStatus.lastSyncAt).toLocaleString("pt-BR") : "nenhuma registrada neste dispositivo"}</span>
                  <Button size="sm" variant="secondary" icon={RefreshCw} loading={syncBusy} disabled={!syncStatus?.apiConfigured} onClick={() => { void syncNow(); }}>Sincronizar agora</Button>
                </div>
              </div>
              <div className="glass-subtle rounded-2xl p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"><div><p className="font-semibold text-main">Restaurar dados de demonstração</p><p className="text-sm text-muted">Apaga as alterações locais e recarrega os mocks originais.</p></div><Button variant="danger" icon={RotateCcw} onClick={() => setReset(true)}>Restaurar</Button></div>
            </div>
          )}
        </GlassCard>
      </div>
      <ConfirmModal open={reset} onClose={() => setReset(false)} danger confirmLabel="Restaurar" title="Restaurar dados de demonstração?" description="Todas as alterações feitas nos testes serão perdidas." onConfirm={async () => { await resetData(); setReset(false); toast.success("Dados restaurados"); }} />
    </div>
  );
}

