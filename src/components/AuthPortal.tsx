import { FormEvent, useEffect, useRef, useState } from 'react';
import { platformConfig } from '../config/platform.config';
import type { AuthCopy, AuthLocale } from '../i18n/auth-content';
import { VoiceFieldButton } from './AccessibilityTools';

export type AuthUser = { id: string; permanentId: string; name: string; role: 'user' | 'moderator' | 'adheed' | 'super_admin'; walletBalance: number; verified: boolean };
type Step = 'start' | 'register' | 'registerVerify' | 'login' | 'loginVerify' | 'ownerStart' | 'ownerVerify';
type Props = { locale: AuthLocale; text: AuthCopy; user: AuthUser | null; onAuthenticated: (user: AuthUser) => void; onSignedOut: () => void; onNavigate: (route: '/privacy' | '/terms') => void };
type FormData = { name: string; email: string; phone: string; whatsapp: string; referral: string; code: string; pin: string; confirmPin: string; terms: boolean; privacy: boolean; eligibility: boolean; trust: boolean };
const blank: FormData = { name: '', email: '', phone: '', whatsapp: '', referral: typeof window === 'undefined' ? '' : (new URLSearchParams(window.location.search).get('ref') ?? '').toUpperCase(), code: '', pin: '', confirmPin: '', terms: false, privacy: false, eligibility: false, trust: true };

function apiError(code: string | undefined, text: AuthCopy) {
  const messages: Record<string, string> = { invalid_email: text.invalidEmail, invalid_pin: text.invalidPin, invalid_code: text.verificationFailed, challenge_expired: text.verificationFailed, challenge_limited: text.limited, limited: text.limited, account_locked: text.locked, delivery_failed: text.deliveryFailed, human_failed: text.humanFailed, email_in_use: text.emailInUse, invalid_login: text.loginFailed, pin_not_set: text.loginFailed, invalid_referral: text.referralHint, referral_locked: text.referralHint };
  return messages[code ?? ''] ?? text.unknown;
}
function validPin(pin: string) { return /^\d{6}$/.test(pin); }
function validEmail(email: string) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email); }
function focusHeading(element: HTMLHeadingElement | null) { window.setTimeout(() => { element?.scrollIntoView({ behavior: 'smooth', block: 'center' }); element?.focus({ preventScroll: true }); }, 0); }

