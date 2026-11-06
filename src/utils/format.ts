export const formatCurrency = (value: number) =>
  new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(
    isFinite(value) ? value : 0
  );

export const formatNumber = (value: number, decimals = 2) =>
  new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(isFinite(value) ? value : 0);

export const formatDate = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("pt-BR");
};

export const formatDateTime = (iso?: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

export const relativeTime = (iso: string) => {
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "agora";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h} h`;
  const d = Math.floor(h / 24);
  if (d < 30) return `há ${d} d`;
  return formatDate(iso);
};

export const addDays = (days: number, from = new Date()) => {
  const parsedDays = Number(days);
  const validDays = Number.isFinite(parsedDays) ? parsedDays : 0;
  const parsedFrom = new Date(from);
  const d = Number.isNaN(parsedFrom.getTime()) ? new Date() : parsedFrom;
  d.setDate(d.getDate() + validDays);
  return d.toISOString();
};

export const daysAgo = (days: number) => addDays(-days);

export const uid = () =>
  Math.random().toString(36).slice(2, 8) + Date.now().toString(36).slice(-4);

export const genToken = () => {
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && "getRandomValues" in crypto) crypto.getRandomValues(bytes);
  else for (let index = 0; index < bytes.length; index += 1) bytes[index] = Math.floor(Math.random() * 256);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("").toUpperCase();
};

export const onlyDigits = (s: string) => s.replace(/\D/g, "");

export const pad = (n: number, size = 4) => String(n).padStart(size, "0");
