import { Badge, Button, ConfirmModal, Field, GlassCard, Input, Modal, PageHeader, Select, Textarea } from "@/components/ui";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { toast } from "@/hooks/useToast";
import type { Service, ServiceMaterial } from "@/types";
import { buildQuoteItem } from "@/utils/calc";
import { formatCurrency, formatNumber } from "@/utils/format";
import { Layers, Pencil, Plus, Trash2, Wrench } from "lucide-react";
import { useMemo, useState } from "react";

export default function ServicesPage() {
  const { services, products, updateService, createService, deleteService } = useAppStoreShallow((state) => ({ services: state.services, products: state.products, updateService: state.updateService, createService: state.createService, deleteService: state.deleteService }));
  const [selectedId, setSelectedId] = useState<string | undefined>(services[0]?.id);
  const [simW, setSimW] = useState("3");
  const [simL, setSimL] = useState("5");
  const [editOpen, setEditOpen] = useState(false);
  const [newOpen, setNewOpen] = useState(false);
  const [del, setDel] = useState<Service | null>(null);
  const service = services.find((s) => s.id === selectedId) || services[0];

  const sim = useMemo(() => {
    if (!service) return null;
    return buildQuoteItem({ service, products, measures: { width: parseFloat(simW.replace(",", ".")) || 0, length: parseFloat(simL.replace(",", ".")) || 0, height: 0 }, wastePercent: 0 });
  }, [service, products, simW, simL]);

  if (!service) return (
    <div>
      <PageHeader title="Serviços" subtitle="Cadastre um serviço para habilitar a calculadora e os orçamentos." actions={<Button variant="gold" icon={Plus} onClick={() => setNewOpen(true)}>Novo serviço</Button>} />
      <GlassCard className="p-5 text-center">
        <p className="text-sm text-muted">Ainda não há serviços cadastrados.</p>
        <Button className="mt-4" variant="gold" icon={Plus} onClick={() => setNewOpen(true)}>Cadastrar primeiro serviço</Button>
      </GlassCard>
      {newOpen && <ServiceModal onClose={() => setNewOpen(false)} onSave={async (d) => { const created = await createService(d); setSelectedId(created.id); setNewOpen(false); toast.success("Serviço criado"); }} />}
    </div>
  );

  return (
    <div>
      <PageHeader title="Serviços" subtitle="Composição de materiais e preço de mão de obra por serviço" actions={<Button variant="gold" icon={Plus} onClick={() => setNewOpen(true)}>Novo serviço</Button>} />
      <div className="grid lg:grid-cols-3 gap-4">
        <GlassCard className="p-3 space-y-1 lg:max-h-[75vh] overflow-y-auto">
          {services.map((s) => (
            <button key={s.id} onClick={() => setSelectedId(s.id)} className={`w-full text-left rounded-2xl px-4 py-3 transition-all cursor-pointer ${s.id === service.id ? "coffee-gradient text-white shadow-md" : "hover:bg-white/50 dark:hover:bg-white/10 text-main"}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{s.name}</p>
                <span className={`text-xs ${s.id === service.id ? "text-white/80" : "text-muted"}`}>{formatCurrency(s.laborPrice)}/{s.unitLabel}</span>
              </div>
              <p className={`text-xs ${s.id === service.id ? "text-white/70" : "text-muted"}`}>{s.materials.length} materiais · {s.measureType === "area" ? "m²" : "metro linear"}{!s.active && " · inativo"}</p>
            </button>
          ))}
        </GlassCard>

        <div className="lg:col-span-2 space-y-4">
          <GlassCard className="p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2"><h2 className="font-display text-2xl font-semibold text-main">{service.name}</h2><Badge tone={service.active ? "success" : "neutral"} dot>{service.active ? "Ativo" : "Inativo"}</Badge></div>
                <p className="text-sm text-muted mt-1">{service.description}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="secondary" icon={Pencil} onClick={() => setEditOpen(true)}>Editar composição</Button>
                <Button variant="ghost" onClick={() => setDel(service)}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
              <Info label="Medida" value={service.measureType === "area" ? "Área (m²)" : "Linear (m)"} />
              <Info label="Mão de obra" value={`${formatCurrency(service.laborPrice)}/${service.unitLabel}`} gold />
              <Info label="Materiais" value={`${service.materials.length} itens`} />
            </div>
          </GlassCard>

          <GlassCard className="p-5">
            <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
              <div className="flex items-center gap-2"><Layers className="h-5 w-5 text-coffee-600" /><h3 className="font-display text-lg font-semibold text-main">Composição de materiais</h3></div>
              <div className="flex items-center gap-2 text-sm">
                <span className="text-muted">Simular:</span>
                <Input className="w-20 py-1.5" value={simW} onChange={(e) => setSimW(e.target.value)} /> <span className="text-muted">×</span>
                <Input className="w-20 py-1.5" value={simL} onChange={(e) => setSimL(e.target.value)} /> <span className="text-muted">m</span>
              </div>
            </div>
            <div className="overflow-x-auto -mx-2 px-2">
              <table className="w-full text-sm min-w-[560px]">
                <thead><tr className="text-[10px] uppercase tracking-wide text-muted"><th className="text-left py-2 px-2">Material</th><th className="text-left py-2 px-2">Unidade</th><th className="text-left py-2 px-2">Consumo</th><th className="text-right py-2 px-2">Custo unit.</th><th className="text-right py-2 px-2">Qtd p/ {formatNumber(sim?.measureValue || 0)} {service.unitLabel}</th><th className="text-right py-2 px-2">Total</th></tr></thead>
                <tbody>
                  {sim?.materials.map((m) => (
                    <tr key={m.productId} className="border-t border-white/40 dark:border-white/10">
                      <td className="py-2.5 px-2 font-medium text-main">{m.productName}</td>
                      <td className="py-2.5 px-2 text-muted">{m.unit}</td>
                      <td className="py-2.5 px-2 text-muted">{m.consumptionLabel}</td>
                      <td className="py-2.5 px-2 text-right">{formatCurrency(m.unitCost)}</td>
                      <td className="py-2.5 px-2 text-right font-semibold text-main">{formatNumber(m.quantity, m.unit === "un" ? 0 : 2)} {m.unit}</td>
                      <td className="py-2.5 px-2 text-right font-medium">{formatCurrency(m.total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-coffee-400/30"><td colSpan={5} className="py-2.5 px-2 text-right text-muted">Materiais</td><td className="py-2.5 px-2 text-right font-bold text-main">{formatCurrency(sim?.materialsCost || 0)}</td></tr>
                  <tr><td colSpan={5} className="py-1 px-2 text-right text-muted">Mão de obra ({formatNumber(sim?.measureValue || 0)} × {formatCurrency(service.laborPrice)})</td><td className="py-1 px-2 text-right font-bold text-main">{formatCurrency(sim?.laborTotal || 0)}</td></tr>
                  <tr><td colSpan={5} className="py-2 px-2 text-right text-muted font-medium">Custo total simulado</td><td className="py-2 px-2 text-right font-display text-lg font-bold text-coffee-700 dark:text-champagne-300">{formatCurrency((sim?.materialsCost || 0) + (sim?.laborTotal || 0))}</td></tr>
                </tfoot>
              </table>
            </div>
            <p className="text-xs text-muted mt-3">Exemplo: Arame com consumo 0,08 kg/m² para 15 m² → 15 × 0,08 = 1,20 kg. Placas são calculadas pela área da placa (arredondado para cima).</p>
          </GlassCard>
        </div>
      </div>

      {editOpen && <ServiceModal service={service} onClose={() => setEditOpen(false)} onSave={async (d) => { await updateService(service.id, d); setEditOpen(false); toast.success("Composição atualizada"); }} />}
      {newOpen && <ServiceModal onClose={() => setNewOpen(false)} onSave={async (d) => { const s = await createService(d); setSelectedId(s.id); setNewOpen(false); toast.success("Serviço criado"); }} />}
      <ConfirmModal open={!!del} onClose={() => setDel(null)} danger confirmLabel="Excluir" title={`Excluir ${del?.name}?`} description="Orçamentos já criados não serão afetados." onConfirm={async () => { await deleteService(del!.id); setSelectedId(services.find((s) => s.id !== del!.id)?.id); setDel(null); toast.success("Serviço excluído"); }} />
    </div>
  );
}

function Info({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return <div className={`rounded-2xl p-3 ${gold ? "gold-gradient text-coffee-950" : "glass-subtle"}`}><p className={`text-[10px] uppercase tracking-wide ${gold ? "opacity-80" : "text-muted"}`}>{label}</p><p className={`font-semibold ${gold ? "" : "text-main"}`}>{value}</p></div>;
}

function ServiceModal({ service, onClose, onSave }: { service?: Service; onClose: () => void; onSave: (d: Omit<Service, "id">) => Promise<void> }) {
  const { products } = useAppStoreShallow((state) => ({ products: state.products }));
  const [f, setF] = useState<Omit<Service, "id">>(service ? { ...service, materials: service.materials.map((m) => ({ ...m })) } : { name: "", description: "", measureType: "area", laborPrice: 50, unitLabel: "m²", materials: [], active: true });
  const [busy, setBusy] = useState(false);
  const setMat = (i: number, patch: Partial<ServiceMaterial>) => setF((x) => ({ ...x, materials: x.materials.map((m, j) => (j === i ? { ...m, ...patch } : m)) }));
  return (
    <Modal open onClose={onClose} title={service ? `Editar — ${service.name}` : "Novo serviço"} size="xl"
      footer={<><Button variant="secondary" onClick={onClose}>Cancelar</Button><Button variant="gold" loading={busy} onClick={async () => { if (!f.name) return toast.error("Informe o nome"); setBusy(true); await onSave(f); setBusy(false); }}>Salvar</Button></>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome"><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Tipo de medida"><Select value={f.measureType} onChange={(e) => { const mt = e.target.value as "area" | "linear"; setF({ ...f, measureType: mt, unitLabel: mt === "area" ? "m²" : "m" }); }}><option value="area">Área (m²)</option><option value="linear">Metro linear (m)</option></Select></Field>
        <Field label={`Mão de obra (R$/${f.unitLabel})`}><Input inputMode="decimal" defaultValue={f.laborPrice} onChange={(e) => setF({ ...f, laborPrice: parseFloat(e.target.value.replace(",", ".")) || 0 })} /></Field>
        <Field label="Status"><Select value={f.active ? "1" : "0"} onChange={(e) => setF({ ...f, active: e.target.value === "1" })}><option value="1">Ativo</option><option value="0">Inativo</option></Select></Field>
        <Field label="Descrição" className="sm:col-span-2"><Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} className="min-h-[60px]" /></Field>
      </div>
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2"><p className="text-xs font-semibold uppercase tracking-wide text-muted">Materiais</p><Button size="sm" variant="secondary" icon={Plus} disabled={!products.length} onClick={() => { const firstProduct = products[0]; if (firstProduct) setF((current) => ({ ...current, materials: [...current.materials, { productId: firstProduct.id, consumption: 1, mode: "per_measure" }] })); }}>Adicionar material</Button></div>
        {products.length === 0 && <p className="text-xs text-muted mb-2">Não há materiais configurados para compor este serviço.</p>}
        <div className="space-y-2">
          {f.materials.length === 0 && <p className="text-sm text-muted">Nenhum material. Adicione para calcular automaticamente.</p>}
          {f.materials.map((m, i) => {
            const prod = products.find((p) => p.id === m.productId);
            return (
              <div key={i} className="glass-subtle rounded-2xl p-3 grid sm:grid-cols-12 gap-2 items-end">
                <Field label="Produto" className="sm:col-span-5"><Select value={m.productId} onChange={(e) => setMat(i, { productId: e.target.value })}>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.unit})</option>)}</Select></Field>
                <Field label="Modo" className="sm:col-span-3"><Select value={m.mode} onChange={(e) => setMat(i, { mode: e.target.value as ServiceMaterial["mode"] })}><option value="per_measure">Por {f.unitLabel}</option><option value="per_plate" disabled={!prod?.areaPerUnit}>Por área da placa</option></Select></Field>
                <Field label={m.mode === "per_plate" ? "Área placa" : `Consumo/${f.unitLabel}`} className="sm:col-span-3">{m.mode === "per_plate" ? <Input disabled value={`${formatNumber(prod?.areaPerUnit || 0)} m²`} /> : <Input inputMode="decimal" defaultValue={m.consumption} onChange={(e) => setMat(i, { consumption: parseFloat(e.target.value.replace(",", ".")) || 0 })} />}</Field>
                <Button variant="ghost" className="sm:col-span-1" onClick={() => setF({ ...f, materials: f.materials.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4 text-red-500" /></Button>
              </div>
            );
          })}
        </div>
      </div>
      <p className="text-xs text-muted mt-3 flex items-center gap-1"><Wrench className="h-3 w-3" /> O custo unitário dos materiais é usado somente para calcular os orçamentos.</p>
    </Modal>
  );
}