export function AuthPortal({ locale, text, user, onAuthenticated, onSignedOut, onNavigate }: Props) {
  const [step, setStep] = useState<Step>('start');
  const [form, setForm] = useState<FormData>(blank);
  const [token, setToken] = useState('');
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showPin, setShowPin] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const update = <K extends keyof FormData>(key: K, value: FormData[K]) => setForm((current) => ({ ...current, [key]: value }));
  const changeStep = (next: Step, announcement = '') => { setError(''); setStatus(announcement); setStep(next); };
  useEffect(() => { if (step !== 'start') focusHeading(heading.current); }, [step]);

  useEffect(() => {
    if (!['register', 'ownerStart'].includes(step)) return;
    const scriptId = 'cf-turnstile-script';
    const existing = document.getElementById(scriptId);
    const render = () => {
      const container = document.getElementById('turnstile-container');
      const turnstile = (window as Window & { turnstile?: { render: (node: HTMLElement, options: { sitekey: string; callback: (response: string) => void; 'expired-callback': () => void }) => void } }).turnstile;
      if (container && turnstile && !container.dataset.rendered) { container.dataset.rendered = 'true'; turnstile.render(container, { sitekey: platformConfig.verification.turnstileSiteKey, callback: setToken, 'expired-callback': () => setToken('') }); }
    };
    if (existing) { existing.addEventListener('load', render, { once: true }); window.setTimeout(render, 0); return; }
    const script = document.createElement('script'); script.id = scriptId; script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'; script.async = true; script.defer = true; script.addEventListener('load', render, { once: true }); document.head.appendChild(script);
  }, [step]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...body, locale }) });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; user?: AuthUser; state?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'unknown');
    return payload;
  };
  const submitRegistration = async (event: FormEvent) => {
    event.preventDefault(); setError(''); setStatus('');
    if (!form.name.trim() || !validEmail(form.email) || !form.terms || !form.privacy || !form.eligibility) { setError(!validEmail(form.email) && form.email ? text.invalidEmail : text.required); return; }
    if (!token) { setError(text.humanFailed); return; }
    setBusy(true); try { await post('/api/auth/register', { name: form.name.trim(), email: form.email, phone: form.phone, whatsapp: form.whatsapp, referralPermanentId: form.referral, termsAccepted: form.terms, privacyAccepted: form.privacy, eligibilityAccepted: form.eligibility, turnstileToken: token }); changeStep('registerVerify', text.codeSent); } catch (cause) { setError(apiError(cause instanceof Error ? cause.message : undefined, text)); } finally { setBusy(false); }
  };
  const verifyRegistration = async (event: FormEvent) => {
    event.preventDefault(); setError(''); if (!/^\d{6}$/.test(form.code)) { setError(text.verificationFailed); return; } if (!validPin(form.pin)) { setError(text.invalidPin); return; } if (form.pin !== form.confirmPin) { setError(text.pinMismatch); return; }
    setBusy(true); try { const result = await post('/api/auth/register/verify', { email: form.email, code: form.code, pin: form.pin, trustDevice: form.trust }); if (result.user) onAuthenticated(result.user); } catch (cause) { setError(apiError(cause instanceof Error ? cause.message : undefined, text)); } finally { setBusy(false); }
  };
  const submitLogin = async (event: FormEvent) => {
    event.preventDefault(); setError(''); if (!validEmail(form.email)) { setError(text.invalidEmail); return; } if (!validPin(form.pin)) { setError(text.invalidPin); return; }
    setBusy(true); try { const result = await post('/api/auth/login/start', { email: form.email, pin: form.pin }); if (result.state === 'verification_required') { changeStep('loginVerify', text.codeSent); } else if (result.user) onAuthenticated(result.user); } catch (cause) { setError(apiError(cause instanceof Error ? cause.message : undefined, text)); } finally { setBusy(false); }
  };
  const verifyLogin = async (event: FormEvent) => {
    event.preventDefault(); setError(''); if (!/^\d{6}$/.test(form.code)) { setError(text.verificationFailed); return; }
    setBusy(true); try { const result = await post('/api/auth/login/verify', { email: form.email, code: form.code, trustDevice: form.trust }); if (result.user) onAuthenticated(result.user); } catch (cause) { setError(apiError(cause instanceof Error ? cause.message : undefined, text)); } finally { setBusy(false); }
  };
  const startOwner = async (event: FormEvent) => {
    event.preventDefault(); setError(''); if (!validEmail(form.email)) { setError(text.invalidEmail); return; } if (!token) { setError(text.humanFailed); return; }
    setBusy(true); try { await post('/api/auth/owner/start', { email: form.email, turnstileToken: token }); changeStep('ownerVerify', text.codeSent); } catch (cause) { setError(apiError(cause instanceof Error ? cause.message : undefined, text)); } finally { setBusy(false); }
  };
  const verifyOwner = async (event: FormEvent) => {
    event.preventDefault(); setError(''); if (!/^\d{6}$/.test(form.code)) { setError(text.verificationFailed); return; } if (!validPin(form.pin) || form.pin !== form.confirmPin) { setError(form.pin !== form.confirmPin ? text.pinMismatch : text.invalidPin); return; }
    setBusy(true); try { const result = await post('/api/auth/owner/verify', { email: form.email, code: form.code, pin: form.pin, trustDevice: form.trust }); if (result.user) onAuthenticated(result.user); } catch (cause) { setError(apiError(cause instanceof Error ? cause.message : undefined, text)); } finally { setBusy(false); }
  };
  const logout = async () => { setBusy(true); try { await post('/api/auth/logout', {}); onSignedOut(); changeStep('start'); } catch { setError(text.unknown); } finally { setBusy(false); } };
  const Status = () => <><p className="sr-status" role="status" aria-live="polite">{status}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}</>;
  const PinFields = ({ confirmation = false }: { confirmation?: boolean }) => <>{<label htmlFor="auth-pin">{text.pin}</label>}<div className="pin-row"><input id="auth-pin" type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" autoComplete={confirmation ? 'new-password' : 'current-password'} maxLength={6} value={form.pin} onChange={(event) => update('pin', event.target.value.replace(/\D/g, ''))} required /><button type="button" className="outline-button pin-toggle" onClick={() => setShowPin((value) => !value)} aria-pressed={showPin}>{showPin ? text.hidePin : text.showPin}</button></div>{confirmation ? <><label htmlFor="auth-confirm-pin">{text.confirmPin}</label><input id="auth-confirm-pin" type={showPin ? 'text' : 'password'} inputMode="numeric" pattern="[0-9]{6}" autoComplete="new-password" maxLength={6} value={form.confirmPin} onChange={(event) => update('confirmPin', event.target.value.replace(/\D/g, ''))} required /></> : null}</>;
  const CodeField = () => <><label htmlFor="auth-code">{text.code}</label><input id="auth-code" inputMode="numeric" pattern="[0-9]{6}" autoComplete="one-time-code" maxLength={6} value={form.code} onChange={(event) => update('code', event.target.value.replace(/\D/g, ''))} required /></>;
  if (user) return <section className="account-panel" aria-labelledby="account-title"><p className="eyebrow">{user.role === 'super_admin' ? text.sovereignTitle : text.account}</p><h2 id="account-title" tabIndex={-1}>{user.role === 'super_admin' ? text.sovereignTitle : text.accountTitle}</h2><p>{text.accountLead}</p><dl><div><dt>{text.accountId}</dt><dd>{user.permanentId}</dd></div><div><dt>{text.points}</dt><dd>{user.walletBalance}</dd></div><div><dt>{text.verified}</dt><dd>{user.verified ? '✓' : '—'}</dd></div></dl><button className="outline-button" type="button" disabled={busy} onClick={() => void logout()}>{text.signOut}</button><Status /></section>;
  return <section className="auth-portal" aria-labelledby="auth-title"><div className="auth-steps" aria-label={text.instructions}><span className={step === 'register' || step === 'registerVerify' ? 'is-current' : ''}>{text.stepRegister}</span><span className={step.includes('Verify') ? 'is-current' : ''}>{text.stepVerify}</span><span className={step === 'login' || step === 'loginVerify' ? 'is-current' : ''}>{text.stepEnter}</span></div>
    {step === 'start' ? <div className="auth-start"><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.startTitle}</h2><p>{text.startLead}</p><div className="auth-choice"><button className="gold-button" type="button" onClick={() => changeStep('register')}>{text.register}</button><button className="outline-button" type="button" onClick={() => changeStep('login')}>{text.signIn}</button></div><button className="text-button" type="button" onClick={() => changeStep('ownerStart')}>{text.ownerSetup}</button></div> : null}
    {step === 'register' ? <form className="auth-form" onSubmit={submitRegistration} noValidate><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.registerTitle}</h2><p>{text.registerLead}</p><label htmlFor="auth-name">{text.name}</label><div className="voice-input-row"><input id="auth-name" autoComplete="name" value={form.name} onChange={(event) => update('name', event.target.value)} required /><VoiceFieldButton locale={locale} text={text} onResult={(value) => update('name', value)} /></div><label htmlFor="auth-email">{text.email}</label><input id="auth-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} required /><label htmlFor="auth-phone">{text.phone} <span className="optional">{text.optional}</span></label><input id="auth-phone" type="tel" autoComplete="tel" value={form.phone} onChange={(event) => update('phone', event.target.value)} /><label htmlFor="auth-whatsapp">{text.whatsapp} <span className="optional">{text.optional}</span></label><input id="auth-whatsapp" type="tel" value={form.whatsapp} onChange={(event) => update('whatsapp', event.target.value)} /><label htmlFor="auth-referral">{text.referralId} <span className="optional">{text.optional}</span></label><input id="auth-referral" dir="ltr" autoCapitalize="characters" value={form.referral} maxLength={20} aria-describedby="auth-referral-hint" onChange={(event) => update('referral', event.target.value.toUpperCase())} /><p id="auth-referral-hint" className="form-help">{text.referralHint}</p><button className="text-button" type="button" onClick={() => { const target = document.getElementById('contact-help'); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); target?.focus({ preventScroll: true }); }}>{text.contactHelp}</button><p id="contact-help" className="form-help" tabIndex={-1}>{text.contactHelpText}</p><fieldset><legend>{text.required}</legend><div className="check-row"><label className="check-label"><input type="checkbox" checked={form.terms} onChange={(event) => update('terms', event.target.checked)} />{text.termsAccept}</label><button className="inline-link" type="button" onClick={() => onNavigate('/terms')}>{text.termsLink}</button></div><div className="check-row"><label className="check-label"><input type="checkbox" checked={form.privacy} onChange={(event) => update('privacy', event.target.checked)} />{text.privacyAccept}</label><button className="inline-link" type="button" onClick={() => onNavigate('/privacy')}>{text.privacyLink}</button></div><label className="check-label"><input type="checkbox" checked={form.eligibility} onChange={(event) => update('eligibility', event.target.checked)} />{text.eligibilityAccept}</label></fieldset><div className="human-check"><strong>{text.humanCheck}</strong><p>{text.humanCheckHint}</p><div id="turnstile-container" /></div><Status /><div className="form-actions"><button className="outline-button" type="button" onClick={() => changeStep('start')}>{text.back}</button><button className="gold-button" disabled={busy} type="submit">{busy ? text.sending : text.continue}</button></div></form> : null}
    {step === 'registerVerify' ? <form className="auth-form" onSubmit={verifyRegistration} noValidate><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.verifyTitle}</h2><p>{text.verifyLead}</p><CodeField /><PinFields confirmation /><label className="check-label"><input type="checkbox" checked={form.trust} onChange={(event) => update('trust', event.target.checked)} />{text.trustDevice}</label><Status /><div className="form-actions"><button className="outline-button" type="button" onClick={() => changeStep('register')}>{text.back}</button><button className="gold-button" disabled={busy} type="submit">{text.verifyAndCreate}</button></div></form> : null}
    {step === 'login' ? <form className="auth-form" onSubmit={submitLogin} noValidate><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.loginTitle}</h2><p>{text.loginLead}</p><label htmlFor="login-email">{text.email}</label><input id="login-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} required /><PinFields /><Status /><div className="form-actions"><button className="outline-button" type="button" onClick={() => changeStep('start')}>{text.back}</button><button className="gold-button" disabled={busy} type="submit">{text.login}</button></div></form> : null}
    {step === 'loginVerify' ? <form className="auth-form" onSubmit={verifyLogin} noValidate><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.verifyTitle}</h2><p>{text.verifyLead}</p><CodeField /><label className="check-label"><input type="checkbox" checked={form.trust} onChange={(event) => update('trust', event.target.checked)} />{text.trustDevice}</label><Status /><div className="form-actions"><button className="outline-button" type="button" onClick={() => changeStep('login')}>{text.back}</button><button className="gold-button" disabled={busy} type="submit">{text.verifyAndEnter}</button></div></form> : null}
    {step === 'ownerStart' ? <form className="auth-form" onSubmit={startOwner} noValidate><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.ownerSetupTitle}</h2><p>{text.ownerSetupLead}</p><label htmlFor="owner-email">{text.email}</label><input id="owner-email" type="email" autoComplete="email" value={form.email} onChange={(event) => update('email', event.target.value)} required /><div className="human-check"><strong>{text.humanCheck}</strong><p>{text.humanCheckHint}</p><div id="turnstile-container" /></div><Status /><div className="form-actions"><button className="outline-button" type="button" onClick={() => changeStep('start')}>{text.back}</button><button className="gold-button" disabled={busy} type="submit">{text.ownerSetupStart}</button></div></form> : null}
    {step === 'ownerVerify' ? <form className="auth-form" onSubmit={verifyOwner} noValidate><h2 id="auth-title" ref={heading} tabIndex={-1}>{text.ownerSetupTitle}</h2><p>{text.verifyLead}</p><CodeField /><PinFields confirmation /><label className="check-label"><input type="checkbox" checked={form.trust} onChange={(event) => update('trust', event.target.checked)} />{text.trustDevice}</label><Status /><div className="form-actions"><button className="outline-button" type="button" onClick={() => changeStep('ownerStart')}>{text.back}</button><button className="gold-button" disabled={busy} type="submit">{text.ownerSetupVerify}</button></div></form> : null}
  </section>;
}
