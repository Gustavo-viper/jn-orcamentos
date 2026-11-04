import { cn } from "@/utils/cn";
import { AlertTriangle, CheckCircle2, Info, Loader2, X, XCircle, type LucideIcon } from "lucide-react";
import React, { useEffect } from "react";
import { useToastStore } from "@/hooks/useToast";

/* ---------------- Glass Card ---------------- */
export function GlassCard({
  className,
  children,
  strong,
  hover,
  ...rest
}: React.HTMLAttributes<HTMLDivElement> & { strong?: boolean; hover?: boolean }) {
  return (
    <div
      className={cn(
        strong ? "glass-strong" : "glass",
        "rounded-3xl",
        hover && "transition-all duration-200 hover:-translate-y-0.5 hover:shadow-xl",
        className
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/* ---------------- Button ---------------- */
type Variant = "primary" | "secondary" | "ghost" | "danger" | "success" | "gold" | "whatsapp";
type Size = "sm" | "md" | "lg";

export function Button({
  variant = "primary",
  size = "md",
  className,
  loading,
  icon: Icon,
  children,
  disabled,
  ...rest
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
  size?: Size;
  loading?: boolean;
  icon?: LucideIcon;
}) {
  const variants: Record<Variant, string> = {
    primary: "coffee-gradient text-white shadow-md shadow-coffee-900/20 hover:brightness-110",
    gold: "gold-gradient text-coffee-950 shadow-md shadow-champagne-500/30 hover:brightness-105 font-semibold",
    secondary: "glass text-main hover:bg-white/70 dark:hover:bg-white/10",
    ghost: "text-main hover:bg-white/50 dark:hover:bg-white/10",
    danger: "bg-red-600/90 text-white hover:bg-red-600 shadow-md shadow-red-900/20",
    success: "bg-emerald-600/90 text-white hover:bg-emerald-600 shadow-md shadow-emerald-900/20",
    whatsapp: "bg-[#25D366] text-white hover:brightness-105 shadow-md shadow-emerald-900/20",
  };
  const sizes: Record<Size, string> = {
    sm: "text-xs px-3 py-1.5 gap-1.5 rounded-lg",
    md: "text-sm px-4 py-2.5 gap-2 rounded-xl",
    lg: "text-base px-6 py-3.5 gap-2.5 rounded-2xl",
  };
  return (
    <button
      disabled={disabled || loading}
      className={cn(
        "inline-flex items-center justify-center font-medium transition-all duration-150 active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed disabled:active:scale-100 cursor-pointer",
        variants[variant],
        sizes[size],
        className
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : Icon && <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />}
      {children}
    </button>
  );
}

/* ---------------- Badge ---------------- */
type Tone = "neutral" | "success" | "warning" | "danger" | "info" | "gold" | "coffee";
export function Badge({ tone = "neutral", children, className, dot }: { tone?: Tone; children: React.ReactNode; className?: string; dot?: boolean }) {
  const tones: Record<Tone, string> = {
    neutral: "bg-stone-500/15 text-stone-700 dark:text-stone-300 border-stone-500/20",
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25",
    danger: "bg-red-500/15 text-red-700 dark:text-red-300 border-red-500/25",
    info: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/25",
    gold: "bg-champagne-400/25 text-champagne-600 dark:text-champagne-300 border-champagne-500/30",
    coffee: "bg-coffee-600/15 text-coffee-700 dark:text-coffee-200 border-coffee-600/25",
  };
  const dots: Record<Tone, string> = {
    neutral: "bg-stone-500", success: "bg-emerald-500", warning: "bg-amber-500", danger: "bg-red-500", info: "bg-sky-500", gold: "bg-champagne-500", coffee: "bg-coffee-600",
  };
  return (
    <span className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap", tones[tone], className)}>
      {dot && <span className={cn("h-1.5 w-1.5 rounded-full", dots[tone])} />}
      {children}
    </span>
  );
}

/* ---------------- Form controls ---------------- */
export function Field({ label, hint, children, className, required }: { label?: string; hint?: string; children: React.ReactNode; className?: string; required?: boolean }) {
  return (
    <label className={cn("flex flex-col gap-1.5", className)}>
      {label && (
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">
          {label} {required && <span className="text-red-500">*</span>}
        </span>
      )}
      {children}
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </label>
  );
}

export const Input = React.forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  ({ className, ...rest }, ref) => <input ref={ref} className={cn("input-glass", className)} {...rest} />
);
Input.displayName = "Input";

export function Select({ className, children, ...rest }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn("input-glass appearance-none bg-no-repeat pr-9", className)} style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%237a6554' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")", backgroundPosition: "right 0.75rem center" }} {...rest}>
      {children}
    </select>
  );
}

export function Textarea({ className, ...rest }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cn("input-glass min-h-[90px] resize-y", className)} {...rest} />;
}

/* ---------------- Modal ---------------- */
export function Modal({
  open,
  onClose,
  title,
  description,
  children,
  footer,
  size = "md",
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  description?: string;
  children?: React.ReactNode;
  footer?: React.ReactNode;
  size?: "sm" | "md" | "lg" | "xl";
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, onClose]);
  if (!open) return null;
  const sizes = { sm: "max-w-md", md: "max-w-lg", lg: "max-w-2xl", xl: "max-w-4xl" };
  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center p-0 sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-coffee-950/40 backdrop-blur-sm" onClick={onClose} />
      <div className={cn("glass-strong relative w-full rounded-t-3xl sm:rounded-3xl p-6 animate-fade-up max-h-[92vh] overflow-y-auto", sizes[size])}>
        <button onClick={onClose} className="absolute right-4 top-4 rounded-full p-1.5 text-muted hover:bg-white/50 dark:hover:bg-white/10 cursor-pointer" aria-label="Fechar">
          <X className="h-4 w-4" />
        </button>
        {title && <h3 className="font-display text-xl font-semibold text-main pr-8">{title}</h3>}
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
        {children && <div className="mt-5">{children}</div>}
        {footer && <div className="mt-6 flex flex-col-reverse sm:flex-row sm:justify-end gap-2">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmModal({
  open, onClose, onConfirm, title, description, confirmLabel = "Confirmar", danger, loading,
}: { open: boolean; onClose: () => void; onConfirm: () => void; title: string; description?: string; confirmLabel?: string; danger?: boolean; loading?: boolean }) {
  return (
    <Modal open={open} onClose={onClose} title={title} description={description} size="sm"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant={danger ? "danger" : "success"} onClick={onConfirm} loading={loading}>{confirmLabel}</Button>
      </>}
    />
  );
}

/* ---------------- Skeleton / Empty / Tooltip ---------------- */
export function Skeleton({ className }: { className?: string }) {
  return <div className={cn("skeleton h-4 w-full", className)} />;
}

export function EmptyState({ icon: Icon, title, description, action }: { icon: LucideIcon; title: string; description?: string; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-14 px-6">
      <div className="glass-subtle rounded-3xl p-5 mb-4">
        <Icon className="h-9 w-9 text-coffee-500" />
      </div>
      <h4 className="font-display text-lg font-semibold text-main">{title}</h4>
      {description && <p className="mt-1 text-sm text-muted max-w-sm">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Tooltip({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <span className="relative group inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full left-1/2 z-50 mb-2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-coffee-950 px-2.5 py-1 text-xs text-white opacity-0 shadow-lg transition-opacity group-hover:opacity-100">
        {label}
      </span>
    </span>
  );
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6 animate-fade-up">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-semibold text-main">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function StatCard({ icon: Icon, label, value, sub, tone = "coffee", onClick }: { icon: LucideIcon; label: string; value: string; sub?: string; tone?: "coffee" | "gold" | "green" | "red" | "blue"; onClick?: () => void }) {
  const tones = {
    coffee: "coffee-gradient text-white",
    gold: "gold-gradient text-coffee-950",
    green: "bg-emerald-600 text-white",
    red: "bg-red-600 text-white",
    blue: "bg-sky-600 text-white",
  };
  return (
    <GlassCard hover className={cn("p-5 flex items-start gap-4", onClick && "cursor-pointer")} onClick={onClick}>
      <div className={cn("rounded-2xl p-3 shadow-md shrink-0", tones[tone])}>
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted truncate">{label}</p>
        <p className="mt-1 font-display text-2xl font-semibold text-main truncate">{value}</p>
        {sub && <p className="text-xs text-muted mt-0.5">{sub}</p>}
      </div>
    </GlassCard>
  );
}

/* ---------------- Table wrapper ---------------- */
export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto -mx-2 px-2", className)}>
      <table className="w-full text-sm min-w-[640px]">{children}</table>
    </div>
  );
}
export function Th({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <th className={cn("text-left text-xs font-semibold uppercase tracking-wide text-muted py-3 px-3 border-b border-white/40 dark:border-white/10", className)}>{children}</th>;
}
export function Td({ children, className }: { children?: React.ReactNode; className?: string }) {
  return <td className={cn("py-3 px-3 border-b border-white/30 dark:border-white/5 text-main align-middle", className)}>{children}</td>;
}

/* ---------------- Toaster ---------------- */
export function Toaster() {
  const { toasts, remove } = useToastStore();
  const icons = { success: CheckCircle2, error: XCircle, info: Info, warning: AlertTriangle };
  const colors = { success: "text-emerald-600", error: "text-red-600", info: "text-sky-600", warning: "text-amber-600" };
  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 w-[calc(100%-2rem)] max-w-sm pointer-events-none">
      {toasts.map((t) => {
        const I = icons[t.type];
        return (
          <div key={t.id} className="glass-strong rounded-2xl p-4 flex items-start gap-3 animate-slide-in pointer-events-auto">
            <I className={cn("h-5 w-5 shrink-0 mt-0.5", colors[t.type])} />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-main">{t.title}</p>
              {t.message && <p className="text-xs text-muted mt-0.5">{t.message}</p>}
            </div>
            <button onClick={() => remove(t.id)} className="text-muted hover:text-main cursor-pointer"><X className="h-4 w-4" /></button>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Status helpers ---------------- */
export const quoteStatusMeta: Record<string, { label: string; tone: Tone }> = {
  rascunho: { label: "Rascunho", tone: "neutral" },
  pendente: { label: "Pendente", tone: "warning" },
  aprovado: { label: "Aprovado", tone: "success" },
  recusado: { label: "Recusado", tone: "danger" },
  expirado: { label: "Expirado", tone: "neutral" },
};
export const orderStatusMeta: Record<string, { label: string; tone: Tone }> = {
  aguardando: { label: "Aguardando início", tone: "neutral" },
  agendada: { label: "Agendada", tone: "info" },
  em_andamento: { label: "Em andamento", tone: "gold" },
  pausada: { label: "Pausada", tone: "warning" },
  concluida: { label: "Concluída", tone: "success" },
  cancelada: { label: "Cancelada", tone: "danger" },
};
export const financeStatusMeta: Record<string, { label: string; tone: Tone }> = {
  pendente: { label: "Pendente", tone: "warning" },
  pago: { label: "Pago", tone: "success" },
  atrasado: { label: "Atrasado", tone: "danger" },
  cancelado: { label: "Cancelado", tone: "neutral" },
};
export const clientStatusMeta: Record<string, { label: string; tone: Tone }> = {
  ativo: { label: "Ativo", tone: "success" },
  inativo: { label: "Inativo", tone: "neutral" },
  prospecto: { label: "Prospecto", tone: "info" },
};
