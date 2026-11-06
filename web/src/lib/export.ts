import { downloadBlob } from './format';

export type Cell = string | number | null | undefined;

/** CSV no padrão brasileiro (separador ";" e BOM para abrir corretamente no Excel). */
export function exportCsv(filename: string, columns: string[], rows: Cell[][]) {
  const esc = (v: Cell) => {
    if (v === null || v === undefined) return '';
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v);
    return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns, ...rows].map((r) => r.map(esc).join(';')).join('\r\n');
  downloadBlob(new Blob(['﻿', csv], { type: 'text/csv;charset=utf-8' }), filename.endsWith('.csv') ? filename : `${filename}.csv`);
}

/** Planilha Excel (.xlsx). */
export async function exportXlsx(filename: string, columns: string[], rows: Cell[][], sheet = 'Relatório') {
  const { default: writeXlsxFile } = await import('write-excel-file/browser');
  const data = [
    columns.map((c) => ({ value: c, fontWeight: 'bold' as const, backgroundColor: '#0f1c35', color: '#ffffff' })),
    ...rows.map((r) => r.map((v) => (v === null || v === undefined ? null : typeof v === 'number' ? { value: v, type: Number } : { value: String(v), type: String }))),
  ];
  const blob = await writeXlsxFile(data as never, { sheet, columns: columns.map((c) => ({ width: Math.max(12, Math.min(48, c.length + 6)) })) } as never).toBlob();
  downloadBlob(blob, filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`);
}

/** Valores em centavos → reais (número) para planilhas. */
export const reais = (cents: number) => Math.round(cents) / 100;
