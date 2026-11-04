import { useEffect, useState } from "react";
import { Cloud, CloudOff, RefreshCw } from "lucide-react";
import { getOfflineStatus, syncPending, type OfflineStatus } from "@/services/offlineService";
import { cn } from "@/utils/cn";

export function ConnectionStatus() {
  const [status, setStatus] = useState<OfflineStatus>({ online: typeof navigator === "undefined" || navigator.onLine, pending: 0, lastSyncAt: null, apiConfigured: false, apiOnline: false });

  useEffect(() => {
    let mounted = true;
    let refreshing = false;
    const refresh = async () => {
      if (refreshing || document.visibilityState !== "visible") return;
      refreshing = true;
      try {
        const next = await getOfflineStatus();
        if (mounted) setStatus(next);
      } finally {
        refreshing = false;
      }
    };
    const onChange = () => { void refresh(); };
    window.addEventListener("online", onChange);
    window.addEventListener("offline", onChange);
    window.addEventListener("focus", onChange);
    document.addEventListener("visibilitychange", onChange);
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    void refresh();
    return () => {
      mounted = false;
      window.removeEventListener("online", onChange);
      window.removeEventListener("offline", onChange);
      window.removeEventListener("focus", onChange);
      document.removeEventListener("visibilitychange", onChange);
      window.clearInterval(timer);
    };
  }, []);

  const label = !status.online
    ? "Offline — alterações ficam salvas neste dispositivo"
    : status.apiConfigured && !status.apiOnline
      ? "Sem conexão com o banco — alterações ficam neste dispositivo"
    : status.pending > 0
      ? `${status.pending} alteração(ões) aguardando sincronização`
      : status.apiConfigured ? "Online — sincronizado com o banco" : "Online — modo local";

  return (
    <button
      type="button"
      title={label}
      onClick={() => { void syncPending().then(getOfflineStatus).then(setStatus).catch(() => undefined); }}
      className={cn("hidden sm:flex items-center gap-2 rounded-xl px-2.5 py-1.5 text-[11px] font-medium transition", !status.online || (status.apiConfigured && !status.apiOnline) ? "bg-amber-500/10 text-amber-700 dark:text-amber-300" : status.pending ? "bg-blue-500/10 text-blue-700 dark:text-blue-300" : "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300")}
    >
      {!status.online || (status.apiConfigured && !status.apiOnline) ? <CloudOff className="h-3.5 w-3.5" /> : status.pending ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Cloud className="h-3.5 w-3.5" />}
      <span>{label}</span>
    </button>
  );
}

