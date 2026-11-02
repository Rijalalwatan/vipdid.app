import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { walletContent, type WalletLocale } from '../i18n/wallet-content';
import { jumpToSection } from './SiteChrome';
import type { AuthUser } from './AuthPortal';

type LedgerEntry = { id: string; amount: number; type: string; createdAt: number; direction: 'incoming' | 'outgoing' };
type GrantRequest = { id: string; status: 'pending' | 'approved' | 'rejected'; reason: string; category: 'seasonal' | 'exceptional' | 'activity' | null; amount: number | null; requestedAt: number; reviewerReason: string | null };
type WalletState = { balance: number; permanentId: string; activeDays: number; referral: { link: string; referrer: string | null }; entries: LedgerEntry[]; grantRequests: GrantRequest[] };
type AdminRequest = GrantRequest & { userName: string; permanentId: string };
type AdminState = { treasuryBalance: number; pendingRequests: AdminRequest[] };
type Props = { locale: WalletLocale; user: AuthUser; onUserUpdated: (user: AuthUser) => void };

const permanentPattern = /^C[1-9]\d*$/;
const categories = ['seasonal', 'exceptional', 'activity'] as const;
function numberFormat(value: number, locale: WalletLocale) { return new Intl.NumberFormat(locale === 'ar' ? 'ar-SA' : 'en-US').format(value); }
function dateFormat(value: number, locale: WalletLocale) { return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' }).format(value); }
function positiveInteger(value: string) { const amount = Number(value); return Number.isSafeInteger(amount) && amount > 0 ? amount : null; }

export function WalletPortal({ locale, user, onUserUpdated }: Props) {
  const text = walletContent[locale];
  const [wallet, setWallet] = useState<WalletState | null>(null);
  const [admin, setAdmin] = useState<AdminState | null>(null);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [recipient, setRecipient] = useState('');
  const [transferAmount, setTransferAmount] = useState('');
  const [days, setDays] = useState('1');
  const [grantReason, setGrantReason] = useState('');
  const [directRecipient, setDirectRecipient] = useState('');
  const [directAmount, setDirectAmount] = useState('');
  const [directCategory, setDirectCategory] = useState<(typeof categories)[number]>('seasonal');
  const [directReason, setDirectReason] = useState('');
  const [reviewValues, setReviewValues] = useState<Record<string, { amount: string; category: (typeof categories)[number]; note: string }>>({});
  const [adminPin, setAdminPin] = useState('');

  const loadWallet = useCallback(async () => {
    const response = await fetch('/api/account/wallet', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; wallet?: WalletState; error?: string };
    if (!response.ok || !payload.ok || !payload.wallet) throw new Error(payload.error ?? 'wallet_failed');
    setWallet(payload.wallet);
  }, []);
  const loadAdmin = useCallback(async () => {
    if (user.role !== 'super_admin') return;
    const response = await fetch('/api/admin/wallet/overview', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; overview?: AdminState };
    if (response.ok && payload.ok && payload.overview) setAdmin(payload.overview);
  }, [user.role]);
  const refresh = useCallback(async () => { setError(''); try { await Promise.all([loadWallet(), loadAdmin()]); } catch { setError(text.generalFailure); } }, [loadAdmin, loadWallet, text.generalFailure]);
  useEffect(() => { void refresh(); }, [refresh]);

  const post = async (path: string, body: Record<string, unknown>) => {
    const securedBody = path.startsWith('/api/admin/wallet/') ? { ...body, stepUpPin: adminPin } : body;
    const response = await fetch(path, { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify(securedBody) });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string; user?: AuthUser };
    if (!response.ok || !payload.ok) throw new Error(payload.error ?? 'wallet_failed');
    if (payload.user) onUserUpdated(payload.user);
    if (path.startsWith('/api/admin/wallet/')) setAdminPin('');
    await Promise.all([loadWallet(), loadAdmin()]);
  };
  const run = async (action: () => Promise<void>, success: string, failure: string) => { setBusy(true); setError(''); setStatus(''); try { await action(); setStatus(success); } catch { setError(failure); } finally { setBusy(false); } };
  const submitTransfer = (event: FormEvent) => { event.preventDefault(); const amount = positiveInteger(transferAmount); const target = recipient.trim().toUpperCase(); if (!amount) { setError(text.invalidAmount); return; } if (!permanentPattern.test(target)) { setError(text.invalidRecipient); return; } if (target === user.permanentId) { setError(text.transferSelf); return; } void run(async () => { await post('/api/account/wallet/transfer', { recipientPermanentId: target, amount, idempotencyKey: `transfer_${crypto.randomUUID()}` }); setRecipient(''); setTransferAmount(''); }, text.transferSuccess, text.transferFailed); };
  const submitRedeem = (event: FormEvent) => { event.preventDefault(); const requestedDays = positiveInteger(days); if (!requestedDays) { setError(text.invalidAmount); return; } void run(async () => { await post('/api/account/wallet/redeem-days', { days: requestedDays, idempotencyKey: `redeem_${crypto.randomUUID()}` }); }, text.redeemSuccess, text.redeemFailed); };
  const submitGrant = (event: FormEvent) => { event.preventDefault(); if (grantReason.trim().length < 8) { setError(text.grantRequestFailed); return; } void run(async () => { await post('/api/account/wallet/grant-requests', { reason: grantReason.trim() }); setGrantReason(''); }, text.grantRequested, text.grantRequestFailed); };
  const copyReferral = async () => { if (!wallet) return; try { await navigator.clipboard.writeText(wallet.referral.link); setStatus(text.copied); } catch { setError(text.generalFailure); } };
  const decision = (request: AdminRequest, approve: boolean) => {
    const values = reviewValues[request.id] ?? { amount: '', category: 'seasonal', note: '' as string };
    if (!values.note.trim() || (approve && !positiveInteger(values.amount))) { setError(approve ? text.invalidAmount : text.decisionRequired); return; }
    void run(async () => { await post(`/api/admin/wallet/grant-requests/${encodeURIComponent(request.id)}/decision`, { decision: approve ? 'approved' : 'rejected', amount: approve ? positiveInteger(values.amount) : undefined, category: values.category, note: values.note.trim() }); }, text.decisionSuccess, text.decisionFailed);
  };
  const submitDirectGrant = (event: FormEvent) => { event.preventDefault(); const amount = positiveInteger(directAmount); const target = directRecipient.trim().toUpperCase(); if (!amount) { setError(text.invalidAmount); return; } if (!permanentPattern.test(target)) { setError(text.invalidRecipient); return; } if (directReason.trim().length < 4) { setError(text.decisionRequired); return; } void run(async () => { await post('/api/admin/wallet/grants', { recipientPermanentId: target, amount, category: directCategory, reason: directReason.trim(), idempotencyKey: `admin_grant_${crypto.randomUUID()}` }); setDirectRecipient(''); setDirectAmount(''); setDirectReason(''); }, text.directGrantSuccess, text.directGrantFailed); };

  const tabs = useMemo(() => [{ id: 'wallet-overview', label: text.tabs.overview }, { id: 'wallet-history', label: text.tabs.history }, { id: 'wallet-transfer', label: text.tabs.transfer }, { id: 'wallet-redeem', label: text.tabs.redeem }, { id: 'wallet-referral', label: text.tabs.referral }, { id: 'wallet-grants', label: text.tabs.grants }], [text]);
  if (!wallet) return <section className="dashboard-section wallet-panel" id="dashboard-wallet" tabIndex={-1} aria-live="polite"><p>{text.loading}</p></section>;

  return <section className="wallet-shell" id="dashboard-wallet" aria-labelledby="wallet-title"><header className="wallet-hero"><p className="eyebrow">{text.pointUnit}</p><h2 id="wallet-title">{text.title}</h2><p>{text.lead}</p><button className="outline-button" type="button" onClick={() => void refresh()} disabled={busy}>{text.refresh}</button></header><nav className="wallet-tabs" aria-label={text.title}>{tabs.map((tab) => <button key={tab.id} type="button" onClick={() => jumpToSection(tab.id)}>{tab.label}</button>)}</nav><p className="sr-status" role="status" aria-live="polite">{status}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}
    <section className="dashboard-section wallet-overview" id="wallet-overview" tabIndex={-1} aria-labelledby="wallet-overview-title"><h3 id="wallet-overview-title">{text.tabs.overview}</h3><div className="wallet-summary"><article><span>{text.available}</span><strong>{numberFormat(wallet.balance, locale)}</strong><small>{text.pointsUnit}</small></article><article><span>{text.activeDays}</span><strong>{numberFormat(wallet.activeDays, locale)}</strong><small>{text.days}</small></article><article><span>{text.permanentId}</span><strong dir="ltr">{wallet.permanentId}</strong><small>{text.pointUnit}</small></article></div></section>
    <section className="dashboard-section" id="wallet-history" tabIndex={-1} aria-labelledby="wallet-history-title"><h3 id="wallet-history-title">{text.historyTitle}</h3><p>{text.historyLead}</p>{wallet.entries.length ? <div className="wallet-history">{wallet.entries.map((entry) => <article key={entry.id}><span className={entry.direction === 'incoming' ? 'wallet-credit' : 'wallet-debit'}>{entry.direction === 'incoming' ? text.incoming : text.outgoing}</span><strong>{(text.transactionTypes as Record<string, string>)[entry.type] ?? entry.type}</strong><b>{entry.direction === 'incoming' ? '+' : '-'}{numberFormat(entry.amount, locale)}</b><time dateTime={new Date(entry.createdAt).toISOString()}>{dateFormat(entry.createdAt, locale)}</time></article>)}</div> : <p className="empty-section">{text.noHistory}</p>}</section>
    <section className="dashboard-section" id="wallet-transfer" tabIndex={-1} aria-labelledby="wallet-transfer-title"><h3 id="wallet-transfer-title">{text.transferTitle}</h3><p>{text.transferLead}</p><form className="wallet-form" onSubmit={submitTransfer}><label htmlFor="wallet-recipient">{text.recipientId}<input id="wallet-recipient" dir="ltr" value={recipient} maxLength={20} onChange={(event) => setRecipient(event.target.value.toUpperCase())} required /></label><label htmlFor="wallet-transfer-amount">{text.amount}<input id="wallet-transfer-amount" type="number" min="1" step="1" inputMode="numeric" value={transferAmount} onChange={(event) => setTransferAmount(event.target.value)} required /></label><button className="gold-button" type="submit" disabled={busy}>{text.transfer}</button></form></section>
    <section className="dashboard-section" id="wallet-redeem" tabIndex={-1} aria-labelledby="wallet-redeem-title"><h3 id="wallet-redeem-title">{text.redeemTitle}</h3><p>{text.redeemLead}</p><form className="wallet-form" onSubmit={submitRedeem}><label htmlFor="wallet-days">{text.days}<input id="wallet-days" type="number" min="1" step="1" inputMode="numeric" value={days} onChange={(event) => setDays(event.target.value)} required /></label><p className="field-hint">{text.redeemCost}</p><button className="gold-button" type="submit" disabled={busy}>{text.redeem}</button></form></section>
    <section className="dashboard-section" id="wallet-referral" tabIndex={-1} aria-labelledby="wallet-referral-title"><h3 id="wallet-referral-title">{text.referralTitle}</h3><p>{text.referralLead}</p><label className="wallet-referral-link" htmlFor="wallet-referral-link">{text.referralLink}<input id="wallet-referral-link" dir="ltr" readOnly value={wallet.referral.link} /></label><div className="dashboard-actions"><button className="outline-button" type="button" onClick={() => void copyReferral()}>{text.copyLink}</button></div><p className="field-hint">{wallet.referral.referrer ? `${text.referrer}: ${wallet.referral.referrer}` : text.noReferrer}</p></section>
    <section className="dashboard-section" id="wallet-grants" tabIndex={-1} aria-labelledby="wallet-grants-title"><h3 id="wallet-grants-title">{text.grantTitle}</h3><p>{text.grantLead}</p><form className="wallet-form" onSubmit={submitGrant}><label htmlFor="wallet-grant-reason">{text.grantReason}<textarea id="wallet-grant-reason" rows={4} maxLength={800} value={grantReason} onChange={(event) => setGrantReason(event.target.value)} required /></label><button className="gold-button" type="submit" disabled={busy}>{text.sendGrantRequest}</button></form><h4>{text.grantRequests}</h4>{wallet.grantRequests.length ? <div className="grant-history">{wallet.grantRequests.map((request) => <article key={request.id}><strong>{text[request.status]}</strong><p>{request.reason}</p>{request.amount ? <p>{numberFormat(request.amount, locale)} · {request.category ? text[request.category] : ''}</p> : null}{request.reviewerReason ? <p>{request.reviewerReason}</p> : null}<time dateTime={new Date(request.requestedAt).toISOString()}>{dateFormat(request.requestedAt, locale)}</time></article>)}</div> : <p className="empty-section">{text.noGrantRequests}</p>}</section>
    {user.role === 'super_admin' ? <section className="dashboard-section wallet-admin" id="wallet-admin" tabIndex={-1} aria-labelledby="wallet-admin-title"><h3 id="wallet-admin-title">{text.adminTitle}</h3><p>{text.adminLead}</p><label htmlFor="wallet-admin-pin">{text.stepUpPin}<input id="wallet-admin-pin" type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={adminPin} onChange={(event) => setAdminPin(event.target.value.replace(/\D/g, ''))} required /></label><p className="field-hint">{text.stepUpLead}</p><div className="wallet-admin-balance"><span>{text.treasury}</span><strong>{numberFormat(admin?.treasuryBalance ?? 0, locale)}</strong><small>{text.pointsUnit}</small></div><h4>{text.pendingGrantRequests}</h4>{admin?.pendingRequests.length ? <div className="grant-review-list">{admin.pendingRequests.map((request) => { const values = reviewValues[request.id] ?? { amount: '', category: 'seasonal' as const, note: '' }; return <article key={request.id}><strong>{request.userName} <span dir="ltr">{request.permanentId}</span></strong><p>{request.reason}</p><label>{text.grantAmount}<input type="number" min="1" step="1" inputMode="numeric" value={values.amount} onChange={(event) => setReviewValues((current) => ({ ...current, [request.id]: { ...values, amount: event.target.value } }))} /></label><label>{text.category}<select value={values.category} onChange={(event) => setReviewValues((current) => ({ ...current, [request.id]: { ...values, category: event.target.value as typeof values.category } }))}>{categories.map((category) => <option key={category} value={category}>{text[category]}</option>)}</select></label><label>{text.reviewerReason}<textarea rows={3} maxLength={800} value={values.note} onChange={(event) => setReviewValues((current) => ({ ...current, [request.id]: { ...values, note: event.target.value } }))} /></label><div className="dashboard-actions"><button className="gold-button" type="button" disabled={busy} onClick={() => decision(request, true)}>{text.approveGrant}</button><button className="outline-button" type="button" disabled={busy} onClick={() => decision(request, false)}>{text.rejectGrant}</button></div></article>; })}</div> : <p className="empty-section">{text.noPendingGrantRequests}</p>}<h4>{text.directGrant}</h4><p>{text.directGrantLead}</p><form className="wallet-form" onSubmit={submitDirectGrant}><label htmlFor="direct-recipient">{text.grantRecipient}<input id="direct-recipient" dir="ltr" value={directRecipient} maxLength={20} onChange={(event) => setDirectRecipient(event.target.value.toUpperCase())} required /></label><label htmlFor="direct-amount">{text.grantAmount}<input id="direct-amount" type="number" min="1" step="1" inputMode="numeric" value={directAmount} onChange={(event) => setDirectAmount(event.target.value)} required /></label><label htmlFor="direct-category">{text.category}<select id="direct-category" value={directCategory} onChange={(event) => setDirectCategory(event.target.value as typeof directCategory)}>{categories.map((category) => <option key={category} value={category}>{text[category]}</option>)}</select></label><label htmlFor="direct-reason">{text.reviewerReason}<textarea id="direct-reason" rows={3} maxLength={800} value={directReason} onChange={(event) => setDirectReason(event.target.value)} required /></label><button className="gold-button" type="submit" disabled={busy}>{text.sendDirectGrant}</button></form></section> : null}
  </section>;
}
