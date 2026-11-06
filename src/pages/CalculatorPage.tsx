import { Badge, Button, Field, GlassCard, Input, PageHeader, Select, Textarea, Tooltip } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import type { QuoteItem } from "@/types";
import { buildQuoteItem, calcMeasures, calcPlates, calcTotals } from "@/utils/calc";
import { addDays, formatCurrency, formatNumber, uid } from "@/utils/format";
import { Calculator, Check, FileText, Layers, Plus, Ruler, Trash2, UserPlus, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";

const DRAFT_KEY = "jn-gesso:calculator-draft-v1";
const DRAFT_MAX_AGE = 8 * 60 * 60 * 1000;

function readCalculatorDraft() {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY);
    if (!raw) return {};
    const draft = JSON.parse(raw) as { savedAt?: number } & Record<string, unknown>;
    if (!draft.savedAt || Date.now() - draft.savedAt > DRAFT_MAX_AGE) {
      sessionStorage.removeItem(DRAFT_KEY);
      return {};
    }
    return draft;
  } catch {
    return {};
  }
}

function clearCalculatorDraft() {
  try { sessionStorage.removeItem(DRAFT_KEY); } catch { /* ignore unavailable session storage */ }
}

const num = (v: string) => {
  const n = parseFloat(v.replace(",", "."));
  return isNaN(n) ? 0 : n;
};

