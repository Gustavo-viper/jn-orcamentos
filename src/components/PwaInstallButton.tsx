import { useEffect, useState } from "react";
import { Download, X } from "lucide-react";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export function PwaInstallButton() {
  const [installPrompt, setInstallPrompt] = useState<InstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  useEffect(() => {
    const standalone = window.matchMedia("(display-mode: standalone)").matches
      || (navigator as Navigator & { standalone?: boolean }).standalone === true;
    setInstalled(standalone);

    const onBeforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setShowHelp(false);
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  async function install() {
    if (!installPrompt) {
      setShowHelp((visible) => !visible);
      return;
    }
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    setInstallPrompt(null);
    if (choice.outcome === "accepted") setInstalled(true);
  }

  if (installed || window.location.protocol === "jn-app:") return null;
  const isAppleMobile = /iphone|ipad|ipod/i.test(navigator.userAgent);

  return (
    <div className="fixed bottom-4 right-4 z-[70] flex max-w-[calc(100vw-2rem)] flex-col items-end gap-2">
      {showHelp && (
        <div role="status" className="glass-strong max-w-xs rounded-2xl p-4 text-sm text-main shadow-xl">
          <div className="mb-2 flex items-center justify-between gap-3 font-semibold">
            <span>Instalar J&N Orçamentos</span>
            <button type="button" onClick={() => setShowHelp(false)} aria-label="Fechar instruções" className="rounded-lg p-1 hover:bg-black/5">
              <X className="h-4 w-4" />
            </button>
          </div>
          <p className="text-muted">
            {isAppleMobile
              ? "No Safari, toque em Compartilhar e escolha ‘Adicionar à Tela de Início’."
              : "No menu do navegador, escolha ‘Instalar J&N Orçamentos’ ou ‘Instalar app’."}
          </p>
        </div>
      )}
      <button
        type="button"
        onClick={() => void install()}
        className="coffee-gradient inline-flex min-h-11 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold text-white shadow-lg"
        aria-label="Instalar J&N Orçamentos no dispositivo"
      >
        <Download className="h-4 w-4" />
        Instalar app
      </button>
    </div>
  );
}

