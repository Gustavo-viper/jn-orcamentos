import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Lock, Mail, ShieldCheck, User } from 'lucide-react';
import { api, errorMessage, NetworkError } from '../../lib/api';
import { useAuth } from '../../lib/auth';
import { Button, Field, Input } from '../../components/ui';
import { Logo } from '../../components/Logo';

export function AuthShell({ children, title, subtitle }: { children?: ReactNode; title: string; subtitle?: string }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      <div className="relative hidden overflow-hidden bg-gradient-to-br from-navy-900 via-navy-950 to-[#060d1d] lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div className="absolute inset-0 opacity-[0.07]" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #cfa75a 0 1px, transparent 1px 72px), repeating-linear-gradient(0deg, #cfa75a 0 1px, transparent 1px 72px)' }} />
        <div className="relative">
          <Logo className="h-auto w-72 drop-shadow-[0_8px_24px_rgba(0,0,0,0.45)]" />
        </div>
        <div className="relative max-w-md">
          <h2 className="text-3xl leading-tight font-semibold text-white">Orçamentos precisos, obras organizadas e financeiro sob controle.</h2>
          <p className="mt-4 text-navy-100/70">Calcule placas, materiais e mão de obra em segundos — mesmo sem internet. Tudo sincroniza automaticamente quando a conexão volta.</p>
          <div className="mt-8 h-px w-24 bg-gradient-to-r from-gold-400 to-transparent" />
        </div>
        <div className="relative text-xs text-navy-200/50">© {new Date().getFullYear()} J&N Decorações em Gesso</div>
      </div>
      <div className="flex items-center justify-center px-5 py-10">
        <div className="w-full max-w-sm animate-slide-up">
          <div className="mb-8 flex justify-center lg:hidden">
            <span className="rounded-2xl bg-gradient-to-b from-navy-900 to-navy-950 px-4 py-3 shadow-lg">
              <Logo className="h-auto w-56" />
            </span>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-graphite-500">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </div>
  );
}

function IconInput({ icon, ...p }: { icon: ReactNode } & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-graphite-400">{icon}</span>
      <Input className="pl-10" {...p} />
    </div>
  );
}

export default function Login() {
  const { user, login, setupAdmin } = useAuth();
  const navigate = useNavigate();
  const loc = useLocation() as { state?: { from?: string } };
  const [mode, setMode] = useState<'loading' | 'login' | 'setup' | 'forgot' | 'sent'>('loading');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [mailOk, setMailOk] = useState(true);

  useEffect(() => {
    api<{ needsSetup: boolean; mailConfigured: boolean }>('/auth/setup-status')
      .then((r) => {
        setMailOk(r.mailConfigured);
        setMode(r.needsSetup ? 'setup' : 'login');
      })
      .catch(() => setMode('login'));
  }, []);

  if (user) return <Navigate to={loc.state?.from ?? '/'} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === 'login') {
        await login(email, password);
        navigate(loc.state?.from ?? '/', { replace: true });
      } else if (mode === 'setup') {
        if (password !== password2) throw new Error('As senhas não conferem.');
        await setupAdmin(name, email, password);
        navigate('/configuracoes?aba=empresa', { replace: true });
      } else if (mode === 'forgot') {
        await api('/auth/forgot', { body: { email } });
        setMode('sent');
      }
    } catch (err) {
      setError(err instanceof NetworkError ? 'Sem conexão com o servidor. O primeiro acesso em cada aparelho precisa de internet.' : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (mode === 'loading') return <AuthShell title="Carregando..." />;

  if (mode === 'sent')
    return (
      <AuthShell title="Verifique seu e-mail" subtitle="Se o e-mail estiver cadastrado, você receberá um link para criar uma nova senha (válido por 1 hora).">
        {!mailOk && (
          <p className="mb-4 rounded-xl bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-400/10 dark:text-amber-200">
            O envio de e-mails ainda não foi configurado no servidor. Peça ao administrador para redefinir sua senha em Configurações → Usuários.
          </p>
        )}
        <Button variant="outline" className="w-full" onClick={() => setMode('login')}>
          Voltar ao login
        </Button>
      </AuthShell>
    );

  const titles = { login: ['Entrar', 'Acesse com seu e-mail e senha.'], setup: ['Configuração inicial', 'Crie a conta do administrador da J&N.'], forgot: ['Recuperar senha', 'Informe o e-mail cadastrado.'] } as const;
  const [title, subtitle] = titles[mode];

  return (
    <AuthShell title={title} subtitle={subtitle}>
      <form onSubmit={submit} className="space-y-4">
        {mode === 'setup' && (
          <Field label="Seu nome" required>
            <IconInput icon={<User className="h-4 w-4" />} value={name} onChange={(e) => setName(e.target.value)} required autoComplete="name" />
          </Field>
        )}
        <Field label="E-mail" required>
          <IconInput icon={<Mail className="h-4 w-4" />} type="email" value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" autoFocus />
        </Field>
        {mode !== 'forgot' && (
          <Field label="Senha" required hint={mode === 'setup' ? 'Mínimo de 8 caracteres, com letras e números.' : undefined}>
            <IconInput icon={<Lock className="h-4 w-4" />} type="password" value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete={mode === 'setup' ? 'new-password' : 'current-password'} />
          </Field>
        )}
        {mode === 'setup' && (
          <Field label="Confirmar senha" required>
            <IconInput icon={<Lock className="h-4 w-4" />} type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} required autoComplete="new-password" />
          </Field>
        )}
        {error && <p className="rounded-xl bg-red-50 px-3 py-2.5 text-sm text-red-700 dark:bg-red-500/10 dark:text-red-300" role="alert">{error}</p>}
        <Button type="submit" size="lg" className="w-full" loading={busy} icon={mode === 'setup' ? <ShieldCheck className="h-4 w-4" /> : undefined}>
          {mode === 'login' ? 'Entrar' : mode === 'setup' ? 'Criar administrador' : 'Enviar link'}
        </Button>
        {mode === 'login' && (
          <button type="button" className="w-full text-center text-sm text-navy-600 hover:underline dark:text-gold-300" onClick={() => { setError(null); setMode('forgot'); }}>
            Esqueci minha senha
          </button>
        )}
        {mode === 'forgot' && (
          <button type="button" className="w-full text-center text-sm text-graphite-500 hover:underline" onClick={() => setMode('login')}>
            Voltar
          </button>
        )}
      </form>
    </AuthShell>
  );
}
