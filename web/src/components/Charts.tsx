/**
 * Gráficos (Recharts) com marcas finas, grade discreta, dicas ao passar o mouse
 * e cores por papel: uma única cor para séries únicas; paleta categórica fixa
 * (validada para daltonismo) quando há mais de uma série.
 */
import type { ReactNode } from 'react';
import { Bar, BarChart, CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { formatBRL, formatNumber } from '../lib/format';

export const SERIES = {
  light: ['#2a78d6', '#eb6834', '#1baf7a', '#eda100'],
  dark: ['#3987e5', '#d95926', '#199e70', '#c98500'],
};
const isDark = () => document.documentElement.classList.contains('dark');
export const series = (i: number) => (isDark() ? SERIES.dark : SERIES.light)[i % 4];
/** cor da série única (marca) */
export const brand = () => (isDark() ? '#cfa75a' : '#213457');

const axis = { fontSize: 11, fill: 'currentColor', opacity: 0.6 };
const compactBRL = (v: number) => (Math.abs(v) >= 100_000_00 ? `R$ ${formatNumber(v / 100_000_00, 1)} mi` : Math.abs(v) >= 1000_00 ? `R$ ${formatNumber(v / 1000_00, 1)} mil` : formatBRL(v));

function Tip({ active, payload, label, money }: { active?: boolean; payload?: { name: string; value: number; color: string }[]; label?: string; money?: boolean }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-graphite-200 bg-white px-3 py-2 text-xs shadow-lg dark:border-white/10 dark:bg-graphite-800">
      <div className="mb-1 font-semibold text-graphite-800 dark:text-graphite-100">{label}</div>
      {payload.map((p) => (
        <div key={p.name} className="flex items-center gap-2 text-graphite-600 dark:text-graphite-300">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <b className="tabular text-graphite-900 dark:text-white">{money ? formatBRL(p.value) : formatNumber(p.value, 2)}</b>
        </div>
      ))}
    </div>
  );
}

export function ChartFrame({ title, subtitle, children, empty }: { title: string; subtitle?: string; children: ReactNode; empty?: boolean }) {
  return (
    <div className="card p-4 sm:p-5">
      <div className="mb-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        {subtitle && <p className="text-xs text-graphite-500">{subtitle}</p>}
      </div>
      {empty ? <div className="flex h-56 items-center justify-center text-sm text-graphite-500">Sem dados no período.</div> : <div className="h-56 text-graphite-700 dark:text-graphite-300">{children}</div>}
    </div>
  );
}

export function BarsChart({ data, keys, money, horizontal }: { data: Record<string, unknown>[]; keys: { key: string; name: string }[]; money?: boolean; horizontal?: boolean }) {
  const multi = keys.length > 1;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 4, right: 8, left: 0, bottom: 0 }} barCategoryGap="28%" barGap={2}>
        <CartesianGrid strokeDasharray="0" stroke="currentColor" strokeOpacity={0.08} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={axis} tickLine={false} axisLine={false} tickFormatter={money ? compactBRL : undefined} allowDecimals={!!money} />
            <YAxis type="category" dataKey="label" tick={axis} tickLine={false} axisLine={false} width={110} />
          </>
        ) : (
          <>
            <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
            <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={money ? compactBRL : undefined} allowDecimals={!!money} />
          </>
        )}
        <Tooltip cursor={{ fill: 'currentColor', fillOpacity: 0.05 }} content={<Tip money={money} />} />
        {multi && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => (
          <Bar key={k.key} dataKey={k.key} name={k.name} fill={multi ? series(i) : brand()} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={28} />
        ))}
      </BarChart>
    </ResponsiveContainer>
  );
}

export function LinesChart({ data, keys, money }: { data: Record<string, unknown>[]; keys: { key: string; name: string }[]; money?: boolean }) {
  const multi = keys.length > 1;
  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data} margin={{ top: 6, right: 12, left: 0, bottom: 0 }}>
        <CartesianGrid stroke="currentColor" strokeOpacity={0.08} vertical={false} />
        <XAxis dataKey="label" tick={axis} tickLine={false} axisLine={false} />
        <YAxis tick={axis} tickLine={false} axisLine={false} width={64} tickFormatter={money ? compactBRL : undefined} />
        <Tooltip cursor={{ stroke: 'currentColor', strokeOpacity: 0.25 }} content={<Tip money={money} />} />
        {multi && <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 12 }} />}
        {keys.map((k, i) => (
          <Line key={k.key} type="monotone" dataKey={k.key} name={k.name} stroke={multi ? series(i) : brand()} strokeWidth={2} dot={false} activeDot={{ r: 4 }} />
        ))}
      </LineChart>
    </ResponsiveContainer>
  );
}

/** Meses (AAAA-MM) dos últimos n meses, do mais antigo ao atual. */
export function lastMonths(n: number): string[] {
  const out: string[] = [];
  const d = new Date();
  d.setDate(1);
  for (let i = n - 1; i >= 0; i--) {
    const x = new Date(d.getFullYear(), d.getMonth() - i, 1);
    out.push(`${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}
const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
export const monthLabel = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]}/${ym.slice(2, 4)}`;
