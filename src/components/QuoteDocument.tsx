import type { Client, CompanySettings, Quote } from "@/types";
import { formatDate } from "@/utils/format";
import { getQuoteLines } from "@/utils/quoteLines";
import { QuoteLinesTable } from "@/components/QuoteLinesTable";
import { Logo } from "@/components/Logo";
import { forwardRef } from "react";

interface Props {
  quote: Quote;
  client?: Client;
  settings: CompanySettings;
}

/** Folha de orçamento no modelo das planilhas de referência da J&N. */
export const QuoteDocument = forwardRef<HTMLDivElement, Props>(({ quote, settings }, ref) => {
  const companyAddress = [settings.address, settings.city, settings.state].filter(Boolean).join(" — ");
  const contacts = [settings.phone, settings.email].filter(Boolean).join(" · ");

  return (
    <div ref={ref} className="print-area quote-document">
      <header className="quote-sheet-header">
        <div className="quote-sheet-logo"><Logo size="md" /></div>
        <div className="quote-sheet-company">
          <h1>{settings.name}</h1>
          {companyAddress && <p>{companyAddress}</p>}
          {contacts && <p>{contacts}</p>}
          {settings.document && <p>CNPJ: {settings.document}</p>}
          <p>Data: {formatDate(quote.createdAt)}</p>
        </div>
      </header>

      <h2 className="quote-sheet-title">Planilha Detalhada de Gesso.</h2>
      <div className="quote-sheet-client">Cliente: {quote.clientName}</div>

      <QuoteLinesTable lines={getQuoteLines(quote)} total={quote.total} />
    </div>
  );
});
QuoteDocument.displayName = "QuoteDocument";
