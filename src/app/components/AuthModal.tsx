import { useEffect, useRef, useState } from "react";
import { X, Eye, EyeOff, Loader2, User, Mail, Lock, Hash, MailCheck } from "lucide-react";
import { supabase } from "../../../utils/supabase/client";
import { signUp } from "../api";
import { TURNSTILE_SITE_KEY } from "../data";

interface AuthModalProps {
  onClose: () => void;
  onSuccess: (user: any, token: string) => void;
}

type Mode = "login" | "signup" | "forgot" | "checkEmail" | "resetSent";

const field = "flex items-center gap-2 bg-input-background border border-border rounded px-3 h-11 focus-within:border-primary transition-colors";

// Cloudflare Turnstile (optional): only loads when TURNSTILE_SITE_KEY is set in data.ts
function Turnstile({ onToken }: { onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    const render = () => (window as any).turnstile?.render(ref.current, { sitekey: TURNSTILE_SITE_KEY, callback: onToken });
    if ((window as any).turnstile) { render(); return; }
    const s = document.createElement("script");
    s.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    s.async = true;
    s.onload = render;
    document.head.appendChild(s);
  }, [onToken]);
  return TURNSTILE_SITE_KEY ? <div ref={ref} className="min-h-[65px]" /> : null;
}

export function AuthModal({ onClose, onSuccess }: AuthModalProps) {
  const [mode, setMode] = useState<Mode>("login");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [website, setWebsite] = useState(""); // hidden from people; bots fill it in
  const [captcha, setCaptcha] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const openedAt = useRef(Date.now());

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const switchMode = (m: Mode) => { setMode(m); setError(null); };
  const origin = typeof window !== "undefined" ? window.location.origin + window.location.pathname : undefined;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (mode === "forgot") {
        const { error: err } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: origin });
        if (err) throw new Error(err.message);
        switchMode("resetSent");
        return;
      }
      if (mode === "signup") {
        if (TURNSTILE_SITE_KEY && !captcha) throw new Error("Please complete the check that you're not a robot.");
        const r = await signUp(email.trim(), password, username.trim(), {
          website, formMs: Date.now() - openedAt.current, captchaToken: captcha || undefined, redirectTo: origin,
        });
        if (r.needsConfirmation) { switchMode("checkEmail"); return; }
      }
      const { data, error: signInErr } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
      if (signInErr) {
        if (/confirm/i.test(signInErr.message)) throw new Error("Confirm your email first: open the link we sent you, then sign in.");
        throw new Error(signInErr.message);
      }
      if (!data.session) throw new Error("Sign in failed. Try again.");
      onSuccess(data.user, data.session.access_token);
      onClose();
    } catch (err: any) {
      setError(err.message ?? "Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const heading = {
    login: ["Welcome back", "Sign in to post, comment and earn gold."],
    signup: ["Join the community", "Create an account to post, comment and earn gold."],
    forgot: ["Reset your password", "Enter your account's email and we'll send you a link to choose a new password."],
    checkEmail: ["Check your email", ""],
    resetSent: ["Check your email", ""],
  }[mode];

  return (
    <div className="fixed inset-0 z-[150] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="auth-heading" className="bg-card w-full max-w-sm rounded-xl shadow-2xl border border-border overflow-hidden max-h-[92vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="relative px-6 pt-6 pb-4 border-b border-border">
          <button onClick={onClose} aria-label="Close" className="absolute top-3 right-3 w-10 h-10 flex items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground transition-colors">
            <X size={16} />
          </button>
          <div className="flex items-center gap-2 mb-4">
            <div className="w-8 h-8 bg-primary rounded flex items-center justify-center"><Hash size={16} className="text-white" strokeWidth={2.5} /></div>
            <span className="font-bold text-base tracking-tight">THREADIT</span>
          </div>
          <h2 id="auth-heading" className="text-xl font-bold mb-0.5">{heading[0]}</h2>
          {heading[1] && <p className="text-xs text-muted-foreground">{heading[1]}</p>}
        </div>

        {mode === "checkEmail" || mode === "resetSent" ? (
          <div className="px-6 py-6 flex flex-col items-center text-center gap-3">
            <MailCheck size={36} className="text-primary" />
            <p className="text-sm">
              {mode === "checkEmail"
                ? <>We sent a confirmation link to <span className="font-semibold break-all">{email}</span>. Open it to finish creating your account, then sign in.</>
                : <>If there's an account for <span className="font-semibold break-all">{email}</span>, we've sent a link to reset the password.</>}
            </p>
            <p className="text-xs text-muted-foreground">Can't find it? Check your spam or promotions folder. The link expires after an hour.</p>
            <button type="button" onClick={() => switchMode("login")} className="mt-1 h-10 px-5 rounded-full bg-primary text-primary-foreground text-sm font-semibold">Back to sign in</button>
          </div>
        ) : (
          <>
            {mode !== "forgot" && (
              <div className="flex border-b border-border" role="tablist">
                {(["login", "signup"] as Mode[]).map((m) => (
                  <button key={m} role="tab" aria-selected={mode === m} onClick={() => switchMode(m)}
                    className={`flex-1 h-11 text-sm font-semibold border-b-2 transition-colors ${mode === m ? "border-primary text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
                    {m === "login" ? "Sign In" : "Sign Up"}
                  </button>
                ))}
              </div>
            )}

            <form onSubmit={handleSubmit} className="px-6 py-5 flex flex-col gap-3">
              {mode === "signup" && (
                <div>
                  <label htmlFor="auth-username" className="text-xs font-medium text-muted-foreground mb-1 block">Username</label>
                  <div className={field}>
                    <User size={14} className="text-muted-foreground shrink-0" />
                    <input id="auth-username" type="text" value={username} onChange={(e) => setUsername(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
                      placeholder="e.g. EkoHustle" required minLength={3} maxLength={30} autoComplete="username"
                      className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">3–30 letters, numbers or underscores. This is public.</p>
                </div>
              )}

              <div>
                <label htmlFor="auth-email" className="text-xs font-medium text-muted-foreground mb-1 block">Email</label>
                <div className={field}>
                  <Mail size={14} className="text-muted-foreground shrink-0" />
                  <input id="auth-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" required autoComplete="email"
                    className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                </div>
              </div>

              {mode !== "forgot" && (
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label htmlFor="auth-password" className="text-xs font-medium text-muted-foreground">Password</label>
                    {mode === "login" && (
                      <button type="button" onClick={() => switchMode("forgot")} className="text-xs text-primary hover:underline font-semibold">Forgot password?</button>
                    )}
                  </div>
                  <div className={field}>
                    <Lock size={14} className="text-muted-foreground shrink-0" />
                    <input id="auth-password" type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                      placeholder={mode === "signup" ? "At least 8 characters" : "Your password"} required minLength={mode === "signup" ? 8 : 6}
                      autoComplete={mode === "signup" ? "new-password" : "current-password"}
                      className="flex-1 min-w-0 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
                    <button type="button" onClick={() => setShowPw((v) => !v)} aria-label={showPw ? "Hide password" : "Show password"} className="text-muted-foreground hover:text-foreground w-8 h-8 flex items-center justify-center">
                      {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                    </button>
                  </div>
                </div>
              )}

              {/* Hidden from people (and screen readers); automated sign-up scripts fill it in */}
              {mode === "signup" && (
                <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", width: 1, height: 1, overflow: "hidden" }}>
                  <label htmlFor="auth-website">Website</label>
                  <input id="auth-website" type="text" tabIndex={-1} autoComplete="off" value={website} onChange={(e) => setWebsite(e.target.value)} />
                </div>
              )}
              {mode === "signup" && <Turnstile onToken={setCaptcha} />}

              {error && <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded px-3 py-2">{error}</div>}

              <button type="submit" disabled={loading}
                className="w-full bg-primary text-primary-foreground font-semibold h-11 rounded text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed mt-1">
                {loading && <Loader2 size={15} className="animate-spin" />}
                {loading ? "Please wait…" : mode === "login" ? "Sign In" : mode === "signup" ? "Create Account" : "Send reset link"}
              </button>

              {mode === "signup" && (
                <p className="text-[11px] text-muted-foreground text-center">By creating an account you agree to follow the posting rules. We'll email you a link to confirm your address.</p>
              )}
              <p className="text-center text-xs text-muted-foreground">
                {mode === "forgot" ? (
                  <button type="button" onClick={() => switchMode("login")} className="text-primary hover:underline font-semibold">Back to sign in</button>
                ) : (
                  <>
                    {mode === "login" ? "Don't have an account? " : "Already have an account? "}
                    <button type="button" onClick={() => switchMode(mode === "login" ? "signup" : "login")} className="text-primary hover:underline font-semibold">
                      {mode === "login" ? "Sign Up" : "Sign In"}
                    </button>
                  </>
                )}
              </p>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/** Shown after someone opens a password-reset link */
export function NewPasswordModal({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) { setError("Use a password of at least 8 characters."); return; }
    if (password !== confirm) { setError("The two passwords don't match."); return; }
    setLoading(true);
    const { error: err } = await (supabase.auth as any).updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  };

  return (
    <div className="fixed inset-0 z-[160] bg-black/70 flex items-center justify-center p-4 backdrop-blur-sm">
      <div role="dialog" aria-modal="true" aria-labelledby="newpw-heading" className="bg-card w-full max-w-sm rounded-xl shadow-2xl border border-border p-6 flex flex-col gap-3">
        <h2 id="newpw-heading" className="text-xl font-bold">{done ? "Password updated" : "Choose a new password"}</h2>
        {done ? (
          <>
            <p className="text-sm text-muted-foreground">You're signed in with your new password.</p>
            <button type="button" onClick={onDone} className="h-11 rounded bg-primary text-primary-foreground font-semibold text-sm">Continue</button>
          </>
        ) : (
          <form onSubmit={submit} className="flex flex-col gap-3">
            <label htmlFor="newpw-1" className="text-xs font-medium text-muted-foreground">New password</label>
            <input id="newpw-1" type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={8} required autoComplete="new-password"
              className="bg-input-background border border-border rounded px-3 h-11 text-sm outline-none focus:border-primary" />
            <label htmlFor="newpw-2" className="text-xs font-medium text-muted-foreground">Type it again</label>
            <input id="newpw-2" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={8} required autoComplete="new-password"
              className="bg-input-background border border-border rounded px-3 h-11 text-sm outline-none focus:border-primary" />
            {error && <div role="alert" className="bg-destructive/10 border border-destructive/30 text-destructive text-xs rounded px-3 py-2">{error}</div>}
            <button type="submit" disabled={loading} className="h-11 rounded bg-primary text-primary-foreground font-semibold text-sm flex items-center justify-center gap-2 disabled:opacity-60">
              {loading && <Loader2 size={15} className="animate-spin" />} Save new password
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
