/**
 * Documentos PDF gerados no próprio aparelho (funciona offline).
 * Fonte padrão Helvetica (WinAnsi) — caracteres fora do Latin-1 são normalizados.
 */
import { GState, jsPDF } from 'jspdf';
import autoTable, { type RowInput } from 'jspdf-autotable';
import {
  formatBRL,
  formatJobNumber,
  formatNumber,
  formatQuoteNumber,
  JOB_EVENT_LABEL,
  type Client,
  type CompanySettings,
  type EnvironmentInput,
  type Job,
  type JobEvent,
  type QuoteTotals,
} from '@jn/shared';
import { fmtCep, fmtDate, fmtDateTime, fmtDocument, fmtPhone } from './format';

const NAVY: [number, number, number] = [15, 28, 53];
const GOLD: [number, number, number] = [184, 146, 79];
const GRAY: [number, number, number] = [106, 115, 135];

export const t = (s: string | null | undefined) =>
  String(s ?? '')
    .replace(/[–—−]/g, '-')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/…/g, '...')
    .replace(/[•]/g, '-')
    .replace(/[^\x00-\xFF]/g, '');

let defaultLogo: string | null = null;
async function loadDefaultLogo(): Promise<string | null> {
  if (defaultLogo) return defaultLogo;
  try {
    const blob = await (await fetch('/logo-jn-pdf.png')).blob();
    defaultLogo = await new Promise<string>((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(String(r.result));
      r.onerror = rej;
      r.readAsDataURL(blob);
    });
    return defaultLogo;
  } catch {
    return null;
  }
}

function imgFormat(dataUrl: string) {
  return /^data:image\/jpe?g/i.test(dataUrl) ? 'JPEG' : 'PNG';
}

async function header(doc: jsPDF, company: CompanySettings, title: string, subtitle: string) {
  const W = doc.internal.pageSize.getWidth();
  doc.setFillColor(...NAVY);
  doc.rect(0, 0, W, 34, 'F');
  doc.setFillColor(...GOLD);
  doc.rect(0, 34, W, 1.2, 'F');
  const logo = company.logo || (await loadDefaultLogo());
  let x = 14;
  if (logo) {
    try {
      // mantém a proporção da logo (a oficial é larga): altura máx. 24 mm, largura máx. 58 mm
      const props = doc.getImageProperties(logo);
      const ratio = props.width / props.height || 1;
      let h = 24;
      let w = h * ratio;
      if (w > 58) {
        w = 58;
        h = w / ratio;
      }
      doc.addImage(logo, imgFormat(logo), 14, 5 + (24 - h) / 2, w, h);
      x = 14 + w + 6;
    } catch {
      /* logotipo inválido */
    }
  }
  doc.setTextColor(255, 255, 255);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(14);
  doc.text(t(company.name || 'J&N Decorações em Gesso'), x, 14);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(214, 222, 238);
  const l1 = [company.document && `CPF/CNPJ ${fmtDocument(company.document)}`, company.phone && `Tel. ${fmtPhone(company.phone)}`, company.whatsapp && `WhatsApp ${fmtPhone(company.whatsapp)}`].filter(Boolean).join('   ');
  const l2 = [company.email, [company.address, company.city && `${company.city}${company.state ? `/${company.state}` : ''}`, company.cep && `CEP ${fmtCep(company.cep)}`].filter(Boolean).join(' - ')].filter(Boolean).join('   ');
  if (l1) doc.text(t(l1), x, 20);
  if (l2) doc.text(t(l2), x, 25);
  doc.setTextColor(234, 214, 169);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.text(t(title), W - 14, 14, { align: 'right' });
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(214, 222, 238);
  doc.text(t(subtitle), W - 14, 20, { align: 'right' });
  doc.setTextColor(30, 32, 40);
}

/** Logo da empresa como marca d'água (papel timbrado), centralizada e bem clara, em todas as páginas. */
async function watermark(doc: jsPDF, company: CompanySettings) {
  const logo = company.logo || (await loadDefaultLogo());
  if (!logo) return;
  try {
    const W = doc.internal.pageSize.getWidth();
    const H = doc.internal.pageSize.getHeight();
    const props = doc.getImageProperties(logo);
    const ratio = props.width / props.height || 1;
    let w = W * 0.7;
    let h = w / ratio;
    if (h > H * 0.5) {
      h = H * 0.5;
      w = h * ratio;
    }
    const x = (W - w) / 2;
    const y = (H - h) / 2 + 10;
    for (let i = 1; i <= doc.getNumberOfPages(); i++) {
      doc.setPage(i);
      doc.saveGraphicsState();
      doc.setGState(new GState({ opacity: 0.06 }));
      doc.addImage(logo, imgFormat(logo), x, y, w, h, 'jn-watermark');
      doc.restoreGraphicsState();
    }
  } catch {
    /* logotipo inválido: segue sem marca d'água */
  }
}

