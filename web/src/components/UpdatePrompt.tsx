import { useRegisterSW } from 'virtual:pwa-register/react';
import { RefreshCw } from 'lucide-react';
import { Button } from './ui';

/**
 * Aviso de nova versão do aplicativo. A atualização troca somente os arquivos do
 * aplicativo — os dados locais (IndexedDB) e a fila de sincronização são preservados.
 */
export function UpdatePrompt() {
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, reg) {
      if (reg) setInterval(() => reg.update().catch(() => undefined), 60 * 60_000);
    },
  });
  if (!needRefresh) return null;
  return (
    <div className="fixed inset-x-0 bottom-28 z-[70] flex justify-center px-4 lg:bottom-6">
      <div className="flex w-full max-w-md animate-slide-up items-center gap-3 rounded-2xl bg-navy-900 px-4 py-3 text-sm text-white shadow-2xl">
        <RefreshCw className="h-5 w-5 text-gold-300" />
        <span className="flex-1">Nova versão disponível. Seus dados estão preservados.</span>
        <Button size="sm" variant="ghost" className="text-white/70 hover:bg-white/10" onClick={() => setNeedRefresh(false)}>
          Depois
        </Button>
        <Button size="sm" variant="gold" onClick={() => void updateServiceWorker(true)}>
          Atualizar
        </Button>
      </div>
    </div>
  );
}
