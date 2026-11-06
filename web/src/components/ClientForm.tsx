import { useEffect, useState } from 'react';
import { Search } from 'lucide-react';
import { clientSchema, CLIENT_STATUS_LABEL, type Client } from '@jn/shared';
import { saveRecord } from '../lib/data';
import { uuid } from '../lib/ids';
import { BR_STATES, lookupCep } from '../lib/format';
import { diffPatch, fieldErrors } from '../lib/forms';
import { Button, Field, Input, Modal, Select, Textarea, toast } from './ui';

type FormState = Omit<Client, 'id' | 'createdAt' | 'updatedAt' | 'deletedAt' | 'version' | 'seq'>;
const EMPTY: FormState = { name: '', document: '', phone: '', whatsapp: '', email: '', cep: '', address: '', number: '', district: '', city: '', state: '', complement: '', notes: '', status: 'active' };

export function ClientFormModal({ open, onClose, client, onSaved }: { open: boolean; onClose: () => void; client?: Client | null; onSaved?: (c: Client) => void }) {
  const [f, setF] = useState<FormState>(EMPTY);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [cepBusy, setCepBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setErrors({});
    setF(client ? { ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, (client as unknown as Record<string, unknown>)[k] ?? (EMPTY as Record<string, unknown>)[k]])) } as FormState : EMPTY);
  }, [open, client]);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) => setF((p) => ({ ...p, [k]: v }));

  const fillCep = async () => {
    setCepBusy(true);
    const r = await lookupCep(f.cep);
    setCepBusy(false);
    if (!r) return toast.warning('CEP não encontrado (ou sem internet). Preencha o endereço manualmente.');
    setF((p) => ({ ...p, address: r.address || p.address, district: r.district || p.district, city: r.city || p.city, state: r.state || p.state }));
  };

  const submit = async () => {
    const parsed = clientSchema.safeParse(f);
    if (!parsed.success) return setErrors(fieldErrors(parsed.error));
    setBusy(true);
    try {
      const id = client?.id ?? uuid();
      const data = parsed.data as FormState;
      const patch = diffPatch(client as Partial<FormState> | null, data);
      if (client && !Object.keys(patch).length) return onClose();
      const saved = await saveRecord('clients', id, patch, `${client ? 'Alterar' : 'Cadastrar'} cliente ${data.name}`);
      toast(client ? 'Cliente atualizado.' : 'Cliente cadastrado.');
      onSaved?.(saved);
      onClose();
    } catch (e) {
      toast.error(`Não foi possível salvar: ${(e as Error).message}`);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      title={client ? 'Editar cliente' : 'Novo cliente'}
      closeOnBackdrop={false}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={busy}>
            Salvar cliente
          </Button>
        </>
      }
    >
      <form
        className="grid grid-cols-1 gap-4 sm:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Field className="sm:col-span-4" label="Nome completo ou razão social" required error={errors.name}>
          <Input value={f.name} onChange={(e) => set('name', e.target.value)} autoFocus />
        </Field>
        <Field className="sm:col-span-2" label="Situação">
          <Select value={f.status} onChange={(e) => set('status', e.target.value as FormState['status'])}>
            {Object.entries(CLIENT_STATUS_LABEL).map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </Select>
        </Field>
        <Field className="sm:col-span-2" label="CPF / CNPJ" error={errors.document}>
          <Input value={f.document} onChange={(e) => set('document', e.target.value)} inputMode="numeric" />
        </Field>
        <Field className="sm:col-span-2" label="Telefone">
          <Input value={f.phone} onChange={(e) => set('phone', e.target.value)} inputMode="tel" />
        </Field>
        <Field className="sm:col-span-2" label="WhatsApp">
          <Input value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} inputMode="tel" placeholder="DDD + número" />
        </Field>
        <Field className="sm:col-span-3" label="E-mail" error={errors.email}>
          <Input type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
        </Field>
        <Field className="sm:col-span-3" label="CEP">
          <div className="flex gap-2">
            <Input value={f.cep} onChange={(e) => set('cep', e.target.value)} inputMode="numeric" onBlur={() => f.cep.replace(/\D/g, '').length === 8 && !f.address && void fillCep()} />
            <Button variant="outline" size="icon" className="h-[42px] w-[42px]" onClick={fillCep} loading={cepBusy} aria-label="Buscar CEP" title="Buscar endereço pelo CEP">
              {!cepBusy && <Search className="h-4 w-4" />}
            </Button>
          </div>
        </Field>
        <Field className="sm:col-span-4" label="Endereço">
          <Input value={f.address} onChange={(e) => set('address', e.target.value)} />
        </Field>
        <Field className="sm:col-span-2" label="Número">
          <Input value={f.number} onChange={(e) => set('number', e.target.value)} />
        </Field>
        <Field className="sm:col-span-2" label="Bairro">
          <Input value={f.district} onChange={(e) => set('district', e.target.value)} />
        </Field>
        <Field className="sm:col-span-3" label="Cidade">
          <Input value={f.city} onChange={(e) => set('city', e.target.value)} />
        </Field>
        <Field className="sm:col-span-1" label="UF">
          <Select value={f.state} onChange={(e) => set('state', e.target.value)}>
            <option value="">—</option>
            {BR_STATES.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </Select>
        </Field>
        <Field className="sm:col-span-6" label="Complemento">
          <Input value={f.complement} onChange={(e) => set('complement', e.target.value)} />
        </Field>
        <Field className="sm:col-span-6" label="Observações internas">
          <Textarea value={f.notes} onChange={(e) => set('notes', e.target.value)} />
        </Field>
        <button type="submit" className="hidden" />
      </form>
    </Modal>
  );
}
