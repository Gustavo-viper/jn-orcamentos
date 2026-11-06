import { clsx } from 'clsx';
import {
  forwardRef,
  useEffect,
  useId,
  useState,
  useSyncExternalStore,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertTriangle, CheckCircle2, ChevronDown, Info, Loader2, X, XCircle } from 'lucide-react';
import { parseDecimal } from '@jn/shared';

export { clsx };

// ---------------- Botões ----------------
type BtnVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'gold' | 'outline';
const BTN: Record<BtnVariant, string> = {
  primary: 'bg-navy-800 text-white hover:bg-navy-700 active:bg-navy-900 shadow-sm dark:bg-gold-400 dark:text-navy-950 dark:hover:bg-gold-300',
  gold: 'bg-gradient-to-b from-gold-300 to-gold-500 text-navy-950 hover:brightness-105 shadow-sm',
  secondary: 'bg-graphite-100 text-graphite-800 hover:bg-graphite-200 dark:bg-white/[0.06] dark:text-graphite-100 dark:hover:bg-white/10',
  outline: 'border border-graphite-200 bg-white text-graphite-800 hover:bg-graphite-50 dark:border-white/10 dark:bg-transparent dark:text-graphite-100 dark:hover:bg-white/5',
  ghost: 'text-graphite-600 hover:bg-graphite-100 dark:text-graphite-300 dark:hover:bg-white/5',
  danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: 'sm' | 'md' | 'lg' | 'icon';
  loading?: boolean;
  icon?: ReactNode;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'primary', size = 'md', loading, icon, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      disabled={disabled || loading}
      className={clsx(
        'inline-flex shrink-0 items-center justify-center gap-2 rounded-xl font-medium whitespace-nowrap transition-all duration-150 select-none active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50',
        size === 'sm' && 'h-8 px-3 text-[13px]',
        size === 'md' && 'h-10 px-4 text-sm',
        size === 'lg' && 'h-12 px-5 text-[15px]',
        size === 'icon' && 'h-9 w-9',
        BTN[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : icon}
      {children}
    </button>
  );
});

// ---------------- Campos ----------------
export function Field({ label, error, hint, children, className, required }: { label?: ReactNode; error?: string | null; hint?: ReactNode; children: ReactNode; className?: string; required?: boolean }) {
  return (
    <div className={className}>
      {label && (
        <label className="label">
          {label}
          {required && <span className="ml-0.5 text-red-500">*</span>}
        </label>
      )}
      {children}
      {error ? <p className="mt-1 text-xs text-red-600 dark:text-red-400">{error}</p> : hint ? <p className="mt-1 text-xs text-graphite-500">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} className={clsx('input', className)} {...p} />;
});
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...p }, ref) {
  return <textarea ref={ref} className={clsx('input min-h-[84px] resize-y', className)} {...p} />;
});
export function Select({ className, children, ...p }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className="relative">
      <select className={clsx('input appearance-none pr-9', className)} {...p}>
        {children}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-3 h-4 w-4 -translate-y-1/2 text-graphite-400" />
    </div>
  );
}

/**
 * Campo numérico que aceita vírgula decimal (padrão brasileiro) e mantém o texto
 * digitado enquanto o usuário edita.
 */
