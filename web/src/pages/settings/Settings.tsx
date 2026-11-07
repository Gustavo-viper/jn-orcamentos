import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Building2, Download, FileCog, KeyRound, Palette, RefreshCw, Server, Upload, Users } from 'lucide-react';
import { companySettingsSchema, quoteSettingsSchema, type CompanySettings, type QuoteSettings } from '@jn/shared';
import { saveRecord, useCompany, useQuoteSettings } from '../../lib/data';
import { useAuth } from '../../lib/auth';
import { api, errorMessage } from '../../lib/api';
import { BR_STATES, lookupCep } from '../../lib/format';
import { fieldErrors } from '../../lib/forms';
import { useDensity, useGlass, useTheme, type ThemePref } from '../../lib/theme';
import { Button, Card, CardHeader, Checkbox, clsx, Field, Input, NumberInput, PageHeader, Select, Tabs, Textarea, Toggle, toast } from '../../components/ui';
import { UsersPanel } from './UsersPanel';
import { SystemPanel } from './SystemPanel';

type TabId = 'perfil' | 'aparencia' | 'empresa' | 'orcamentos' | 'usuarios' | 'sistema';

export default function SettingsPage() {
  const { can, user } = useAuth();
  const [params, setParams] = useSearchParams();
  const tabs = [
    { value: 'perfil' as const, label: 'Meu perfil' },
    { value: 'aparencia' as const, label: 'Aparência' },
    ...(can('settings') ? [{ value: 'empresa' as const, label: 'Empresa' }, { value: 'orcamentos' as const, label: 'Orçamentos' }] : []),
    ...(user?.role === 'admin' ? [{ value: 'usuarios' as const, label: 'Usuários e permissões' }] : []),
    { value: 'sistema' as const, label: 'Sistema' },
  ];
  const tab = (tabs.find((t) => t.value === params.get('aba'))?.value ?? 'perfil') as TabId;
  return (
    <div className="animate-fade-in">
      <PageHeader title="Configurações" />
      <Tabs className="mb-5" value={tab} onChange={(v) => setParams({ aba: v }, { replace: true })} tabs={tabs} />
      {tab === 'perfil' && <ProfilePanel />}
      {tab === 'aparencia' && <AppearancePanel />}
      {tab === 'empresa' && <CompanyPanel />}
      {tab === 'orcamentos' && <QuoteSettingsPanel />}
      {tab === 'usuarios' && <UsersPanel />}
      {tab === 'sistema' && <SystemPanel />}
    </div>
  );
}

function ProfilePanel() {
  const { user, refresh } = useAuth();
  const [current, setCurrent] = useState('');
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (pw !== pw2) return toast.error('As senhas não conferem.');
    setBusy(true);
    try {
      await api('/auth/change-password', { body: { current, password: pw } });
      toast('Senha alterada. As outras sessões foram encerradas.');
      setCurrent('');
      setPw('');
      setPw2('');
      await refresh();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      <Card>
        <CardHeader title="Meus dados" icon={<Users className="h-4 w-4" />} />
        <div className="space-y-2 p-5 text-sm">
          <div><span className="text-graphite-500">Nome:</span> {user?.name}</div>
          <div><span className="text-graphite-500">E-mail:</span> {user?.email}</div>
          <div><span className="text-graphite-500">Perfil:</span> {user?.role === 'admin' ? 'Administrador' : 'Funcionário'}</div>
          {user?.mustChangePassword && <p className="rounded-xl bg-amber-50 p-3 text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">Sua senha foi definida pelo administrador. Recomendamos alterá-la agora.</p>}
        </div>
      </Card>
      <Card>
        <CardHeader title="Alterar senha" icon={<KeyRound className="h-4 w-4" />} />
        <div className="space-y-4 p-5">
          <Field label="Senha atual"><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
          <Field label="Nova senha" hint="Mínimo de 8 caracteres, com letras e números."><Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" /></Field>
          <Field label="Confirmar nova senha"><Input type="password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" /></Field>
          <Button loading={busy} onClick={submit} disabled={!current || !pw}>Alterar senha</Button>
          <p className="text-xs text-graphite-500">É necessário estar conectado à internet.</p>
        </div>
      </Card>
    </div>
  );
}

