import { useEffect, useState } from "react";
import { LogIn, UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ALLOWED_USERS, createAccount, resetPassword, signIn, validateCurrentSession, type AppUser } from "@/services/authService";
import { useAppStore } from "@/hooks/useAppStore";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    void validateCurrentSession().then(async (current) => {
      if (current) await useAppStore.getState().init();
      setUser(current);
      setReady(true);
    }).catch(() => setReady(true));
  }, []);
  if (!ready) return <div className="min-h-screen" />;
  if (!user) return <LoginPage onAuthenticated={setUser} />;
  return children;
}

function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "recover">("login");
  const [name, setName] = useState<AppUser>(ALLOWED_USERS[0]);
  const [password, setPassword] = useState("");
  const [enrollmentCode, setEnrollmentCode] = useState("");
  const [recoveryCode, setRecoveryCode] = useState("");
  const [passwordConfirmation, setPasswordConfirmation] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const available = ALLOWED_USERS;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    setMessage("");
    setBusy(true);
    try {
      if (mode === "recover") {
        if (password !== passwordConfirmation) throw new Error("As senhas não coincidem.");
        await resetPassword(name, recoveryCode, password);
        setMode("login");
        setPassword("");
        setRecoveryCode("");
        setPasswordConfirmation("");
        setMessage("Senha redefinida. Entre com a nova senha.");
        return;
      }
      const user = mode === "register" ? await createAccount(name, password, enrollmentCode) : await signIn(name, password);
      await useAppStore.getState().init();
      onAuthenticated(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível acessar.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <section className="glass-strong w-full max-w-md rounded-3xl p-7 sm:p-9 shadow-xl">
        <div className="mb-4 flex justify-center"><Logo size="lg" /></div>
        <p className="mt-2 text-center text-sm text-muted">Acesso para Jefersson e Giovane</p>

        <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} className={`rounded-xl p-2.5 text-sm ${mode === "login" ? "coffee-gradient text-white" : "glass-subtle text-main"}`}><LogIn className="mr-1 inline h-4 w-4" /> Entrar</button>
          <button type="button" onClick={() => { setMode("register"); if (available.length && !available.includes(name)) setName(available[0]); setError(""); setMessage(""); }} className={`rounded-xl p-2.5 text-sm ${mode === "register" ? "coffee-gradient text-white" : "glass-subtle text-main"}`}><UserPlus className="mr-1 inline h-4 w-4" /> Criar conta</button>
        </div>

        <form className="mt-5 space-y-4" onSubmit={submit}>
          {mode === "recover" && <p className="text-sm text-muted">Redefina a senha usando o código pessoal de recuperação da conta.</p>}
          <label className="block text-sm font-medium text-main">Nome da conta
            <select className="input-glass mt-1.5" value={name} onChange={(event) => setName(event.target.value as AppUser)}>
              {(mode === "register" ? available : ALLOWED_USERS).map((user) => <option key={user} value={user}>{user}{mode === "register" && user === name ? " (nova conta)" : ""}</option>)}
            </select>
          </label>
          {mode === "register" && <p className="text-sm text-muted">O sistema aceita somente as duas contas. Se uma já estiver ativa, o servidor avisará.</p>}
          {mode === "register" && <label className="block text-sm font-medium text-main">Código de ativação
            <input className="input-glass mt-1.5 font-mono tracking-wide" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={enrollmentCode} onChange={(event) => setEnrollmentCode(event.target.value)} required placeholder="JNG-ABCD-EF01-2345-6789-ABCD" />
            <span className="mt-1 block text-xs text-muted">Pode colar com ou sem hífens; espaços extras serão ignorados.</span>
          </label>}
          {mode === "recover" && <label className="block text-sm font-medium text-main">Código pessoal de recuperação
            <input className="input-glass mt-1.5" type="password" autoComplete="off" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} required placeholder="Código entregue ao titular da conta" />
          </label>}
          <label className="block text-sm font-medium text-main">{mode === "recover" ? "Nova senha" : "Senha"}
            <input className="input-glass mt-1.5" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 6 : 8} value={password} onChange={(event) => setPassword(event.target.value)} required placeholder={mode === "login" ? "Digite sua senha" : "Pelo menos 8 caracteres"} />
          </label>
          {mode === "recover" && <label className="block text-sm font-medium text-main">Confirme a nova senha
            <input className="input-glass mt-1.5" type="password" autoComplete="new-password" minLength={8} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required placeholder="Digite a nova senha novamente" />
          </label>}
          {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800">{message}</p>}
          <button className="coffee-gradient w-full rounded-xl p-3 font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar no app" : mode === "register" ? "Criar conta e entrar" : "Redefinir senha"}</button>
          {mode === "login" && <button type="button" className="w-full text-sm font-medium text-main underline underline-offset-4" onClick={() => { setMode("recover"); setError(""); setMessage(""); }}>Esqueci minha senha</button>}
          {mode === "recover" && <button type="button" className="w-full text-sm font-medium text-main underline underline-offset-4" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Voltar para entrar</button>}
        </form>
        <p className="mt-4 text-center text-xs text-muted">Entre online uma vez para ativar a conta e sincronizar. Depois, o app continua disponível offline neste dispositivo.</p>
      </section>
    </main>
  );
}