function footer(doc: jsPDF, company: CompanySettings) {
  const pages = doc.getNumberOfPages();
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setDrawColor(230, 230, 235);
    doc.line(14, H - 12, W - 14, H - 12);
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(t(`${company.name} - documento gerado em ${fmtDateTime(new Date().toISOString())}`), 14, H - 7);
    doc.text(`Página ${i} de ${pages}`, W - 14, H - 7, { align: 'right' });
  }
}

function sectionTitle(doc: jsPDF, y: number, text: string) {
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(...NAVY);
  doc.text(t(text.toUpperCase()), 14, y);
  doc.setDrawColor(...GOLD);
  doc.setLineWidth(0.5);
  doc.line(14, y + 1.5, 30, y + 1.5);
  doc.setTextColor(30, 32, 40);
  doc.setFont('helvetica', 'normal');
  return y + 6;
}

function ensureSpace(doc: jsPDF, y: number, needed: number) {
  const H = doc.internal.pageSize.getHeight();
  if (y + needed > H - 18) {
    doc.addPage();
    return 20;
  }
  return y;
}

const lastY = (doc: jsPDF) => (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;

export type ClientLike = Pick<Client, 'name' | 'document' | 'phone' | 'email' | 'address' | 'number' | 'district' | 'city' | 'state' | 'complement' | 'cep'>;

function clientBlock(doc: jsPDF, y: number, client: ClientLike | null, extra?: string) {
  y = sectionTitle(doc, y, 'Cliente');
  doc.setFontSize(9.5);
  doc.setFont('helvetica', 'bold');
  doc.text(t(client?.name ?? '-'), 14, y + 1);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const addr = client ? [client.address && `${client.address}${client.number ? `, ${client.number}` : ''}`, client.complement, client.district, client.city && `${client.city}${client.state ? `/${client.state}` : ''}`, client.cep && `CEP ${fmtCep(client.cep)}`].filter(Boolean).join(' - ') : '';
  const lines = [[client?.document && `CPF/CNPJ: ${fmtDocument(client.document)}`, client?.phone && `Telefone: ${fmtPhone(client.phone)}`, client?.email && `E-mail: ${client.email}`].filter(Boolean).join('   '), addr, extra].filter(Boolean) as string[];
  lines.forEach((l, i) => doc.text(t(l), 14, y + 6 + i * 4.5, { maxWidth: 182 }));
  doc.setTextColor(30, 32, 40);
  return y + 8 + lines.length * 4.5;
}

export interface QuotePdfInput {
  number: number | null;
  title: string;
  issueDate: string;
  validUntil: string;
  paymentTerms: string;
  notes: string;
  environments: EnvironmentInput[];
  calc: Pick<QuoteTotals, 'environments' | 'materials' | 'subtotal' | 'discount' | 'total' | 'installments' | 'grossArea' | 'deductedArea' | 'netArea' | 'linearTotal' | 'plates'>;
  statusLabel?: string;
}

/** Orçamento comercial para o cliente (sem custos internos ou margens). */
export async function buildQuotePdf(q: QuotePdfInput, client: ClientLike | null, company: CompanySettings): Promise<jsPDF> {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await header(doc, company, `ORÇAMENTO ${formatQuoteNumber(q.number)}`, `Emissão ${fmtDate(q.issueDate)}  -  Válido até ${fmtDate(q.validUntil)}`);
  let y = 46;
  y = clientBlock(doc, y, client, q.title ? `Referência: ${q.title}` : undefined);

  y = sectionTitle(doc, y + 2, 'Serviços e ambientes');
  const envRows: RowInput[] = [];
  q.calc.environments.forEach((r, i) => {
    const e = q.environments.find((x) => x.id === r.envId) ?? q.environments[i];
    const measure = r.measurementType === 'm2' ? `${formatNumber(r.netArea, 2)} m²` : r.measurementType === 'ml' ? `${formatNumber(r.linear, 2)} m` : `${formatNumber(r.quantity, 2)} ${r.chargeUnit}`;
    const addons = r.addons ?? [];
    envRows.push([t(`${r.name}`), t(`${r.serviceName}`), t(measure), formatBRL(addons.length ? (r.basePrice ?? r.price) : r.price)]);
    for (const a of addons) {
      envRows.push(['', t(`   + ${a.name}`), t(`${formatNumber(a.measure, 2)} ${a.chargeUnit}`), formatBRL(a.price)]);
    }
    if (addons.length) envRows.push([{ content: t(`Total ${r.name}`), colSpan: 3, styles: { fontStyle: 'bold', halign: 'right' } }, { content: formatBRL(r.price), styles: { fontStyle: 'bold' } }]);
  });
  autoTable(doc, {
    startY: y,
    head: [['Ambiente', 'Serviço', 'Medida total', 'Valor']],
    body: envRows,
    theme: 'grid',
    styles: { fontSize: 8.5, cellPadding: 2.2, lineColor: [230, 230, 235], textColor: [30, 32, 40] },
    headStyles: { fillColor: NAVY, textColor: [255, 255, 255], fontStyle: 'bold' },
    alternateRowStyles: { fillColor: [248, 249, 251] },
    columnStyles: { 2: { cellWidth: 32, halign: 'right' }, 3: { cellWidth: 30, halign: 'right', fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc) + 6;

  // medidas gerais
  y = ensureSpace(doc, y, 12);
  doc.setFontSize(8.5);
  doc.setTextColor(...GRAY);
  const meas = [q.calc.netArea > 0 && `Medida total ${formatNumber(q.calc.netArea, 2)} m²`, q.calc.linearTotal > 0 && `Metro linear ${formatNumber(q.calc.linearTotal, 2)} m`].filter(Boolean).join('   |   ');
  if (meas) doc.text(t(meas), 14, y);
  doc.setTextColor(30, 32, 40);
  y += 9;

  // totais
  y = ensureSpace(doc, y, 34);
  const W = doc.internal.pageSize.getWidth();
  const bx = W - 14 - 80;
  doc.setFontSize(9);
  const line = (label: string, value: string, yy: number, bold = false) => {
    doc.setFont('helvetica', bold ? 'bold' : 'normal');
    doc.text(t(label), bx + 4, yy);
    doc.text(t(value), W - 18, yy, { align: 'right' });
  };
  line('Subtotal', formatBRL(q.calc.subtotal), y + 4);
  let yy = y + 4;
  if (q.calc.discount > 0) {
    yy += 5;
    doc.setTextColor(185, 28, 28);
    line('Desconto', `- ${formatBRL(q.calc.discount)}`, yy);
    doc.setTextColor(30, 32, 40);
  }
  yy += 4;
  doc.setFillColor(...NAVY);
  doc.roundedRect(bx, yy, 80, 11, 2, 2, 'F');
  doc.setTextColor(234, 214, 169);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('VALOR TOTAL', bx + 4, yy + 7.2);
  doc.text(formatBRL(q.calc.total), W - 18, yy + 7.2, { align: 'right' });
  doc.setTextColor(30, 32, 40);
  y = yy + 18;

  if (q.calc.installments.length) {
    y = ensureSpace(doc, y, 24);
    y = sectionTitle(doc, y, 'Condições de pagamento');
    autoTable(doc, {
      startY: y,
      body: q.calc.installments.map((i) => [t(i.label), `${formatNumber(i.pct, 2)}%`, formatBRL(i.amount)]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.5 },
      columnStyles: { 1: { halign: 'right', cellWidth: 24 }, 2: { halign: 'right', cellWidth: 34, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = lastY(doc) + 2;
    if (q.paymentTerms) {
      doc.setFontSize(8.5);
      doc.setTextColor(...GRAY);
      const lines = doc.splitTextToSize(t(q.paymentTerms), 182);
      y = ensureSpace(doc, y, lines.length * 4 + 4);
      doc.text(lines, 14, y + 3);
      y += lines.length * 4 + 4;
      doc.setTextColor(30, 32, 40);
    }
  }

  if (q.notes) {
    y = ensureSpace(doc, y + 2, 20);
    y = sectionTitle(doc, y + 2, 'Observações');
    doc.setFontSize(8.5);
    const lines = doc.splitTextToSize(t(q.notes), 182);
    doc.text(lines, 14, y + 1);
    y += lines.length * 4 + 4;
  }

  // assinaturas
  y = ensureSpace(doc, y + 6, 30);
  y += 18;
  doc.setDrawColor(150, 150, 160);
  doc.line(14, y, 92, y);
  doc.line(W - 92, y, W - 14, y);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(t(company.name), 53, y + 4.5, { align: 'center' });
  doc.text(t(`De acordo - ${client?.name ?? 'Cliente'}`), W - 53, y + 4.5, { align: 'center' });
  doc.text('Data: ____/____/________', W - 53, y + 9.5, { align: 'center' });

  await watermark(doc, company);
  footer(doc, company);
  return doc;
}

/** Comprovante de conclusão de obra. */
export async function buildJobCompletionPdf(job: Job, client: Client | null, company: CompanySettings, events: JobEvent[], quoteNumber: number | null) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  await header(doc, company, 'COMPROVANTE DE CONCLUSÃO', `${formatJobNumber(job.number)}${quoteNumber ? `  -  ${formatQuoteNumber(quoteNumber)}` : ''}`);
  let y = 46;
  y = clientBlock(doc, y, client, job.address ? `Local da obra: ${job.address}` : undefined);
  y = sectionTitle(doc, y + 2, 'Dados da obra');
  autoTable(doc, {
    startY: y,
    body: [
      ['Ordem de serviço', formatJobNumber(job.number)],
      ['Equipe responsável', t(job.team || '-')],
      ['Início', fmtDate(job.startDate)],
      ['Previsão de conclusão', fmtDate(job.expectedEnd)],
      ['Concluída em', fmtDate(job.completedAt)],
      ['Valor contratado', formatBRL(job.contractedValue)],
    ],
    theme: 'plain',
    styles: { fontSize: 9, cellPadding: 1.6 },
    columnStyles: { 0: { cellWidth: 50, textColor: GRAY }, 1: { fontStyle: 'bold' } },
    margin: { left: 14, right: 14 },
  });
  y = lastY(doc) + 6;
  if (job.servicesSummary) {
    y = sectionTitle(doc, y, 'Serviços executados');
    doc.setFontSize(9);
    const lines = doc.splitTextToSize(t(job.servicesSummary), 182);
    doc.text(lines, 14, y + 1);
    y += lines.length * 4.4 + 4;
  }
  if (job.materials.length) {
    y = ensureSpace(doc, y, 20);
    y = sectionTitle(doc, y, 'Materiais');
    autoTable(doc, {
      startY: y,
      head: [['Material', 'Previsto', 'Consumido', 'Unidade']],
      body: job.materials.map((m) => [t(m.name), formatNumber(m.plannedQty, 3), formatNumber(m.consumedQty, 3), t(m.unit)]),
      theme: 'striped',
      styles: { fontSize: 8.5, cellPadding: 1.8 },
      headStyles: { fillColor: NAVY },
      columnStyles: { 1: { halign: 'right' }, 2: { halign: 'right' } },
      margin: { left: 14, right: 14 },
    });
    y = lastY(doc) + 6;
  }
  const tl = [...events].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  if (tl.length) {
    y = ensureSpace(doc, y, 20);
    y = sectionTitle(doc, y, 'Linha do tempo');
    autoTable(doc, {
      startY: y,
      body: tl.map((e) => [fmtDateTime(e.createdAt), t(JOB_EVENT_LABEL[e.type] ?? e.type), t(e.note)]),
      theme: 'plain',
      styles: { fontSize: 8, cellPadding: 1.4 },
      columnStyles: { 0: { cellWidth: 30, textColor: GRAY }, 1: { cellWidth: 36, fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = lastY(doc) + 6;
  }
  y = ensureSpace(doc, y + 6, 40);
  doc.setFontSize(9);
  doc.text(t('Declaro que os serviços descritos acima foram executados e entregues conforme contratado.'), 14, y, { maxWidth: 182 });
  y += 24;
  const W = doc.internal.pageSize.getWidth();
  doc.setDrawColor(150, 150, 160);
  doc.line(14, y, 92, y);
  doc.line(W - 92, y, W - 14, y);
  doc.setFontSize(8);
  doc.setTextColor(...GRAY);
  doc.text(t(company.name), 53, y + 4.5, { align: 'center' });
  doc.text(t(client?.name ?? 'Cliente'), W - 53, y + 4.5, { align: 'center' });
  footer(doc, company);
  return doc;
}

/** Relatório tabular genérico. */
export async function buildReportPdf(title: string, period: string, columns: string[], rows: (string | number)[][], summary: [string, string][], company: CompanySettings, landscape = false) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: landscape ? 'landscape' : 'portrait' });
  await header(doc, company, t(title.toUpperCase()), t(period));
  let y = 44;
  if (summary.length) {
    autoTable(doc, {
      startY: y,
      body: summary.map(([a, b]) => [t(a), t(b)]),
      theme: 'plain',
      styles: { fontSize: 9, cellPadding: 1.4 },
      columnStyles: { 0: { textColor: GRAY, cellWidth: 70 }, 1: { fontStyle: 'bold' } },
      margin: { left: 14, right: 14 },
    });
    y = lastY(doc) + 4;
  }
  autoTable(doc, {
    startY: y,
    head: [columns.map(t)],
    body: rows.map((r) => r.map((c) => t(String(c)))),
    theme: 'striped',
    styles: { fontSize: 8, cellPadding: 1.8 },
    headStyles: { fillColor: NAVY },
    margin: { left: 14, right: 14 },
  });
  footer(doc, company);
  return doc;
}

/** Abre a caixa de impressão do navegador com o PDF. */
export function printPdf(doc: jsPDF) {
  doc.autoPrint();
  const url = doc.output('bloburl');
  const w = window.open(url as unknown as string, '_blank');
  if (!w) doc.save('documento.pdf');
}