function AppearancePanel() {
  const [pref, setPref] = useTheme();
  const [compact, setCompact] = useDensity();
  const [glass, setGlass] = useGlass();
  const opts: { v: ThemePref; label: string; desc: string }[] = [
    { v: 'light', label: 'Modo claro', desc: 'Fundo claro, ideal para ambientes iluminados' },
    { v: 'dark', label: 'Modo escuro', desc: 'Reduz o brilho, ideal à noite' },
    { v: 'system', label: 'Automático', desc: 'Segue a configuração do aparelho' },
  ];
  return (
    <Card>
      <CardHeader title="Aparência" icon={<Palette className="h-4 w-4" />} />
      <div className="space-y-6 p-5">
        <div className="grid gap-3 sm:grid-cols-3">
          {opts.map((o) => (
            <button key={o.v} onClick={() => setPref(o.v)} className={clsx('rounded-2xl border p-4 text-left transition', pref === o.v ? 'border-navy-600 ring-4 ring-navy-100 dark:border-gold-400/60 dark:ring-gold-400/10' : 'border-graphite-200 hover:bg-graphite-50 dark:border-white/10 dark:hover:bg-white/5')}>
              <div className={clsx('mb-3 h-16 rounded-xl', o.v === 'light' ? 'bg-gradient-to-br from-white to-graphite-100 ring-1 ring-graphite-200' : o.v === 'dark' ? 'bg-gradient-to-br from-graphite-800 to-graphite-950' : 'bg-gradient-to-r from-white to-graphite-900 ring-1 ring-graphite-200')} />
              <div className="text-sm font-semibold">{o.label}</div>
              <div className="text-xs text-graphite-500">{o.desc}</div>
            </button>
          ))}
        </div>
        <div className="space-y-3">
          <Toggle checked={glass} onChange={setGlass} label="Efeito vidro (estilo iPhone) — desligue se o aparelho ficar lento" />
          <Toggle checked={compact} onChange={setCompact} label="Modo compacto (textos e espaçamentos menores)" />
        </div>
      </div>
    </Card>
  );
}

function resizeImage(file: File, max = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/png'));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Imagem inválida.'));
    img.src = URL.createObjectURL(file);
  });
}

