import { Button, GlassCard } from "@/components/ui";
import { Compass } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function NotFoundPage() {
  const navigate = useNavigate();
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <GlassCard strong className="p-10 text-center max-w-md animate-fade-up">
        <Compass className="h-12 w-12 mx-auto text-champagne-500 mb-3" />
        <p className="font-display text-5xl font-bold text-main">404</p>
        <h1 className="font-display text-xl font-semibold text-main mt-2">Página não encontrada</h1>
        <p className="text-sm text-muted mt-1">O endereço acessado não existe no sistema.</p>
        <Button variant="gold" className="mt-5" onClick={() => navigate("/dashboard")}>Ir para o Dashboard</Button>
      </GlassCard>
    </div>
  );
}
