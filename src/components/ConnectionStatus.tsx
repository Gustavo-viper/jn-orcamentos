import { useEffect, useState } from "react";
import { Wifi, WifiOff } from "lucide-react";
import { checkApiConnection } from "@/services/storage";

export function ConnectionStatus() {
  const [online, setOnline] = useState(() => typeof navigator === "undefined" || navigator.onLine);

  useEffect(() => {
    let mounted = true;
    let checking = false;
    const refresh = async () => {
      if (checking || document.visibilityState !== "visible") return;
      checking = true;
      const browserOnline = typeof navigator === "undefined" || navigator.onLine;
      let connected = browserOnline;
      try {
        // When an API is configured, confirm the server is reachable too.
        const apiConfigured = Boolean((import.meta.env.VITE_API_URL as string | undefined)?.trim());
        if (browserOnline && apiConfigured) connected = await checkApiConnection();
      } catch {
        connected = false;
      } finally {
        checking = false;
      }
      if (mounted) setOnline(connected);
    };
    const handleChange = () => {
      const browserOnline = typeof navigator === "undefined" || navigator.onLine;
      if (!browserOnline) setOnline(false);
      else void refresh();
    };
    window.addEventListener("online", handleChange);
    window.addEventListener("offline", handleChange);
    window.addEventListener("focus", handleChange);
    document.addEventListener("visibilitychange", handleChange);
    const timer = window.setInterval(() => { void refresh(); }, 15_000);
    void refresh();
    return () => {
      mounted = false;
      window.removeEventListener("online", handleChange);
      window.removeEventListener("offline", handleChange);
      window.removeEventListener("focus", handleChange);
      document.removeEventListener("visibilitychange", handleChange);
      window.clearInterval(timer);
    };
  }, []);

  return (
    <div
      role="status"
      aria-live="polite"
      title={online ? "Conexão com a internet e servidor disponível" : "Sem conexão com a internet ou servidor"}
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1.5 text-xs font-semibold ${online ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300" : "bg-red-500/10 text-red-700 dark:text-red-300"}`}
    >
      {online ? <Wifi className="h-3.5 w-3.5" /> : <WifiOff className="h-3.5 w-3.5" />}
      <span>{online ? "Online" : "Offline"}</span>
      <span className={`h-2 w-2 rounded-full ${online ? "bg-emerald-500" : "bg-red-500"}`} />
    </div>
  );
}