export default function CalculatorPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { clients, services, products, settings, quotes, createQuote, updateQuote } = useAppStoreShallow((state) => ({ clients: state.clients, services: state.services, products: state.products, settings: state.settings, quotes: state.quotes, createQuote: state.createQuote, updateQuote: state.updateQuote }));

  const editId = params.get("edit");
  const editing = editId ? quotes.find((q) => q.id === editId) : undefined;
  const [draft] = useState(() => editId ? {} : readCalculatorDraft());

  // ---- Cabeçalho do orçamento ----
  const [clientId, setClientId] = useState(String(draft.clientId || params.get("cliente") || ""));
  const [items, setItems] = useState<QuoteItem[]>((draft.items as QuoteItem[] | undefined) ?? []);
  const [marginPercent, setMarginPercent] = useState(Number(draft.marginPercent ?? settings.defaultMargin));
  const [discountType, setDiscountType] = useState<"percent" | "value">((draft.discountType as "percent" | "value" | undefined) ?? "value");
  const [discountValue, setDiscountValue] = useState(Number(draft.discountValue ?? 0));
  const [downPayment, setDownPayment] = useState(Number(draft.downPayment ?? settings.downPaymentPercent));
  const [notes, setNotes] = useState(String(draft.notes ?? "Valores válidos conforme medidas informadas. Alterações no projeto podem gerar ajustes."));
  const [validityDays, setValidityDays] = useState(Number(draft.validityDays ?? settings.quoteValidityDays));
  const [saving, setSaving] = useState(false);

  // ---- Item atual (editor) ----
  const [serviceId, setServiceId] = useState(String(draft.serviceId || "s1"));
  const [width, setWidth] = useState(String(draft.width ?? ""));
  const [length, setLength] = useState(String(draft.length ?? ""));
  const [height, setHeight] = useState(String(draft.height ?? ""));
  const [wasteOption, setWasteOption] = useState<"0" | "5" | "10" | "custom">((draft.wasteOption as "0" | "5" | "10" | "custom" | undefined) ?? "0");
  const [customWaste, setCustomWaste] = useState(String(draft.customWaste ?? "15"));
  const [laborOverride, setLaborOverride] = useState<string>(String(draft.laborOverride ?? ""));
  const [roomName, setRoomName] = useState(String(draft.roomName ?? ""));
  const [negativeMeasures, setNegativeMeasures] = useState<{ id: string; label: string; width: string; length: string }[]>((draft.negativeMeasures as { id: string; label: string; width: string; length: string }[] | undefined) ?? []);
  const [editingItemId, setEditingItemId] = useState<string | null>((draft.editingItemId as string | null | undefined) ?? null);

  useEffect(() => {
    const clientFromUrl = params.get("cliente");
    if (clientFromUrl) setClientId(clientFromUrl);
  }, [params]);

  useEffect(() => {
    if (editId) return;
    try {
      sessionStorage.setItem(DRAFT_KEY, JSON.stringify({
        savedAt: Date.now(), clientId, items, marginPercent, discountType, discountValue,
        downPayment, notes, validityDays, serviceId, width, length, height, wasteOption,
        customWaste, laborOverride, roomName, negativeMeasures, editingItemId,
      }));
    } catch {
      // A calculadora continua funcionando mesmo se o navegador bloquear o armazenamento de sessão.
    }
  }, [editId, clientId, items, marginPercent, discountType, discountValue, downPayment, notes, validityDays, serviceId, width, length, height, wasteOption, customWaste, laborOverride, roomName, negativeMeasures, editingItemId]);

  useEffect(() => {
    if (editing) {
      setClientId(editing.clientId);
      setItems(editing.items);
      setMarginPercent(editing.marginPercent);
      setDiscountType(editing.discountType);
      setDiscountValue(editing.discountValue);
      setDownPayment(editing.downPaymentPercent);
      setNotes(editing.notes);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editId]);

  const activeServices = services.filter((item) => item.active);
  const service = activeServices.find((item) => item.id === serviceId) || activeServices[0];
  useEffect(() => {
    if (activeServices.length && !activeServices.some((item) => item.id === serviceId)) setServiceId(activeServices[0].id);
  }, [services, serviceId]);
  const wastePercent = wasteOption === "custom" ? num(customWaste) : Number(wasteOption);
  const measures = { width: num(width), length: num(length), height: num(height) };
  const mr = calcMeasures(measures);

  const currentItem = useMemo(() => {
    if (!service) return null;
    return buildQuoteItem({
      service,
      products,
      measures,
      wastePercent,
      roomName,
      negativeMeasures: negativeMeasures.map((m) => ({ ...m, width: num(m.width), length: num(m.length) })),
      laborUnitPrice: laborOverride !== "" ? num(laborOverride) : undefined,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [service, products, width, length, height, wastePercent, laborOverride, roomName, negativeMeasures]);

  const plateProduct = useMemo(() => {
    const pm = (Array.isArray(service?.materials) ? service.materials : []).find((m) => m.mode === "per_plate");
    return pm ? products.find((p) => p.id === pm.productId) : undefined;
  }, [service, products]);
  const plates = plateProduct ? calcPlates(currentItem?.measureValue ?? mr.area, plateProduct.areaPerUnit || 1, wastePercent) : null;

  // Itens para o resumo = itens adicionados + item atual (se não estiver em edição e tiver medidas)
  const previewItems = useMemo(() => {
    const base = items.filter((i) => i.id !== editingItemId);
    if (currentItem && currentItem.measureValue > 0) return [...base, currentItem];
    return base;
  }, [items, currentItem, editingItemId]);

  const totals = calcTotals({ items: previewItems, marginPercent, discountType, discountValue });
  const measurementTotals = previewItems.reduce((sum, item) => {
    if (item.measureType === "area") {
      sum.grossArea += item.area;
      sum.negativeArea += item.negativeArea ?? 0;
      sum.netArea += item.measureValue;
      sum.perimeter += item.perimeter;
      sum.negativePerimeter += item.negativePerimeter ?? 0;
    } else sum.linear += item.measureValue;
    return sum;
  }, { grossArea: 0, negativeArea: 0, netArea: 0, perimeter: 0, negativePerimeter: 0, linear: 0 });
  const client = clients.find((c) => c.id === clientId);
  const down = +(totals.total * (downPayment / 100)).toFixed(2);

  const addItem = () => {
    if (negativeMeasures.some((m) => num(m.width) < 0 || num(m.length) < 0)) return toast.warning("Medida negativa inválida", "Use somente valores positivos nas larguras e alturas dos descontos.");
    if (service.measureType === "area" && mr.area > 0 && (currentItem?.negativeArea ?? 0) >= mr.area) return toast.warning("Desconto maior que a área", "Os descontos precisam deixar uma área positiva no cômodo.");
    if (!currentItem || currentItem.measureValue <= 0) return toast.warning("Informe as medidas", "Largura e comprimento precisam ser maiores que zero.");
    if (editingItemId) {
      setItems((prev) => prev.map((i) => (i.id === editingItemId ? { ...currentItem, id: editingItemId } : i)));
      setEditingItemId(null);
      toast.success("Item atualizado");
    } else {
      setItems((prev) => [...prev, currentItem]);
      toast.success("Item adicionado ao orçamento", `${currentItem.serviceName} — ${formatNumber(currentItem.measureValue)} ${service.unitLabel}`);
    }
    setLaborOverride("");
    setRoomName("");
    setNegativeMeasures([]);
    setWidth("");
    setLength("");
    setHeight("");
  };

  const editItem = (it: QuoteItem) => {
    setEditingItemId(it.id);
    setServiceId(it.serviceId);
    setWidth(String(it.width).replace(".", ","));
    setLength(String(it.length).replace(".", ","));
    setHeight(String(it.height).replace(".", ","));
    setRoomName(it.roomName || "");
    setNegativeMeasures((it.negativeMeasures ?? []).map((m) => ({ ...m, width: String(m.width).replace(".", ","), length: String(m.length).replace(".", ",") })));
    const w = it.wastePercent;
    if ([0, 5, 10].includes(w)) setWasteOption(String(w) as "0" | "5" | "10");
    else { setWasteOption("custom"); setCustomWaste(String(w)); }
    setLaborOverride(String(it.laborUnitPrice));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const generate = async () => {
    if (!clientId) return toast.error("Selecione um cliente", "O orçamento precisa estar vinculado a um cliente.");
    if (!client) return toast.error("Cliente não encontrado", "Atualize a seleção do cliente antes de gerar o orçamento.");
    if (negativeMeasures.some((m) => num(m.width) < 0 || num(m.length) < 0)) return toast.warning("Medida negativa inválida", "Use somente valores positivos nas larguras e alturas dos descontos.");
    if (service.measureType === "area" && mr.area > 0 && (currentItem?.negativeArea ?? 0) >= mr.area) return toast.warning("Desconto maior que a área", "Os descontos precisam deixar uma área positiva no cômodo.");
    const finalItems = previewItems;
    if (finalItems.length === 0) return toast.error("Nenhum item", "Informe medidas válidas para gerar o orçamento.");
    setSaving(true);
    const t = calcTotals({ items: finalItems, marginPercent, discountType, discountValue });
    const payload = {
      clientId,
      clientName: client.name,
      status: "pendente" as const,
      items: finalItems,
      ...t,
      marginPercent,
      discountType,
      discountValue,
      downPaymentPercent: downPayment,
      paymentTerms: settings.paymentTerms,
      notes,
      validUntil: addDays(validityDays),
    };
    try {
      if (editing) {
        await updateQuote(editing.id, payload);
        toast.success("Orçamento atualizado", `#${editing.number}`);
        clearCalculatorDraft();
        navigate(`/orcamentos/${editing.id}`);
      } else {
        const q = await createQuote(payload);
        toast.success("Orçamento gerado com sucesso!", `#${q.number} — ${formatCurrency(q.total)}`);
        clearCalculatorDraft();
        navigate(`/orcamentos/${q.id}`);
      }
    } catch (error) {
      console.error("Falha ao gerar orçamento:", error);
      const detail = error instanceof Error ? error.message : "Falha inesperada ao salvar os dados.";
      toast.error("Não foi possível gerar o orçamento", detail);
    } finally {
      setSaving(false);
    }
  };

  if (!service) return (
    <div>
      <PageHeader title="Calculadora de Gesso" subtitle="Cadastre e ative um serviço para começar um orçamento." />
      <GlassCard className="p-5">
        <p className="text-sm text-muted">Não há serviços ativos disponíveis para calcular.</p>
        <Button className="mt-4" variant="gold" onClick={() => navigate("/servicos")}>Abrir serviços</Button>
      </GlassCard>
    </div>
  );

  return (
    <div>
      <PageHeader
        title={editing ? `Editar orçamento #${editing.number}` : "Calculadora de Gesso"}
        subtitle="Informe cliente, serviço e medidas — tudo é calculado instantaneamente."
        actions={
          <>
            {editing && <Button variant="secondary" icon={X} onClick={() => navigate(`/orcamentos/${editing.id}`)}>Cancelar edição</Button>}
            <Button variant="gold" icon={FileText} loading={saving} onClick={generate}>{editing ? "Salvar alterações" : "Gerar orçamento"}</Button>
          </>
        }
      />

      <div className="grid lg:grid-cols-3 gap-4">
        {/* COLUNA ESQUERDA — formulário */}
        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-5 animate-fade-up">
            <SectionTitle icon={UserPlus} title="Cliente e serviço" />
            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Cliente" required>
                <div className="flex gap-2">
                  <Select value={clientId} onChange={(e) => setClientId(e.target.value)}>
                    <option value="">Selecione um cliente…</option>
                    {clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </Select>
                  <Tooltip label="Novo cliente">
                    <Button variant="secondary" className="px-3" onClick={() => navigate("/clientes?novo=1&voltar=calculadora")}><Plus className="h-4 w-4" /></Button>
                  </Tooltip>
                </div>
              </Field>
              <Field label="Serviço" required>
                <Select value={serviceId} onChange={(e) => { setServiceId(e.target.value); setLaborOverride(""); }}>
                  {services.filter((s) => s.active).map((s) => (
                    <option key={s.id} value={s.id}>{s.name} — {formatCurrency(s.laborPrice)}/{s.unitLabel}</option>
                  ))}
                </Select>
              </Field>
            </div>
            {client && (
              <div className="mt-3 glass-subtle rounded-xl px-4 py-2.5 text-xs text-muted flex flex-wrap gap-x-4 gap-y-1">
                <span>📱 {client.whatsapp}</span>
                <span>📍 {client.address}, {client.number} — {client.district}, {client.city}/{client.state}</span>
              </div>
            )}
            <p className="mt-3 text-xs text-muted">{service.description}</p>
          </GlassCard>

          <GlassCard className="p-5 animate-fade-up">
            <SectionTitle icon={Ruler} title="Peça / cômodo" badge={service.measureType === "area" ? "Cálculo por m²" : "Cálculo por metro linear"} />
            <Field label="Nome do cômodo ou peça">
              <Input value={roomName} onChange={(e) => setRoomName(e.target.value)} placeholder="Ex.: Sala, quarto 1, corredor" />
            </Field>
            <p className="text-xs font-semibold uppercase tracking-wide text-muted mt-4 mb-2">Medidas positivas</p>
            {service.measureType === "area" ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <Field label="Largura (m)"><Input inputMode="decimal" value={width} onChange={(e) => setWidth(e.target.value)} placeholder="Ex.: 3" /></Field>
                <Field label="Comprimento (m)"><Input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} placeholder="Ex.: 5" /></Field>
                <Field label="Altura / pé-direito (m)" hint="Informativo"><Input inputMode="decimal" value={height} onChange={(e) => setHeight(e.target.value)} placeholder="Ex.: 2,80" /></Field>
              </div>
            ) : (
              <Field label={`Quantidade (${service.unitLabel})`}><Input inputMode="decimal" value={length} onChange={(e) => setLength(e.target.value)} placeholder="Ex.: 12,50" /></Field>
            )}
            {service.measureType === "area" && (
              <div className="glass-subtle rounded-2xl p-4 mt-4">
                <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
                  <div><p className="font-semibold text-main">Descontos de área (portas e vãos)</p><p className="text-xs text-muted">Áreas que não receberão o serviço. O serviço linear “Negativo” pode ser adicionado como outro item.</p></div>
                  <Button size="sm" variant="secondary" icon={Plus} onClick={() => setNegativeMeasures((rows) => [...rows, { id: uid(), label: "", width: "", length: "" }])}>Adicionar medida</Button>
                </div>
                {negativeMeasures.map((m, index) => (
                  <div key={m.id} className="grid sm:grid-cols-[1fr_1fr_1fr_auto] gap-2 items-end mb-2">
                    <Field label={index === 0 ? "Identificação" : ""}><Input value={m.label} onChange={(e) => setNegativeMeasures((rows) => rows.map((row) => row.id === m.id ? { ...row, label: e.target.value } : row))} placeholder="Porta da sala" /></Field>
                    <Field label={index === 0 ? "Largura (m)" : ""}><Input inputMode="decimal" value={m.width} onChange={(e) => setNegativeMeasures((rows) => rows.map((row) => row.id === m.id ? { ...row, width: e.target.value } : row))} placeholder="0,80" /></Field>
                    <Field label={index === 0 ? "Altura/comprimento (m)" : ""}><Input inputMode="decimal" value={m.length} onChange={(e) => setNegativeMeasures((rows) => rows.map((row) => row.id === m.id ? { ...row, length: e.target.value } : row))} placeholder="2,10" /></Field>
                    <Button size="sm" variant="ghost" aria-label="Remover medida negativa" onClick={() => setNegativeMeasures((rows) => rows.filter((row) => row.id !== m.id))}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                  </div>
                ))}
              </div>
            )}
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              {service.measureType === "area" ? <>
                <Result label="Área bruta" value={`${formatNumber(mr.area)} m²`} formula={`${formatNumber(measures.width)} × ${formatNumber(measures.length)}`} />
                <Result label="Perímetro" value={`${formatNumber(mr.perimeter)} m`} formula={`2 × (${formatNumber(measures.width)} + ${formatNumber(measures.length)})`} />
                <Result label="Área final" value={`${formatNumber(currentItem?.measureValue ?? mr.area)} m²`} formula={`após descontos de ${formatNumber(currentItem?.negativeArea ?? 0)} m²`} highlight />
              </> : <Result label="Quantidade total" value={`${formatNumber(mr.linear)} ${service.unitLabel}`} formula="medida linear do serviço" highlight />}
            </div>
            {service.measureType === "area" && negativeMeasures.length > 0 && <p className="text-xs text-muted mt-2">Descontos: {formatNumber(currentItem?.negativeArea ?? 0)} m² · perímetro dos vãos: {formatNumber(currentItem?.negativePerimeter ?? 0)} m</p>}

            <div className="mt-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Percentual de perda</p>
              <div className="flex flex-wrap gap-2 items-center">
                {(["0", "5", "10", "custom"] as const).map((o) => (
                  <button key={o} onClick={() => setWasteOption(o)} className={`rounded-xl px-4 py-2 text-sm font-medium transition-all cursor-pointer ${wasteOption === o ? "coffee-gradient text-white shadow-md" : "glass-subtle text-main hover:bg-white/60"}`}>
                    {o === "custom" ? "Personalizado" : `${o}%`}
                  </button>
                ))}
                {wasteOption === "custom" && (
                  <div className="flex items-center gap-1">
                    <Input className="w-24" inputMode="decimal" value={customWaste} onChange={(e) => setCustomWaste(e.target.value)} />
                    <span className="text-sm text-muted">%</span>
                  </div>
                )}
              </div>
            </div>
          </GlassCard>

          {plateProduct && plates && (
            <GlassCard className="p-5 animate-fade-up">
              <SectionTitle icon={Layers} title="Cálculo de placas" badge={plateProduct.name} />
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <Result label="Área do ambiente" value={`${formatNumber(mr.area)} m²`} />
                <Result label="Área da placa" value={`${formatNumber(plateProduct.areaPerUnit || 0)} m²`} formula={`${formatNumber(plateProduct.width || 0)} × ${formatNumber(plateProduct.length || 0)}`} />
                <Result label="Quantidade calculada" value={formatNumber(plates.rawQuantity)} formula={`${formatNumber(mr.area * (1 + wastePercent / 100))} ÷ ${formatNumber(plateProduct.areaPerUnit || 0)}`} />
                <Result label="Quantidade necessária" value={`${plates.quantity} placas`} formula="arredondado para cima" highlight />
              </div>
              {/* visual das placas */}
              <div className="mt-4 flex flex-wrap gap-1.5">
                {Array.from({ length: Math.min(plates.quantity, 60) }).map((_, i) => (
                  <div key={i} className={`h-7 w-5 rounded-sm border ${i < Math.floor(plates.rawQuantity) ? "gold-gradient border-champagne-600/40" : "glass-subtle border-champagne-500/40"}`} title={`Placa ${i + 1}`} />
                ))}
                {plates.quantity > 60 && <span className="text-xs text-muted self-center">+{plates.quantity - 60}</span>}
              </div>
            </GlassCard>
          )}

          <GlassCard className="p-5 animate-fade-up">
            <SectionTitle icon={Calculator} title="Mão de obra" />
            <div className="grid sm:grid-cols-3 gap-4 items-end">
              <Field label={`${service.fixedRate ? "Preço final por" : "Preço por"} ${service.unitLabel}`} hint={`Padrão: ${formatCurrency(service.laborPrice)}`}>
                <Input inputMode="decimal" value={laborOverride !== "" ? laborOverride : String(service.laborPrice)} onChange={(e) => setLaborOverride(e.target.value)} />
              </Field>
              <Result label="Base" value={`${formatNumber(currentItem?.measureValue || 0)} ${service.unitLabel}`} />
              <Result label="Total mão de obra" value={formatCurrency(currentItem?.laborTotal || 0)} formula={`${formatNumber(currentItem?.measureValue || 0)} × ${formatCurrency(currentItem?.laborUnitPrice || 0)}`} highlight />
            </div>
            <div className="mt-4 flex flex-wrap gap-2 justify-end">
              {editingItemId && <Button variant="secondary" icon={X} onClick={() => { setEditingItemId(null); setLaborOverride(""); }}>Cancelar</Button>}
              <Button variant="primary" icon={editingItemId ? Check : Plus} onClick={addItem}>{editingItemId ? "Atualizar item" : "Adicionar item ao orçamento"}</Button>
            </div>
          </GlassCard>

          {items.length > 0 && (
            <GlassCard className="p-5 animate-fade-up">
              <SectionTitle icon={FileText} title={`Itens do orçamento (${items.length})`} />
              <div className="space-y-2">
                {items.map((it, idx) => (
                  <div key={it.id} className={`glass-subtle rounded-2xl p-3 flex flex-wrap items-center gap-3 ${editingItemId === it.id ? "ring-2 ring-champagne-500/60" : ""}`}>
                    <div className="coffee-gradient h-8 w-8 rounded-xl text-white text-xs font-bold flex items-center justify-center">{idx + 1}</div>
                    <div className="flex-1 min-w-[160px]">
                      <p className="font-medium text-main">{it.roomName || it.serviceName} — {it.serviceName}</p>
                      <p className="text-xs text-muted">{it.measureType === "area" ? `${formatNumber(it.width)} × ${formatNumber(it.length)} m · área final ${formatNumber(it.measureValue)} m² · perímetro ${formatNumber(it.perimeter)} m · perda ${it.wastePercent}%` : `${formatNumber(it.measureValue)} ${it.unitLabel || "ml"}`}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs text-muted">Mat. {formatCurrency(it.materialsCost)} + MO {formatCurrency(it.laborTotal)}</p>
                      <p className="font-semibold text-main">{formatCurrency(it.materialsCost + it.laborTotal)}</p>
                    </div>
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" onClick={() => editItem(it)}>Editar</Button>
                      <Button size="sm" variant="ghost" onClick={() => setItems((p) => p.filter((x) => x.id !== it.id))}><Trash2 className="h-4 w-4 text-red-500" /></Button>
                    </div>
                  </div>
                ))}
              </div>
              {currentItem && currentItem.measureValue > 0 && !editingItemId && (
                <p className="text-xs text-muted mt-3">ℹ️ O item em edição acima também será incluído ao gerar o orçamento, caso não seja adicionado manualmente.</p>
              )}
            </GlassCard>
          )}
        </div>

        {/* COLUNA DIREITA — resumo financeiro */}
        <div className="space-y-4">
          <GlassCard strong className="p-5 lg:sticky lg:top-24 animate-fade-up">
            <h3 className="font-display text-lg font-semibold text-main mb-4">Resumo do orçamento</h3>

            <div className="space-y-3">
              <Field label="Margem de lucro (%)">
                <div className="flex gap-2 items-center">
                  <Input inputMode="decimal" value={marginPercent} onChange={(e) => setMarginPercent(num(e.target.value))} className="w-24" />
                  <div className="flex gap-1">
                    {[20, 30, 40].map((m) => (
                      <button key={m} onClick={() => setMarginPercent(m)} className={`rounded-lg px-2.5 py-1.5 text-xs font-medium cursor-pointer ${marginPercent === m ? "gold-gradient text-coffee-950" : "glass-subtle text-main"}`}>{m}%</button>
                    ))}
                  </div>
                </div>
              </Field>
              <Field label="Desconto">
                <div className="flex gap-2">
                  <Select value={discountType} onChange={(e) => setDiscountType(e.target.value as "percent" | "value")} className="w-28">
                    <option value="value">R$</option>
                    <option value="percent">%</option>
                  </Select>
                  <Input inputMode="decimal" value={discountValue} onChange={(e) => setDiscountValue(num(e.target.value))} />
                </div>
              </Field>
            </div>

            <div className="mt-5 space-y-2 text-sm">
              <Line label="Custo dos materiais" value={formatCurrency(totals.materialsCost)} />
              <Line label="Mão de obra" value={formatCurrency(totals.laborCost)} />
              <Line label="Custo total" value={formatCurrency(totals.totalCost)} bold />
              <Line label={`Margem (${marginPercent}%)`} value={formatCurrency(totals.profit)} />
              <Line label="Lucro estimado" value={formatCurrency(totals.profit)} accent="text-emerald-600 dark:text-emerald-400" />
              <Line label="Preço antes do desconto" value={formatCurrency(totals.priceBeforeDiscount)} />
              {totals.discountAmount > 0 && <Line label="Desconto" value={`- ${formatCurrency(totals.discountAmount)}`} accent="text-red-600" />}
            </div>

            <div className="mt-4 gold-gradient rounded-2xl p-4 text-coffee-950">
              <p className="text-xs uppercase tracking-[0.2em] font-semibold opacity-80">Preço final</p>
              <p className="font-display text-3xl font-bold">{formatCurrency(totals.total)}</p>
              <p className="text-xs mt-1 opacity-80">{previewItems.length} peça(s)/cômodo(s) · {formatNumber(measurementTotals.grossArea)} m² brutos − {formatNumber(measurementTotals.negativeArea)} m² negativos = {formatNumber(measurementTotals.netArea)} m² líquidos</p>
              <p className="text-xs mt-1 opacity-80">Perímetro total: {formatNumber(measurementTotals.perimeter)} m · perímetro dos negativos: {formatNumber(measurementTotals.negativePerimeter)} m · metro linear: {formatNumber(measurementTotals.linear)} m</p>
            </div>

            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted mb-2">Pagamento</p>
              <div className="flex gap-2 mb-2">
                {[30, 50, 100].map((p) => (
                  <button key={p} onClick={() => setDownPayment(p)} className={`flex-1 rounded-xl px-2 py-2 text-xs font-medium cursor-pointer ${downPayment === p ? "coffee-gradient text-white" : "glass-subtle text-main"}`}>
                    {p === 100 ? "À vista" : `${p}% entrada`}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="glass-subtle rounded-xl p-3">
                  <p className="text-[10px] uppercase text-muted">Sinal ({downPayment}%)</p>
                  <p className="font-semibold text-main">{formatCurrency(down)}</p>
                </div>
                <div className="glass-subtle rounded-xl p-3">
                  <p className="text-[10px] uppercase text-muted">Restante</p>
                  <p className="font-semibold text-main">{formatCurrency(totals.total - down)}</p>
                </div>
              </div>
            </div>

            <div className="mt-4 space-y-3">
              <Field label="Validade (dias)">
                <Input type="number" value={validityDays} onChange={(e) => setValidityDays(Number(e.target.value))} />
              </Field>
              <Field label="Observações">
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[70px]" />
              </Field>
            </div>

            <Button variant="gold" size="lg" className="w-full mt-5" icon={FileText} loading={saving} onClick={generate}>
              {editing ? "Salvar alterações" : "Gerar orçamento"}
            </Button>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ icon: Icon, title, badge }: { icon: React.ElementType; title: string; badge?: string }) {
  return (
    <div className="flex items-center justify-between gap-2 mb-4">
      <div className="flex items-center gap-2">
        <div className="coffee-gradient rounded-xl p-2 text-white"><Icon className="h-4 w-4" /></div>
        <h3 className="font-display text-lg font-semibold text-main">{title}</h3>
      </div>
      {badge && <Badge tone="gold">{badge}</Badge>}
    </div>
  );
}

function Result({ label, value, formula, highlight }: { label: string; value: string; formula?: string; highlight?: boolean }) {
  return (
    <div className={`rounded-2xl p-3 ${highlight ? "gold-gradient text-coffee-950" : "glass-subtle"}`}>
      <p className={`text-[10px] uppercase tracking-wide ${highlight ? "opacity-80" : "text-muted"}`}>{label}</p>
      <p className={`font-display text-lg font-semibold ${highlight ? "" : "text-main"}`}>{value}</p>
      {formula && <p className={`text-[11px] ${highlight ? "opacity-75" : "text-muted"}`}>{formula}</p>}
    </div>
  );
}

function Line({ label, value, bold, accent }: { label: string; value: string; bold?: boolean; accent?: string }) {
  return (
    <div className="flex justify-between">
      <span className="text-muted">{label}</span>
      <span className={`${bold ? "font-semibold" : "font-medium"} ${accent || "text-main"}`}>{value}</span>
    </div>
  );
}

