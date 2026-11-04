import type { QuoteLine } from "@/utils/quoteLines";
import { formatCurrency, formatNumber } from "@/utils/format";

export function QuoteLinesTable({ lines, total }: { lines: QuoteLine[]; total: number }) {
  const localSpans = lines.map((line, index) => {
    if (index > 0 && lines[index - 1].local === line.local) return 0;
    let span = 1;
    while (index + span < lines.length && lines[index + span].local === line.local) span += 1;
    return span;
  });
  return (
    <div className="quote-sheet-table-wrap">
      <table className="quote-sheet-table">
        <thead>
          <tr>
            <th>Local</th>
            <th>Serviço</th>
            <th>Quantidade</th>
            <th>Unidade</th>
            <th>Valor</th>
            <th>Total</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr key={line.id}>
              {localSpans[index] > 0 && <td rowSpan={localSpans[index]} className="quote-local-cell">{line.local}</td>}
              <td>{line.service}</td>
              <td className="quote-number-cell">{formatNumber(line.quantity)}</td>
              <td className="quote-unit-cell">{line.unit}</td>
              <td className="quote-number-cell">{formatCurrency(line.unitPrice)}</td>
              <td className="quote-number-cell quote-line-total">{formatCurrency(line.total)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td className="quote-total-label" colSpan={5}>TOTAL</td>
            <td className="quote-number-cell">{formatCurrency(total)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
