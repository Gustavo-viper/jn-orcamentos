import type { QuoteTotals } from '@jn/shared';
import { formatBRL, formatNumber } from '../lib/format';
import { clsx } from './ui';

function Row({ label, value, strong, muted, className }: { label: string; value: string; strong?: boolean; muted?: boolean; className?: string }) {
  return (
    <div className={clsx('flex items-baseline justify-between gap-3 py-1 text-sm', className)}>
      <span className={muted ? 'text-graphite-500' : 'text-graphite-600 dark:text-graphite-300'}>{label}</span>
      <span className={clsx('tabular text-right', strong ? 'font-semibold' : '', muted && 'text-graphite-500')}>{value}</span>
    </div>
  );
}

/** Resumo automático do orçamento (medidas, custos, margem e condições). */
export function QuoteSummary({ calc, internal = true }: { calc: QuoteTotals; internal?: boolean }) {
  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {[
          ['Medida total', `${formatNumber(calc.netArea, 2)} m²`],
          ['Descontos', `${formatNumber(calc.deductedArea, 2)} m²`],
          ['Metro linear', `${formatNumber(calc.linearTotal, 2)} m`],
          ['Ambientes', `${calc.environments.length}`],
        ].map(([l, v]) => (
          <div key={l} className="rounded-xl bg-graphite-50 px-2.5 py-2 dark:bg-white/[0.04]">
            <div className="truncate text-[11px] text-graphite-500">{l}</div>
            <div className="tabular truncate text-sm font-semibold">{v}</div>
          </div>
        ))}
      </div>

      <div className="mt-4 border-t border-graphite-100 pt-3 dark:border-white/5">
        {internal && (
          <>
            <Row label="Total do serviço" value={formatBRL(calc.laborCost)} />
            {calc.fixedPriceTotal > 0 && <Row label="Serviços de preço fixo" value={formatBRL(calc.fixedPriceTotal)} />}
            <Row label="Custo total" value={formatBRL(calc.totalCost)} strong />
            <Row label={`Margem de lucro (${formatNumber(calc.marginPct, 2)}%)`} value={formatBRL(calc.marginAmount)} />
          </>
        )}
        <Row label="Valor antes do desconto" value={formatBRL(calc.subtotal)} />
        {calc.discount > 0 && <Row label="Desconto" value={`− ${formatBRL(calc.discount)}`} className="text-red-600 dark:text-red-400" />}
        <div className="mt-2 flex items-baseline justify-between gap-3 rounded-xl bg-navy-900 px-4 py-3 text-white dark:bg-gold-400/10">
          <span className="text-sm text-navy-100/80 dark:text-gold-200/80">Preço final</span>
          <span className="tabular text-2xl font-semibold text-gold-200 dark:text-gold-200">{formatBRL(calc.total)}</span>
        </div>
        {internal && <Row className="mt-2" label="Lucro estimado" value={formatBRL(calc.estimatedProfit)} strong />}
      </div>

      {calc.installments.length > 0 && (
        <div className="mt-4 border-t border-graphite-100 pt-3 dark:border-white/5">
          <div className="mb-1 text-xs font-semibold tracking-wide text-graphite-500 uppercase">Condições de pagamento</div>
          {calc.installments.map((i, k) => (
            <Row key={k} label={`${i.label} (${formatNumber(i.pct, 2)}%)`} value={formatBRL(i.amount)} />
          ))}
        </div>
      )}
    </div>
  );
}