function CompanyPanel() {
  const company = useCompany();
  const { can } = useAuth();
  const [f, setF] = useState<CompanySettings>(company);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loaded, setLoaded] = useState(false);
  useEffect(() => {
    if (!loaded && company) {
      setF(company);
      if (company.name) setLoaded(true);
    }
  }, [company, loaded]);
  const set = <K extends keyof CompanySettings>(k: K, v: CompanySettings[K]) => setF((p) => ({ ...p, [k]: v }));
  const ro = !can('settings', 'edit');
  const submit = async () => {
    const r = companySettingsSchema.safeParse(f);
    if (!r.success) return setErrors(fieldErrors(r.error));
    await saveRecord('settings', 'company', { value: r.data }, 'Alterar dados da empresa');
    toast('Dados da empresa salvos.');
  };
  return (
    <Card>
      <CardHeader title="Dados da empresa" subtitle="Aparecem no cabeçalho dos orçamentos, PDFs e portal do cliente." icon={<Building2 className="h-4 w-4" />} />
      <fieldset disabled={ro} className="grid gap-4 p-5 sm:grid-cols-6">
        <div className="flex items-center gap-4 sm:col-span-6">
          <div className="flex h-20 w-44 items-center justify-center overflow-hidden rounded-2xl bg-graphite-900 p-2 ring-1 ring-graphite-200 dark:ring-white/10">
            <img src={f.logo || '/logo-jn.webp'} alt="Logotipo" className="h-full w-full object-contain" />
          </div>
          <div className="space-y-2">
            <label className={clsx('inline-flex cursor-pointer items-center gap-2 rounded-xl border border-graphite-200 px-3 py-2 text-sm font-medium hover:bg-graphite-50 dark:border-white/10 dark:hover:bg-white/5', ro && 'pointer-events-none opacity-50')}>
              <Upload className="h-4 w-4" /> Enviar logotipo
              <input
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0];
                  if (!file) return;
                  try {
                    set('logo', await resizeImage(file));
                  } catch (err) {
                    toast.error((err as Error).message);
                  }
                }}
              />
            </label>
            {f.logo && <Button size="sm" variant="ghost" onClick={() => set('logo', null)}>Usar a logo oficial</Button>}
            <p className="text-xs text-graphite-500">PNG ou JPG. A imagem é redimensionada automaticamente.</p>
          </div>
        </div>
        <Field className="sm:col-span-4" label="Nome / razão social" required error={errors.name}><Input value={f.name} onChange={(e) => set('name', e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="CPF / CNPJ" error={errors.document}><Input value={f.document} onChange={(e) => set('document', e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="Telefone"><Input value={f.phone} onChange={(e) => set('phone', e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="WhatsApp"><Input value={f.whatsapp} onChange={(e) => set('whatsapp', e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="E-mail"><Input value={f.email} onChange={(e) => set('email', e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="CEP"><Input value={f.cep} onChange={(e) => set('cep', e.target.value)} onBlur={async () => { const r = await lookupCep(f.cep); if (r) setF((p) => ({ ...p, address: p.address || r.address, city: r.city, state: r.state })); }} /></Field>
        <Field className="sm:col-span-4" label="Endereço"><Input value={f.address} onChange={(e) => set('address', e.target.value)} /></Field>
        <Field className="sm:col-span-4" label="Cidade"><Input value={f.city} onChange={(e) => set('city', e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="Estado">
          <Select value={f.state} onChange={(e) => set('state', e.target.value)}>
            <option value="">—</option>
            {BR_STATES.map((s) => <option key={s}>{s}</option>)}
          </Select>
        </Field>
        {!ro && <div className="sm:col-span-6"><Button onClick={submit}>Salvar dados da empresa</Button></div>}
      </fieldset>
    </Card>
  );
}

function QuoteSettingsPanel() {
  const qs = useQuoteSettings();
  const { can } = useAuth();
  const [f, setF] = useState<QuoteSettings>(qs);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!touched) setF(qs);
  }, [qs, touched]);
  const set = <K extends keyof QuoteSettings>(k: K, v: QuoteSettings[K]) => {
    setTouched(true);
    setF((p) => ({ ...p, [k]: v }));
  };
  const ro = !can('settings', 'edit');
  const sum = f.installments.reduce((s, i) => s + i.pct, 0);
  const submit = async () => {
    const r = quoteSettingsSchema.safeParse(f);
    if (!r.success) return toast.error(r.error.issues[0].message);
    await saveRecord('settings', 'quote', { value: r.data }, 'Alterar configurações de orçamento');
    setTouched(false);
    toast('Configurações de orçamento salvas.');
  };
  return (
    <Card>
      <CardHeader title="Padrões dos orçamentos" subtitle="Valores sugeridos ao criar um novo orçamento (podem ser alterados em cada orçamento)." icon={<FileCog className="h-4 w-4" />} />
      <fieldset disabled={ro} className="grid gap-4 p-5 sm:grid-cols-4">
        <Field label="Validade padrão"><NumberInput value={f.validityDays} onChange={(v) => set('validityDays', Math.round(v ?? 15))} decimals={0} min={1} suffix="dias" /></Field>
        <Field label="Margem padrão"><NumberInput value={f.marginPct} onChange={(v) => set('marginPct', v ?? 0)} min={0} suffix="%" /></Field>
        <Field label="Desperdício padrão"><NumberInput value={f.wastePct} onChange={(v) => set('wastePct', v ?? 0)} min={0} suffix="%" /></Field>
        <Field label="Margem sobre"><div className="pt-2"><Checkbox checked={f.marginOnLabor} onChange={(v) => set('marginOnLabor', v)} label="Materiais e mão de obra" /></div></Field>
        <div className="sm:col-span-4">
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Condições de pagamento padrão (percentual de entrada e parcelas)</span>
            <span className={clsx('text-xs', Math.abs(sum - 100) > 0.001 ? 'text-red-600' : 'text-graphite-500')}>Soma: {sum}%</span>
          </div>
          <div className="space-y-2">
            {f.installments.map((ins, i) => (
              <div key={i} className="grid grid-cols-[1fr_120px_auto] gap-2">
                <Input value={ins.label} onChange={(e) => set('installments', f.installments.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} />
                <NumberInput value={ins.pct} onChange={(v) => set('installments', f.installments.map((x, j) => (j === i ? { ...x, pct: v ?? 0 } : x)))} min={0} suffix="%" />
                <Button variant="ghost" disabled={f.installments.length === 1} onClick={() => set('installments', f.installments.filter((_, j) => j !== i))}>Remover</Button>
              </div>
            ))}
            <Button size="sm" variant="outline" onClick={() => set('installments', [...f.installments, { label: `Parcela ${f.installments.length + 1}`, pct: 0 }])}>Adicionar parcela</Button>
          </div>
        </div>
        <Field className="sm:col-span-4" label="Texto das condições de pagamento"><Textarea value={f.paymentTerms} onChange={(e) => set('paymentTerms', e.target.value)} /></Field>
        <Field className="sm:col-span-4" label="Observações padrão"><Textarea value={f.defaultNotes} onChange={(e) => set('defaultNotes', e.target.value)} /></Field>
        {!ro && <div className="sm:col-span-4"><Button onClick={submit}>Salvar padrões</Button></div>}
      </fieldset>
    </Card>
  );
}

export { Download, RefreshCw, Server };