export function NumberInput({ value, onChange, decimals = 2, min, className, suffix, prefix, ...rest }: { value: number | null | undefined; onChange: (v: number | null) => void; decimals?: number; min?: number; suffix?: string; prefix?: string } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'prefix' | 'min'>) {
  const toText = (v: number | null | undefined) => (v === null || v === undefined || Number.isNaN(v) ? '' : String(Number(v.toFixed(decimals))).replace('.', ','));
  const [text, setText] = useState(toText(value));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setText(toText(value));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, focused]);
  return (
    <div className="relative">
      {prefix && <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-graphite-400">{prefix}</span>}
      <input
        inputMode="decimal"
        className={clsx('input tabular', prefix && 'pl-9', suffix && 'pr-10', className)}
        value={text}
        onFocus={(e) => {
          setFocused(true);
          e.target.select();
        }}
        onBlur={() => {
          setFocused(false);
          setText(toText(value));
        }}
        onChange={(e) => {
          const t = e.target.value.replace(/[^\d,.-]/g, '');
          setText(t);
          if (t.trim() === '') return onChange(null);
          const n = parseDecimal(t);
          if (!Number.isNaN(n)) onChange(min !== undefined ? Math.max(min, n) : n);
        }}
        {...rest}
      />
      {suffix && <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-xs text-graphite-400">{suffix}</span>}
    </div>
  );
}

/** Campo de valor em reais; armazena centavos. */
export function MoneyInput({ value, onChange, ...rest }: { value: number | null | undefined; onChange: (cents: number) => void } & Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'min' | 'prefix'>) {
  return <NumberInput prefix="R$" decimals={2} min={0} value={value == null ? null : value / 100} onChange={(v) => onChange(Math.round((v ?? 0) * 100))} {...rest} />;
}

export function Toggle({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  const id = useId();
  return (
    <label htmlFor={id} className={clsx('inline-flex cursor-pointer items-center gap-3 select-none', disabled && 'cursor-not-allowed opacity-60')}>
      <span className="relative inline-flex">
        <input id={id} type="checkbox" className="peer sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
        <span className="h-6 w-11 rounded-full bg-graphite-200 transition peer-checked:bg-navy-700 peer-focus-visible:ring-4 peer-focus-visible:ring-navy-100 dark:bg-white/10 dark:peer-checked:bg-gold-500" />
        <span className="absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow transition peer-checked:translate-x-5" />
      </span>
      {label && <span className="text-sm">{label}</span>}
    </label>
  );
}

export function Checkbox({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label?: ReactNode; disabled?: boolean }) {
  return (
    <label className={clsx('inline-flex cursor-pointer items-center gap-2 text-sm select-none', disabled && 'cursor-not-allowed opacity-50')}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 rounded border-graphite-300 accent-navy-700 dark:accent-gold-400" />
      {label}
    </label>
  );
}

// ---------------- Estrutura ----------------
export function Card({ className, children, ...p }: { className?: string; children: ReactNode } & React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div className={clsx('card', className)} {...p}>
      {children}
    </div>
  );
}

export function CardHeader({ title, subtitle, action, icon }: { title: ReactNode; subtitle?: ReactNode; action?: ReactNode; icon?: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 border-b border-graphite-100 px-5 py-4 dark:border-white/5">
      <div className="flex min-w-0 items-center gap-3">
        {icon && <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-navy-50 text-navy-700 dark:bg-gold-400/10 dark:text-gold-300">{icon}</div>}
        <div className="min-w-0">
          <h3 className="truncate text-[15px] font-semibold">{title}</h3>
          {subtitle && <p className="truncate text-xs text-graphite-500">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, back }: { title: ReactNode; subtitle?: ReactNode; actions?: ReactNode; back?: ReactNode }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {back}
        <h1 className="truncate text-xl font-semibold tracking-tight sm:text-2xl">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-graphite-500 dark:text-graphite-400">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

const TONES = {
  gray: 'bg-graphite-100 text-graphite-700 dark:bg-white/[0.06] dark:text-graphite-300',
  blue: 'bg-navy-50 text-navy-700 dark:bg-navy-400/15 dark:text-navy-200',
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-400/10 dark:text-emerald-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-400/10 dark:text-red-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-400/10 dark:text-amber-300',
  gold: 'bg-gold-100 text-gold-700 dark:bg-gold-400/15 dark:text-gold-200',
  violet: 'bg-violet-50 text-violet-700 dark:bg-violet-400/10 dark:text-violet-300',
} as const;
export type Tone = keyof typeof TONES;
export function Badge({ tone = 'gray', children, className, dot }: { tone?: Tone; children: ReactNode; className?: string; dot?: boolean }) {
  return (
    <span className={clsx('inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', TONES[tone], className)}>
      {dot && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-80" />}
      {children}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={clsx('h-5 w-5 animate-spin text-graphite-400', className)} />;
}

export function LoadingBlock({ label = 'Carregando...' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-3 py-16 text-sm text-graphite-500">
      <Spinner /> {label}
    </div>
  );
}

export function EmptyState({ icon, title, description, action }: { icon?: ReactNode; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      {icon && <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-navy-50 text-navy-600 dark:bg-gold-400/10 dark:text-gold-300">{icon}</div>}
      <h3 className="text-base font-semibold">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-graphite-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function StatCard({ label, value, icon, tone = 'blue', hint, onClick }: { label: string; value: ReactNode; icon?: ReactNode; tone?: Tone; hint?: ReactNode; onClick?: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={!onClick}
      className={clsx('card group flex w-full min-w-0 flex-col p-4 text-left transition sm:p-5', onClick && 'hover:-translate-y-0.5 hover:shadow-lg', 'disabled:cursor-default')}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="line-clamp-2 text-xs leading-tight font-medium text-graphite-500 dark:text-graphite-400">{label}</span>
        {icon && <span className={clsx('flex h-8 w-8 shrink-0 items-center justify-center rounded-lg', TONES[tone])}>{icon}</span>}
      </div>
      <div className="tabular mt-2 truncate text-lg font-semibold tracking-tight sm:text-xl">{value}</div>
      {hint && <div className="mt-1 truncate text-xs text-graphite-500">{hint}</div>}
    </button>
  );
}

export function Tabs<T extends string>({ value, onChange, tabs, className }: { value: T; onChange: (v: T) => void; tabs: { value: T; label: ReactNode; count?: number }[]; className?: string }) {
  return (
    <div className={clsx('-mx-1 flex gap-1 overflow-x-auto px-1 pb-1', className)} role="tablist">
      {tabs.map((t) => (
        <button
          key={t.value}
          role="tab"
          aria-selected={value === t.value}
          onClick={() => onChange(t.value)}
          className={clsx(
            'inline-flex shrink-0 items-center gap-2 rounded-xl px-3.5 py-2 text-sm font-medium transition',
            value === t.value ? 'bg-navy-800 text-white shadow-sm dark:bg-gold-400 dark:text-navy-950' : 'text-graphite-600 hover:bg-graphite-100 dark:text-graphite-300 dark:hover:bg-white/5',
          )}
        >
          {t.label}
          {t.count !== undefined && <span className={clsx('rounded-full px-1.5 text-[11px]', value === t.value ? 'bg-white/20' : 'bg-graphite-200/70 dark:bg-white/10')}>{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------- Modal ----------------
export function Modal({ open, onClose, title, children, footer, size = 'md', closeOnBackdrop = true }: { open: boolean; onClose: () => void; title: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' | 'xl'; closeOnBackdrop?: boolean }) {
  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', h);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', h);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal="true">
      <div className="absolute inset-0 animate-fade-in bg-navy-950/50 backdrop-blur-[2px]" onClick={closeOnBackdrop ? onClose : undefined} />
      <div
        className={clsx(
          'relative flex max-h-[92dvh] w-full animate-slide-up flex-col rounded-t-3xl bg-white shadow-2xl sm:animate-scale-in sm:rounded-2xl dark:bg-graphite-900 dark:ring-1 dark:ring-white/10',
          size === 'sm' && 'sm:max-w-md',
          size === 'md' && 'sm:max-w-xl',
          size === 'lg' && 'sm:max-w-3xl',
          size === 'xl' && 'sm:max-w-5xl',
        )}
      >
        <div className="flex items-center justify-between gap-3 border-b border-graphite-100 px-5 py-4 dark:border-white/5">
          <h2 className="text-base font-semibold">{title}</h2>
          <Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar">
            <X className="h-5 w-5" />
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="safe-bottom flex flex-wrap justify-end gap-2 border-t border-graphite-100 px-5 py-3 dark:border-white/5">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}

// ---------------- Confirmação ----------------
interface ConfirmOpts {
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
  /** exige que o usuário digite este texto para confirmar */
  typeToConfirm?: string;
}
let confirmState: (ConfirmOpts & { resolve: (v: boolean) => void }) | null = null;
const confirmListeners = new Set<() => void>();
export function confirmDialog(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => {
    confirmState = { ...opts, resolve };
    confirmListeners.forEach((l) => l());
  });
}
export function ConfirmHost() {
  const st = useSyncExternalStore(
    (l) => {
      confirmListeners.add(l);
      return () => confirmListeners.delete(l);
    },
    () => confirmState,
  );
  const [typed, setTyped] = useState('');
  const close = (v: boolean) => {
    st?.resolve(v);
    confirmState = null;
    setTyped('');
    confirmListeners.forEach((l) => l());
  };
  if (!st) return null;
  const blocked = !!st.typeToConfirm && typed.trim() !== st.typeToConfirm;
  return (
    <Modal
      open
      size="sm"
      onClose={() => close(false)}
      title={
        <span className="flex items-center gap-2">
          {st.danger && <AlertTriangle className="h-5 w-5 text-red-500" />}
          {st.title}
        </span>
      }
      footer={
        <>
          <Button variant="outline" onClick={() => close(false)}>
            Cancelar
          </Button>
          <Button variant={st.danger ? 'danger' : 'primary'} disabled={blocked} onClick={() => close(true)} autoFocus={!st.typeToConfirm}>
            {st.confirmLabel ?? 'Confirmar'}
          </Button>
        </>
      }
    >
      <div className="text-sm text-graphite-600 dark:text-graphite-300">{st.message}</div>
      {st.typeToConfirm && (
        <Field className="mt-4" label={`Digite ${st.typeToConfirm} para confirmar`}>
          <Input autoFocus value={typed} onChange={(e) => setTyped(e.target.value)} />
        </Field>
      )}
    </Modal>
  );
}

// ---------------- Notificações (toasts) ----------------
type ToastKind = 'success' | 'error' | 'info' | 'warning';
interface ToastItem {
  id: number;
  kind: ToastKind;
  message: ReactNode;
}
let toasts: ToastItem[] = [];
let toastSeq = 0;
const toastListeners = new Set<() => void>();
function emitToasts() {
  toastListeners.forEach((l) => l());
}
export function toast(message: ReactNode, kind: ToastKind = 'success', ms = 4000) {
  const id = ++toastSeq;
  toasts = [...toasts, { id, kind, message }].slice(-4);
  emitToasts();
  setTimeout(() => {
    toasts = toasts.filter((t) => t.id !== id);
    emitToasts();
  }, ms);
}
toast.error = (m: ReactNode) => toast(m, 'error', 6000);
toast.info = (m: ReactNode) => toast(m, 'info');
toast.warning = (m: ReactNode) => toast(m, 'warning', 6000);

export function ToastHost() {
  const items = useSyncExternalStore(
    (l) => {
      toastListeners.add(l);
      return () => toastListeners.delete(l);
    },
    () => toasts,
  );
  const icon = { success: <CheckCircle2 className="h-5 w-5 text-emerald-500" />, error: <XCircle className="h-5 w-5 text-red-500" />, info: <Info className="h-5 w-5 text-navy-400" />, warning: <AlertTriangle className="h-5 w-5 text-amber-500" /> };
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[60] flex flex-col items-center gap-2 px-4 lg:right-6 lg:bottom-6 lg:left-auto lg:items-end" aria-live="polite">
      {items.map((t) => (
        <div key={t.id} className="pointer-events-auto flex w-full max-w-sm animate-slide-up items-start gap-3 rounded-2xl border border-graphite-200 bg-white px-4 py-3 text-sm shadow-xl dark:border-white/10 dark:bg-graphite-800">
          {icon[t.kind]}
          <div className="flex-1 pt-0.5">{t.message}</div>
        </div>
      ))}
    </div>,
    document.body,
  );
}

// ---------------- Lista paginada ("carregar mais") ----------------
export function usePaged<T>(items: T[] | undefined, pageSize = 30) {
  const [limit, setLimit] = useState(pageSize);
  useEffect(() => setLimit(pageSize), [items?.length, pageSize]);
  const visible = (items ?? []).slice(0, limit);
  const more = (items?.length ?? 0) > limit;
  return { visible, more, loadMore: () => setLimit((l) => l + pageSize), total: items?.length ?? 0 };
}

export function LoadMore({ more, onClick, shown, total }: { more: boolean; onClick: () => void; shown: number; total: number }) {
  if (!total) return null;
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 text-xs text-graphite-500">
      <span>
        Exibindo {shown} de {total}
      </span>
      {more && (
        <Button size="sm" variant="outline" onClick={onClick}>
          Carregar mais
        </Button>
      )}
    </div>
  );
}

export function SearchInput({ value, onChange, placeholder, className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={clsx('relative', className)}>
      <svg className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-graphite-400" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input type="search" className="input pl-9" value={value} placeholder={placeholder ?? 'Pesquisar...'} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="text-sm font-semibold tracking-wide text-graphite-500 uppercase dark:text-graphite-400">{children}</h2>
      {action}
    </div>
  );
}

export function KeyValue({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <dt className="text-xs text-graphite-500">{label}</dt>
      <dd className="mt-0.5 text-sm font-medium break-words">{children || '—'}</dd>
    </div>
  );
}
