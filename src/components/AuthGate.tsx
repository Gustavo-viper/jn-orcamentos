import { useEffect, useState } from "react";
import { LogIn, MailCheck, UserPlus } from "lucide-react";
import { Logo } from "@/components/Logo";
import { ALLOWED_USERS, createAccount, resendVerificationCode, resetPassword, signIn, validateCurrentSession, verifyEmailAccount, type AppUser } from "@/services/authService";
import { useAppStore } from "@/hooks/useAppStore";

export function AuthGate({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<AppUser | null>(null);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const current = await validateCurrentSession();
        // Load the authenticated Railway snapshot before rendering protected screens.
        if (current) await useAppStore.getState().init();
        if (!cancelled) {
          setUser(current);
          setReady(true);
        }
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);
  if (!ready) return <div className="min-h-screen" />;
  if (!user) return <LoginPage onAuthenticated={setUser} />;
  return children;
}

function LoginPage({ onAuthenticated }: { onAuthenticated: (user: AppUser) => void }) {
  const [mode, setMode] = useState<"login" | "register" | "recover" | "verify">("login");
  const [name, setName] = useState<AppUser>(ALLOWED_USERS[0]);
  const [email, setEmail] = useState("");
  const [emailMasked, setEmailMasked] = useState("");
  const [password, setPassword] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
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
      if (mode === "register") {
        const result = await createAccount(name, email, password, enrollmentCode);
        setEmail(result.email);
        setEmailMasked(result.emailMasked);
        setVerificationCode("");
        setMode("verify");
        setMessage(`Enviamos um código de confirmação para ${result.emailMasked}.`);
        return;
      }
      const user = mode === "verify"
        ? await verifyEmailAccount(name, email, verificationCode, password)
        : await signIn(name, password);
      await useAppStore.getState().init();
      onAuthenticated(user);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível acessar.");
    } finally {
      setBusy(false);
    }
  }

  async function resendCode() {
    setError("");
    setMessage("");
    setBusy(true);
    try {
      const destination = await resendVerificationCode(name);
      setMessage(`Enviamos um novo código para ${destination}.`);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Não foi possível reenviar o código.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center p-4">
      <section className="glass-strong w-full max-w-md rounded-3xl p-7 sm:p-9 shadow-xl">
        <div className="mb-4 flex justify-center"><Logo size="lg" /></div>
        <p className="mt-2 text-center text-sm text-muted">Acesso para Jefersson e Giovane</p>

        {mode !== "verify" && <div className="mt-6 grid grid-cols-2 gap-2">
          <button type="button" onClick={() => { setMode("login"); setError(""); setMessage(""); }} className={`rounded-xl p-2.5 text-sm ${mode === "login" ? "coffee-gradient text-white" : "glass-subtle text-main"}`}><LogIn className="mr-1 inline h-4 w-4" /> Entrar</button>
          <button type="button" onClick={() => { setMode("register"); if (available.length && !available.includes(name)) setName(available[0]); setError(""); setMessage(""); }} className={`rounded-xl p-2.5 text-sm ${mode === "register" ? "coffee-gradient text-white" : "glass-subtle text-main"}`}><UserPlus className="mr-1 inline h-4 w-4" /> Criar conta</button>
        </div>}

        <form className="mt-5 space-y-4" onSubmit={submit}>
          {mode === "recover" && <p className="text-sm text-muted">Redefina a senha usando o código pessoal de recuperação da conta.</p>}
          {mode === "verify" && <div className="flex gap-2 rounded-xl bg-emerald-500/10 p-3 text-sm text-muted"><MailCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-700" /><span>Enviamos um código de 8 dígitos para <b>{emailMasked || email}</b>. Ele vence em 10 minutos.</span></div>}
          {mode !== "verify" && <label className="block text-sm font-medium text-main">Nome da conta
            <select className="input-glass mt-1.5" value={name} onChange={(event) => setName(event.target.value as AppUser)}>
              {(mode === "register" ? available : ALLOWED_USERS).map((user) => <option key={user} value={user}>{user}{mode === "register" && user === name ? " (nova conta)" : ""}</option>)}
            </select>
          </label>}
          {mode === "register" && <>
            <p className="text-sm text-muted">O acesso é limitado a Jefersson e Giovane. O código de ativação autoriza o cadastro; o código enviado por e-mail confirma que você controla o endereço.</p>
            <label className="block text-sm font-medium text-main">E-mail para confirmação
              <input className="input-glass mt-1.5" type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required placeholder="voce@exemplo.com" />
            </label>
          </>}
          {mode === "register" && <label className="block text-sm font-medium text-main">Código de ativação
            <input className="input-glass mt-1.5 font-mono tracking-wide" type="text" autoComplete="off" autoCapitalize="characters" spellCheck={false} value={enrollmentCode} onChange={(event) => setEnrollmentCode(event.target.value)} required placeholder="JNG-ABCD-EF01-2345-6789-ABCD" />
            <span className="mt-1 block text-xs text-muted">Pode colar com ou sem hífens; espaços extras serão ignorados.</span>
          </label>}
          {mode === "recover" && <label className="block text-sm font-medium text-main">Código pessoal de recuperação
            <input className="input-glass mt-1.5" type="password" autoComplete="off" value={recoveryCode} onChange={(event) => setRecoveryCode(event.target.value)} required placeholder="Código entregue ao titular da conta" />
          </label>}
          {mode === "verify" && <label className="block text-sm font-medium text-main">Código de confirmação
            <input className="input-glass mt-1.5 font-mono tracking-[0.25em]" type="text" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{8}" maxLength={8} value={verificationCode} onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 8))} required placeholder="00000000" />
          </label>}
          {mode !== "verify" && <label className="block text-sm font-medium text-main">{mode === "recover" ? "Nova senha" : "Senha"}
            <input className="input-glass mt-1.5" type="password" autoComplete={mode === "login" ? "current-password" : "new-password"} minLength={mode === "login" ? 6 : 8} value={password} onChange={(event) => setPassword(event.target.value)} required placeholder={mode === "login" ? "Digite sua senha" : "Pelo menos 8 caracteres"} />
          </label>}
          {mode === "recover" && <label className="block text-sm font-medium text-main">Confirme a nova senha
            <input className="input-glass mt-1.5" type="password" autoComplete="new-password" minLength={8} value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} required placeholder="Digite a nova senha novamente" />
          </label>}
          {error && <p role="alert" className="rounded-xl bg-red-500/10 p-3 text-sm text-red-700">{error}</p>}
          {message && <p role="status" className="rounded-xl bg-emerald-500/10 p-3 text-sm text-emerald-800">{message}</p>}
          <button className="coffee-gradient w-full rounded-xl p-3 font-semibold text-white disabled:opacity-50" disabled={busy}>{busy ? "Aguarde…" : mode === "login" ? "Entrar no app" : mode === "register" ? "Enviar código de confirmação" : mode === "verify" ? "Confirmar e entrar" : "Redefinir senha"}</button>
          {mode === "verify" && <>
            <button type="button" className="w-full text-sm font-medium text-main underline underline-offset-4 disabled:opacity-50" onClick={() => void resendCode()} disabled={busy}>Reenviar código</button>
            <button type="button" className="w-full text-sm font-medium text-main underline underline-offset-4" onClick={() => { setMode("register"); setError(""); setMessage(""); }}>Voltar e alterar dados</button>
          </>}
          {mode === "login" && <button type="button" className="w-full text-sm font-medium text-main underline underline-offset-4" onClick={() => { setMode("recover"); setError(""); setMessage(""); }}>Esqueci minha senha</button>}
          {mode === "recover" && <button type="button" className="w-full text-sm font-medium text-main underline underline-offset-4" onClick={() => { setMode("login"); setError(""); setMessage(""); }}>Voltar para entrar</button>}
        </form>
        <p className="mt-4 text-center text-xs text-muted">Entre online uma vez para ativar a conta e sincronizar. Depois, o app continua disponível offline neste dispositivo.</p>
      </section>
    </main>
  );
}

