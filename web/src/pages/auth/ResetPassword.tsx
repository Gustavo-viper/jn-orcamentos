import { useState, type FormEvent } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, errorMessage } from '../../lib/api';
import { Button, Field, Input, toast } from '../../components/ui';
import { AuthShell } from './Login';

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password !== password2) return setError('As senhas não conferem.');
    setBusy(true);
    try {
      await api('/auth/reset', { body: { token, password } });
      toast('Senha redefinida. Entre com a nova senha.');
      navigate('/entrar', { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title="Criar nova senha" subtitle="Mínimo de 8 caracteres, com letras e números.">
      {!token ? (
        <p className="text-sm text-red-600">Link inválido.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <Field label="Nova senha" required>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="new-password" autoFocus />
          </Field>
          <Field label="Confirmar nova senha" required>
            <Input type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required autoComplete="new-password" />
          </Field>
          {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300">{error}</p>}
          <Button type="submit" size="lg" className="w-full" loading={busy}>
            Salvar nova senha
          </Button>
        </form>
      )}
    </AuthShell>
  );
}
