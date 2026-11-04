import { Button, Field, Input, Modal, Select, Textarea } from "@/components/ui";
import type { Client, ClientStatus } from "@/types";
import { useEffect, useState } from "react";

export type ClientFormData = Omit<Client, "id" | "createdAt">;

const empty: ClientFormData = {
  name: "", document: "", phone: "", whatsapp: "", email: "", address: "", number: "", district: "", city: "", state: "SP", zip: "", notes: "", status: "ativo",
};

export function ClientFormModal({ open, onClose, onSubmit, initial, loading }: { open: boolean; onClose: () => void; onSubmit: (d: ClientFormData) => void; initial?: Client; loading?: boolean }) {
  const [form, setForm] = useState<ClientFormData>(empty);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      setForm(initial ? { ...initial } : empty);
      setErrors({});
    }
  }, [open, initial]);

  const set = (k: keyof ClientFormData) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = () => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = "Informe o nome";
    if (!form.whatsapp.trim()) errs.whatsapp = "Informe o WhatsApp";
    if (form.email && !/^\S+@\S+\.\S+$/.test(form.email)) errs.email = "E-mail inválido";
    setErrors(errs);
    if (Object.keys(errs).length) return;
    onSubmit(form);
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? "Editar cliente" : "Novo cliente"} size="lg"
      footer={<>
        <Button variant="secondary" onClick={onClose}>Cancelar</Button>
        <Button variant="gold" onClick={submit} loading={loading}>{initial ? "Salvar alterações" : "Cadastrar cliente"}</Button>
      </>}>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label="Nome / Razão social" required className="sm:col-span-2" hint={errors.name}>
          <Input value={form.name} onChange={set("name")} placeholder="Ex.: João da Silva" className={errors.name ? "border-red-400" : ""} />
        </Field>
        <Field label="CPF / CNPJ"><Input value={form.document} onChange={set("document")} placeholder="000.000.000-00" /></Field>
        <Field label="Status">
          <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ClientStatus }))}>
            <option value="ativo">Ativo</option><option value="prospecto">Prospecto</option><option value="inativo">Inativo</option>
          </Select>
        </Field>
        <Field label="Telefone"><Input value={form.phone} onChange={set("phone")} placeholder="(11) 0000-0000" /></Field>
        <Field label="WhatsApp" required hint={errors.whatsapp}><Input value={form.whatsapp} onChange={set("whatsapp")} placeholder="(11) 90000-0000" className={errors.whatsapp ? "border-red-400" : ""} /></Field>
        <Field label="E-mail" className="sm:col-span-2" hint={errors.email}><Input type="email" value={form.email} onChange={set("email")} placeholder="email@exemplo.com" /></Field>
        <Field label="Endereço" className="sm:col-span-2"><Input value={form.address} onChange={set("address")} placeholder="Rua, avenida…" /></Field>
        <Field label="Número"><Input value={form.number} onChange={set("number")} /></Field>
        <Field label="Bairro"><Input value={form.district} onChange={set("district")} /></Field>
        <Field label="Cidade"><Input value={form.city} onChange={set("city")} /></Field>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Estado"><Input value={form.state} onChange={set("state")} maxLength={2} /></Field>
          <Field label="CEP"><Input value={form.zip} onChange={set("zip")} placeholder="00000-000" /></Field>
        </div>
        <Field label="Observações" className="sm:col-span-2"><Textarea value={form.notes || ""} onChange={set("notes")} /></Field>
      </div>
    </Modal>
  );
}
