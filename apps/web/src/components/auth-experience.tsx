"use client";

import { ArrowLeft01Icon, ArrowRight01Icon, CheckmarkCircle02Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import type { Route } from "next";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";

import { authClient } from "@/lib/auth-client";
import { client } from "@/utils/orpc";

type AuthMode = "sign-in" | "sign-up" | "forgot-password" | "reset-password" | "verify-email";

const copy: Record<AuthMode, { eyebrow: string; title: string; body: string; cta: string }> = {
  "sign-in": { eyebrow: "YOUR BASNY ACCOUNT", title: "Welcome back.", body: "Sign in to see your orders, saved pieces and delivery updates.", cta: "Sign in" },
  "sign-up": { eyebrow: "JOIN BASNY", title: "Make it yours.", body: "Create an account to keep your details and favourite finds in one place.", cta: "Create account" },
  "forgot-password": { eyebrow: "ACCOUNT ACCESS", title: "A fresh start.", body: "We’ll send a secure link to reset your password.", cta: "Send reset link" },
  "reset-password": { eyebrow: "ACCOUNT ACCESS", title: "Choose a new password.", body: "Use a password you have not used for another account.", cta: "Save password" },
  "verify-email": { eyebrow: "ONE QUICK CHECK", title: "Check your inbox.", body: "Verify your email to unlock your BASNY account.", cta: "Resend verification email" },
};

function Brand() {
  return <Link className="auth-brand" href="/" aria-label="BASNY Enterprise home"><span>BASNY</span><small>ENTERPRISE</small></Link>;
}

function Field({ label, name, type = "text", value, onChange, autoComplete, required = true, hint, action }: {
  label: string; name: string; type?: string; value: string; onChange: (value: string) => void;
  autoComplete?: string; required?: boolean; hint?: ReactNode; action?: ReactNode;
}) {
  return <label className="auth-field" htmlFor={name}><span className="auth-field__label">{label}</span><span className="auth-field__control"><input id={name} name={name} type={type} autoComplete={autoComplete} value={value} onChange={(event) => onChange(event.target.value)} required={required} />{action}</span>{hint && <span className="auth-field__hint">{hint}</span>}</label>;
}

export default function AuthExperience({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const search = useSearchParams();
  const requestedReturnTo = search.get("returnTo");
  const returnTo = requestedReturnTo?.startsWith("/") && !requestedReturnTo.startsWith("//") ? requestedReturnTo : "/dashboard";
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const [name, setName] = useState("");
  const [email, setEmail] = useState(search.get("email") ?? "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [routing, setRouting] = useState(false);
  const navigating = useRef(false);

  const openAccount = useCallback(async () => {
    if (navigating.current) return;
    navigating.current = true;
    setRouting(true);
    try {
      const destination = returnTo === "/dashboard"
        ? (await client.accountAccess()).isStaff ? "/admin" : "/dashboard"
        : returnTo;
      router.replace(destination as Route);
    } catch (cause) {
      navigating.current = false;
      setRouting(false);
      setError(cause instanceof Error ? cause.message : "We couldn’t open your account. Please try again.");
    }
  }, [returnTo, router]);

  useEffect(() => {
    if (!busy && !sessionPending && session?.user?.emailVerified && ["sign-in", "sign-up", "verify-email"].includes(mode)) void openAccount();
  }, [busy, mode, openAccount, session, sessionPending]);

  const content = copy[mode];
  const verificationCallback = typeof window === "undefined" ? "/verify-email" : `${window.location.origin}/verify-email`;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      if (mode === "sign-up") {
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        const result = await authClient.signUp.email({ name: name.trim(), email: email.trim(), password, callbackURL: verificationCallback });
        if (result.error) throw new Error(result.error.message || "We couldn’t create your account. Try again.");
        setMessage(`We sent a verification link to ${email.trim()}. Verify your email to open your account.`);
        return;
      }
      if (mode === "sign-in") {
        const result = await authClient.signIn.email({ email: email.trim(), password, callbackURL: `${window.location.origin}${returnTo}` });
        if (result.error) throw new Error(result.error.message || "Email or password is incorrect.");
        await openAccount();
        return;
      }
      if (mode === "forgot-password") {
        const result = await authClient.requestPasswordReset({ email: email.trim(), redirectTo: `${window.location.origin}/reset-password` });
        if (result.error) throw new Error(result.error.message || "We couldn’t send the reset email. Try again.");
        setMessage("If there’s an account for that address, a reset link is on its way.");
        return;
      }
      if (mode === "reset-password") {
        const token = search.get("token");
        if (!token) throw new Error("This reset link is incomplete. Request a new password reset email.");
        if (password.length < 8) throw new Error("Use at least 8 characters for your password.");
        if (password !== confirmPassword) throw new Error("Your passwords do not match.");
        const result = await authClient.resetPassword({ newPassword: password, token });
        if (result.error) throw new Error(result.error.message || "This reset link may have expired. Request another.");
        setMessage("Your password is updated. You can sign in with it now.");
        return;
      }
      if (mode === "verify-email") {
        const targetEmail = email.trim() || session?.user?.email;
        if (!targetEmail) throw new Error("Enter the email address you used to create your account.");
        const result = await authClient.sendVerificationEmail({ email: targetEmail, callbackURL: verificationCallback });
        if (result.error) throw new Error(result.error.message || "We couldn’t send the verification email. Try again shortly.");
        setEmail(targetEmail);
        setMessage(`A fresh verification link is on its way to ${targetEmail}.`);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  return <main className="auth-page">
    <section className="auth-visual" aria-label="BASNY collection">
      <Image src="/images/hero/sandals-shoulder-bag.png" alt="Chocolate sandals and a cream shoulder bag from BASNY’s collection" fill priority sizes="(max-width: 800px) 100vw, 52vw" />
      <div className="auth-visual__shade" />
      <Brand />
      <div className="auth-visual__caption"><p>FROM ACCRA, WITH CARE</p><h2>Good pieces.<br />Made for your day.</h2><span>Thoughtful shoes, bags and accessories.</span></div>
    </section>
    <section className="auth-panel">
      <div className="auth-panel__top"><Brand /><Link href="/shop">Continue shopping <HugeiconsIcon icon={ArrowRight01Icon} aria-hidden="true" /></Link></div>
      <div className="auth-card">
        <p className="eyebrow">{content.eyebrow}</p>
        <h1>{content.title}</h1>
        <p className="auth-card__intro">{content.body}</p>
        {mode === "verify-email" && <div className="auth-verify-note"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /><span>Check your spam folder too. Verification links expire for your security.</span></div>}
        {message ? <div className="auth-feedback auth-feedback--success" role="status"><HugeiconsIcon icon={CheckmarkCircle02Icon} aria-hidden="true" /><span>{message}</span></div> : null}
        {error ? <p className="auth-feedback auth-feedback--error" role="alert">{error}</p> : null}
        <form className="auth-form" onSubmit={submit} aria-busy={busy}>
          {mode === "sign-up" && <Field label="Full name" name="name" value={name} onChange={setName} autoComplete="name" />}
          {(mode !== "reset-password") && <Field label="Email address" name="email" type="email" value={email} onChange={setEmail} autoComplete="email" required={mode !== "verify-email" || !session?.user?.email} />}
          {(mode === "sign-in" || mode === "sign-up" || mode === "reset-password") && <Field label={mode === "reset-password" ? "New password" : "Password"} name="password" type={showPassword ? "text" : "password"} value={password} onChange={setPassword} autoComplete={mode === "sign-in" ? "current-password" : "new-password"} hint={mode !== "sign-in" ? "At least 8 characters" : undefined} action={<button className="auth-show-password" type="button" onClick={() => setShowPassword((show) => !show)} aria-label={showPassword ? "Hide password" : "Show password"}>{showPassword ? "Hide" : "Show"}</button>} />}
          {mode === "reset-password" && <Field label="Confirm new password" name="confirmPassword" type={showPassword ? "text" : "password"} value={confirmPassword} onChange={setConfirmPassword} autoComplete="new-password" />}
          {mode === "sign-in" && <div className="auth-form__aside"><span>Secure sign-in</span><Link href="/forgot-password">Forgot password?</Link></div>}
          <button className="auth-submit" type="submit" disabled={busy || routing || (sessionPending && (mode === "sign-in" || mode === "sign-up"))}>
            <span className={busy || routing ? "auth-spinner" : "auth-submit__arrow"} aria-hidden="true">{busy || routing ? "" : <HugeiconsIcon icon={ArrowRight01Icon} />}</span>
            <span>{routing ? "Opening your account" : busy ? (mode === "sign-in" ? "Signing you in" : "One moment") : content.cta}</span>
          </button>
        </form>
        {mode === "sign-in" && <p className="auth-switch">New to BASNY? <Link href="/register">Create an account</Link></p>}
        {mode === "sign-up" && <p className="auth-switch">Already have an account? <Link href="/login">Sign in</Link></p>}
        {mode === "forgot-password" && <p className="auth-switch"><Link href="/login"><HugeiconsIcon icon={ArrowLeft01Icon} aria-hidden="true" /> Back to sign in</Link></p>}
        {mode === "reset-password" && message && <p className="auth-switch"><Link href="/login">Continue to sign in</Link></p>}
        {mode === "verify-email" && <p className="auth-switch">Already verified? <Link href="/login">Sign in</Link></p>}
      </div>
      <div className="auth-panel__foot"><span>Accra, Ghana</span><span>Delivery across Ghana</span></div>
    </section>
  </main>;
}
