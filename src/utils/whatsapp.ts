import type { Client, CompanySettings, Quote } from "@/types";
import { formatCurrency, onlyDigits } from "./format";

export const portalUrl = (token: string) => {
  const configuredBase = (import.meta.env.VITE_PUBLIC_PORTAL_URL as string | undefined)?.trim().replace(/\/$/, "");
  const apiBase = (import.meta.env.VITE_API_URL as string | undefined)?.trim().replace(/\/$/, "").replace(/\/api$/i, "");
  const publicBase = configuredBase || (apiBase ? `${apiBase}/portal/public` : "");
  return publicBase
    ? `${publicBase}/${encodeURIComponent(token)}`
    : `${window.location.origin}${window.location.pathname}#/portal/orcamento/${encodeURIComponent(token)}`;
};

export function buildQuoteMessage(quote: Quote, client: Client | undefined, settings: CompanySettings) {
  const first = (client?.name || quote.clientName).split(" ")[0];
  const services = quote.items.map((i) => i.serviceName).join(", ");
  return [
    `Olá, ${first}! 👋`,
    ``,
    `Seu orçamento da *${settings.name}* está pronto.`,
    ``,
    `📋 Orçamento: #${quote.number}`,
    `🔨 Serviço: ${services}`,
    `💰 Valor: *${formatCurrency(quote.total)}*`,
    `📅 Válido até: ${new Date(quote.validUntil).toLocaleDateString("pt-BR")}`,
    ``,
    `Confira todos os detalhes e aprove online:`,
    portalUrl(quote.token),
    ``,
    `_${settings.name}_`,
  ].join("\n");
}

export function openWhatsApp(phone: string, message: string) {
  let digits = onlyDigits(phone);
  if (digits.length <= 11) digits = "55" + digits;
  window.open(`https://wa.me/${digits}?text=${encodeURIComponent(message)}`, "_blank", "noopener");
}
