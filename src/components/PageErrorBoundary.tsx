import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button, GlassCard } from "@/components/ui";

interface PageErrorBoundaryProps {
  children: ReactNode;
  resetKey: string;
}

interface PageErrorBoundaryState {
  hasError: boolean;
}

export class PageErrorBoundary extends Component<PageErrorBoundaryProps, PageErrorBoundaryState> {
  state: PageErrorBoundaryState = { hasError: false };

  static getDerivedStateFromError(): PageErrorBoundaryState {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Erro ao abrir uma aba do sistema:", error, info.componentStack);
  }

  componentDidUpdate(previousProps: PageErrorBoundaryProps) {
    if (this.state.hasError && previousProps.resetKey !== this.props.resetKey) {
      this.setState({ hasError: false });
    }
  }

  render() {
    if (this.state.hasError) {
      return (
        <GlassCard className="mx-auto mt-8 max-w-xl p-6 text-center" role="alert">
          <h2 className="font-display text-xl font-semibold text-main">Não foi possível abrir esta tela</h2>
          <p className="mt-2 text-sm text-muted">A navegação continua disponível. Recarregue o app para tentar novamente.</p>
          <Button className="mt-5" variant="gold" onClick={() => window.location.reload()}>Recarregar app</Button>
        </GlassCard>
      );
    }

    return this.props.children;
  }
}

