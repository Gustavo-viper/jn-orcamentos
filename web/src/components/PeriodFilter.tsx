import { addDaysISO, todayISO } from '@jn/shared';
import { fmtDate } from '../lib/format';
import { Input, Select } from './ui';

export type PeriodPreset = 'today' | '7d' | '30d' | 'month' | 'year' | 'all' | 'custom';
export interface Period {
  preset: PeriodPreset;
  from: string;
  to: string;
}

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  today: 'Hoje',
  '7d': 'Últimos 7 dias',
  '30d': 'Últimos 30 dias',
  month: 'Mês atual',
  year: 'Ano atual',
  all: 'Todo o período',
  custom: 'Período personalizado',
};

export function periodFor(preset: PeriodPreset, custom?: { from: string; to: string }): Period {
  const today = todayISO();
  switch (preset) {
    case 'today':
      return { preset, from: today, to: today };
    case '7d':
      return { preset, from: addDaysISO(today, -6), to: today };
    case '30d':
      return { preset, from: addDaysISO(today, -29), to: today };
    case 'month':
      return { preset, from: `${today.slice(0, 7)}-01`, to: today };
    case 'year':
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
    case 'all':
      return { preset, from: '0000-01-01', to: '9999-12-31' };
    case 'custom':
      return { preset, from: custom?.from || today, to: custom?.to || today };
  }
}

export const inPeriod = (dateIso: string | null | undefined, p: Period) => {
  if (!dateIso) return false;
  const d = dateIso.slice(0, 10);
  return d >= p.from && d <= p.to;
};

export const periodLabel = (p: Period) => (p.preset === 'all' ? 'Todo o período' : p.preset === 'today' ? `Hoje (${fmtDate(p.from)})` : `${fmtDate(p.from)} a ${fmtDate(p.to)}`);

export function PeriodFilter({ value, onChange, className }: { value: Period; onChange: (p: Period) => void; className?: string }) {
  return (
    <div className={`flex flex-wrap items-center gap-2 ${className ?? ''}`}>
      <Select className="w-52" value={value.preset} onChange={(e) => onChange(periodFor(e.target.value as PeriodPreset, value))} aria-label="Período">
        {(Object.keys(PRESET_LABEL) as PeriodPreset[]).map((k) => (
          <option key={k} value={k}>
            {PRESET_LABEL[k]}
          </option>
        ))}
      </Select>
      {value.preset === 'custom' && (
        <>
          <Input className="w-40" type="date" value={value.from} onChange={(e) => onChange({ ...value, from: e.target.value })} aria-label="De" />
          <span className="text-sm text-graphite-500">até</span>
          <Input className="w-40" type="date" value={value.to} min={value.from} onChange={(e) => onChange({ ...value, to: e.target.value })} aria-label="Até" />
        </>
      )}
    </div>
  );
}
