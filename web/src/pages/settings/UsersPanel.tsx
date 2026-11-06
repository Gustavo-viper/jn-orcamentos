import { useCallback, useEffect, useState } from 'react';
import { KeyRound, Plus, ShieldCheck, UserCog, WifiOff } from 'lucide-react';
import { ACTIONS, ACTION_LABEL, DEFAULT_EMPLOYEE_PERMISSIONS, MODULES, MODULE_LABEL, type Action, type Module, type PermissionMap, type SessionUser } from '@jn/shared';
import { api, errorMessage, NetworkError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { fmtDateTime } from '../../lib/format';
import { Badge, Button, Card, CardHeader, Checkbox, EmptyState, Field, Input, LoadingBlock, Modal, Select, Toggle, confirmDialog, toast } from '../../components/ui';

type U = SessionUser & { lastLoginAt: string | null; createdAt: string };

export function UsersPanel() {
  const { user: me } = useAuth();
  const [users, setUsers] = useState<U[] | null>(null);
  const [offline, setOffline] = useState(false);
  const [editing, setEditing] = useState<U | 'new' | null>(null);
  const load = useCallback(async () => {
    try {
      setUsers((await api<{ users: U[] }>('/users')).users);
      setOffline(false);
    } catch (e) {
      if (e instanceof NetworkError) setOffline(true);
      else toast.error(errorMessage(e));
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (offline) return <Card><EmptyState icon={<WifiOff className="h-6 w-6" />} title="Gestão de usuários requer internet" description="Por segurança, usuários e permissões são alterados somente no servidor." action={<Button onClick={load}>Tentar novamente</Button>} /></Card>;
  if (!users) return <LoadingBlock />;
  return (
    <Card>
      <CardHeader title="Usuários" subtitle="Defina o que cada funcionário pode visualizar, cadastrar, alterar ou excluir." icon={<UserCog className="h-4 w-4" />} action={<Button size="sm" icon={<Plus className="h-4 w-4" />} onClick={() => setEditing('new')}>Novo usuário</Button>} />
      <ul className="divide-y divide-graphite-100 dark:divide-white/5">
        {users.map((u) => (
          <li key={u.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 font-medium">
                {u.name} {u.id === me?.id && <Badge tone="blue">você</Badge>}
              </div>
              <div className="text-xs text-graphite-500">{u.email} · último acesso {fmtDateTime(u.lastLoginAt)}</div>
            </div>
            <div className="flex items-center gap-2">
              <Badge tone={u.role === 'admin' ? 'gold' : 'gray'}>{u.role === 'admin' ? 'Administrador' : 'Funcionário'}</Badge>
              <Badge tone={u.active ? 'green' : 'red'} dot>{u.active ? 'Ativo' : 'Desativado'}</Badge>
              <Button size="sm" variant="outline" onClick={() => setEditing(u)}>Editar</Button>
            </div>
          </li>
        ))}
      </ul>
      {editing && <UserModal user={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={load} isSelf={editing !== 'new' && editing.id === me?.id} />}
    </Card>
  );
}

function UserModal({ user, onClose, onSaved, isSelf }: { user: U | null; onClose: () => void; onSaved: () => void; isSelf: boolean }) {
  const [name, setName] = useState(user?.name ?? '');
  const [email, setEmail] = useState(user?.email ?? '');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<'admin' | 'employee'>(user?.role ?? 'employee');
  const [active, setActive] = useState(user?.active ?? true);
  const [perms, setPerms] = useState<PermissionMap>(user?.permissions ?? DEFAULT_EMPLOYEE_PERMISSIONS);
  const [busy, setBusy] = useState(false);

  const toggle = (m: Module, a: Action, v: boolean) =>
    setPerms((p) => {
      const cur = { ...(p[m] ?? {}) };
      cur[a] = v;
      if (a === 'view' && !v) ACTIONS.forEach((x) => (cur[x] = false)); // sem visualizar, nada mais
      if (a !== 'view' && v) cur.view = true;
      return { ...p, [m]: cur };
    });

  const submit = async () => {
    setBusy(true);
    try {
      if (user) await api(`/users/${user.id}`, { method: 'PATCH', body: { name, email, role, active, permissions: perms } });
      else await api('/users', { body: { name, email, password, role, permissions: perms } });
      toast(user ? 'Usuário atualizado.' : 'Usuário criado. Ele deverá trocar a senha no primeiro acesso.');
      onSaved();
      onClose();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const resetPassword = async () => {
    const pw = password.trim();
    if (pw.length < 8) return toast.error('Digite a nova senha (mín. 8 caracteres, letras e números) no campo "Nova senha".');
    if (!(await confirmDialog({ title: 'Redefinir senha', message: `Definir a nova senha para ${user!.name}? As sessões abertas desse usuário serão encerradas.`, confirmLabel: 'Redefinir' }))) return;
    try {
      await api(`/users/${user!.id}/password`, { body: { password: pw } });
      toast('Senha redefinida. Informe a nova senha ao usuário.');
      setPassword('');
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <Modal open onClose={onClose} size="xl" closeOnBackdrop={false} title={user ? `Editar ${user.name}` : 'Novo usuário'} footer={<><Button variant="outline" onClick={onClose}>Cancelar</Button><Button loading={busy} onClick={submit}>Salvar</Button></>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field className="sm:col-span-2" label="Nome" required><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field className="sm:col-span-2" label="E-mail" required><Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field className="sm:col-span-2" label={user ? 'Nova senha (para redefinir)' : 'Senha inicial'} required={!user} hint="Mínimo de 8 caracteres, com letras e números.">
          <div className="flex gap-2">
            <Input type="text" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
            {user && <Button variant="outline" icon={<KeyRound className="h-4 w-4" />} onClick={resetPassword}>Redefinir</Button>}
          </div>
        </Field>
        <Field label="Perfil">
          <Select value={role} onChange={(e) => setRole(e.target.value as 'admin' | 'employee')} disabled={isSelf}>
            <option value="employee">Funcionário</option>
            <option value="admin">Administrador</option>
          </Select>
        </Field>
        <Field label="Acesso">
          <div className="pt-2"><Toggle checked={active} onChange={setActive} label={active ? 'Ativo' : 'Desativado'} disabled={isSelf} /></div>
        </Field>
      </div>
      {role === 'admin' ? (
        <p className="mt-5 flex items-center gap-2 rounded-xl bg-gold-50 p-3 text-sm text-gold-700 dark:bg-gold-400/10 dark:text-gold-200"><ShieldCheck className="h-4 w-4" /> Administradores têm acesso total a todos os módulos.</p>
      ) : (
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[520px]">
            <thead>
              <tr className="border-b border-graphite-100 dark:border-white/5">
                <th className="th">Módulo</th>
                {ACTIONS.map((a) => <th key={a} className="th text-center">{ACTION_LABEL[a]}</th>)}
              </tr>
            </thead>
            <tbody className="divide-y divide-graphite-100 dark:divide-white/5">
              {MODULES.map((m) => (
                <tr key={m}>
                  <td className="td font-medium">{MODULE_LABEL[m]}</td>
                  {ACTIONS.map((a) => (
                    <td key={a} className="td text-center">
                      {(m === 'dashboard' || m === 'reports') && a !== 'view' ? <span className="text-graphite-300">—</span> : <Checkbox checked={!!perms[m]?.[a]} onChange={(v) => toggle(m, a, v)} />}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-xs text-graphite-500">As permissões são verificadas no servidor. Dados de módulos sem permissão de visualização não são enviados ao aparelho do funcionário.</p>
        </div>
      )}
    </Modal>
  );
}
