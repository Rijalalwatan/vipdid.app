import { FormEvent, useEffect, useState } from 'react';
import { ScrollPills } from './SiteChrome';
import type { SovereigntyLocale } from '../i18n/sovereignty-content';

type Copy = Record<string, unknown> & {
  sovereignTitle: string; sovereignLead: string; tabs: Record<string, string>; lockTitle: string; lockLead: string;
  lockEnabled: string; lockDisabled: string; password: string; saveLock: string; reviewTitle: string; reviewLead: string;
  search: string; approve: string; requestChanges: string; reject: string; remove: string; reason: string; noReviews: string;
  supervisorsTitle: string; supervisorsLead: string; name: string; email: string; createSupervisor: string;
  managedTitle: string; managedLead: string; createManaged: string; path: string; partnersTitle: string; partnersLead: string;
  partnerSlug: string; partnerName: string; createPartner: string; approvePartner: string; noPartners: string;
  treasuryTitle: string; treasuryLead: string; auditTitle: string; auditLead: string; error: string; success: string;
  stepUpPin: string; stepUpLead: string;
};
type Overview = {
  lockEnabled: boolean; treasuryBalance: number;
  reviews: Array<{ id: string; ownerName: string; slug: string; tenantName: string }>;
  audits: Array<{ id: string; action: string; createdAt: number }>;
  partners: Array<{ id: string; slug: string; name: string; status: string }>;
};
const token = () => crypto.randomUUID();

export function SovereignDashboard({ locale, text }: { locale: SovereigntyLocale; text: Copy }) {
  const [data, setData] = useState<Overview | null>(null);
  const [message, setMessage] = useState('');
  const [lock, setLock] = useState(false);
  const [password, setPassword] = useState('');
  const [stepUpPin, setStepUpPin] = useState('');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [slug, setSlug] = useState('');
  const [partner, setPartner] = useState('');
  const [reviewQuery, setReviewQuery] = useState('');
  const [reviewNote, setReviewNote] = useState('');

  const load = async () => {
    try {
      const response = await fetch('/api/admin/sovereign/overview', { credentials: 'same-origin' });
      const payload = await response.json() as { ok?: boolean; overview?: Overview };
      if (!response.ok || !payload.ok || !payload.overview) throw new Error();
      setData(payload.overview);
      setLock(payload.overview.lockEnabled);
    } catch { setMessage(text.error); }
  };
  useEffect(() => { void load(); }, []);

  const post = async (path: string, body: Record<string, unknown>) => {
    const response = await fetch(path, {
      method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ ...body, locale, stepUpPin, idempotencyKey: `admin_${token()}` })
    });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; error?: string };
    if (!response.ok || !payload.ok) throw new Error(payload.error);
    setStepUpPin('');
    setMessage(text.success);
    await load();
  };

  const saveLock = async (event: FormEvent) => { event.preventDefault(); try { await post('/api/admin/sovereign/lock', { enabled: lock, password }); setPassword(''); } catch { setMessage(text.error); } };
  const createSupervisor = async (event: FormEvent) => { event.preventDefault(); try { await post('/api/admin/sovereign/supervisors', { name, email }); setName(''); setEmail(''); } catch { setMessage(text.error); } };
  const createManaged = async (event: FormEvent) => { event.preventDefault(); try { await post('/api/admin/sovereign/managed-users', { name, email, slug }); setName(''); setEmail(''); setSlug(''); } catch { setMessage(text.error); } };
  const createPartner = async (event: FormEvent) => { event.preventDefault(); try { await post('/api/admin/sovereign/partners', { name: partner, email, slug }); setPartner(''); setEmail(''); setSlug(''); } catch { setMessage(text.error); } };
  const removeReview = async (id: string) => {
    try {
      const response = await fetch(`/api/admin/publish-requests/${id}`, { method: 'DELETE', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ locale }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean };
      if (!response.ok || !payload.ok) throw new Error();
      setMessage(text.success);
      await load();
    } catch { setMessage(text.error); }
  };

  if (!data) return <main className="sovereignty-page" id="main-content"><p>{text.sovereignLead}</p></main>;
  const items = ['lock', 'review', 'supervisors', 'managed', 'partners', 'treasury', 'audit'].map((id) => ({ id: `sovereign-${id}`, label: text.tabs[id] }));
  const filteredReviews = data.reviews.filter((review) => `${review.ownerName} ${review.slug} ${review.tenantName}`.toLowerCase().includes(reviewQuery.toLowerCase()));

  return <main className="sovereignty-page" id="main-content" tabIndex={-1}>
    <header className="dashboard-hero"><p className="eyebrow">{locale === 'ar' ? 'شركة الهوية الرقمية' : 'Digital id Company'}</p><h1>{text.sovereignTitle}</h1><p>{text.sovereignLead}</p><p className="sr-status" role="status" aria-live="polite">{message}</p></header>
    <ScrollPills items={items}/>
    <section className="sovereignty-panel" aria-label={text.stepUpPin}><label>{text.stepUpPin}<input type="password" inputMode="numeric" autoComplete="current-password" maxLength={6} value={stepUpPin} onChange={(event) => setStepUpPin(event.target.value.replace(/\D/g, ''))}/></label><p className="field-hint">{text.stepUpLead}</p></section>
    <section className="sovereignty-panel" id="sovereign-lock" tabIndex={-1}><h2>{text.lockTitle}</h2><p>{text.lockLead}</p><form onSubmit={saveLock}><label className="check-label"><input type="checkbox" checked={lock} onChange={(event) => setLock(event.target.checked)}/>{lock ? text.lockEnabled : text.lockDisabled}</label><label>{text.password}<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} minLength={8}/></label><button className="gold-button">{text.saveLock}</button></form></section>
    <section className="sovereignty-panel" id="sovereign-review" tabIndex={-1}><h2>{text.reviewTitle}</h2><p>{text.reviewLead}</p><label>{text.search}<input value={reviewQuery} onChange={(event) => setReviewQuery(event.target.value)}/></label><label>{text.reason}<input value={reviewNote} onChange={(event) => setReviewNote(event.target.value)}/></label>{filteredReviews.length ? filteredReviews.map((review) => <article className="sovereignty-row" key={review.id}><strong>{review.ownerName}</strong><span>{review.tenantName} · {review.slug}</span><div><button onClick={() => void post(`/api/admin/publish-requests/${review.id}/decision`, { decision: 'approved', note: reviewNote })}>{text.approve}</button><button onClick={() => void post(`/api/admin/publish-requests/${review.id}/decision`, { decision: 'changes_requested', note: reviewNote })}>{text.requestChanges}</button><button onClick={() => void post(`/api/admin/publish-requests/${review.id}/decision`, { decision: 'rejected', note: reviewNote })}>{text.reject}</button><button onClick={() => void removeReview(review.id)}>{text.remove}</button></div></article>) : <p>{text.noReviews}</p>}</section>
    <section className="sovereignty-panel" id="sovereign-supervisors" tabIndex={-1}><h2>{text.supervisorsTitle}</h2><p>{text.supervisorsLead}</p><form onSubmit={createSupervisor}><label>{text.name}<input value={name} onChange={(event) => setName(event.target.value)} required/></label><label>{text.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><button className="outline-button">{text.createSupervisor}</button></form></section>
    <section className="sovereignty-panel" id="sovereign-managed" tabIndex={-1}><h2>{text.managedTitle}</h2><p>{text.managedLead}</p><form onSubmit={createManaged}><label>{text.name}<input value={name} onChange={(event) => setName(event.target.value)} required/></label><label>{text.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><label>{text.path}<input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} required/></label><button className="outline-button">{text.createManaged}</button></form></section>
    <section className="sovereignty-panel" id="sovereign-partners" tabIndex={-1}><h2>{text.partnersTitle}</h2><p>{text.partnersLead}</p><form onSubmit={createPartner}><label>{text.partnerName}<input value={partner} onChange={(event) => setPartner(event.target.value)} required/></label><label>{text.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} required/></label><label>{text.partnerSlug}<input value={slug} onChange={(event) => setSlug(event.target.value.toLowerCase())} required/></label><button className="gold-button">{text.createPartner}</button></form>{data.partners.length ? data.partners.map((partnerItem) => <article className="sovereignty-row" key={partnerItem.id}><strong>{partnerItem.name}</strong><span>{partnerItem.slug}.vipdid.app</span>{partnerItem.status === 'pending' ? <button onClick={() => void post(`/api/admin/sovereign/partners/${partnerItem.id}/approve`, {})}>{text.approvePartner}</button> : null}</article>) : <p>{text.noPartners}</p>}</section>
    <section className="sovereignty-panel" id="sovereign-treasury" tabIndex={-1}><h2>{text.treasuryTitle}</h2><p>{text.treasuryLead}</p><strong className="treasury-figure">{data.treasuryBalance.toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')}</strong></section>
    <section className="sovereignty-panel" id="sovereign-audit" tabIndex={-1}><h2>{text.auditTitle}</h2><p>{text.auditLead}</p>{data.audits.map((audit) => <div className="sovereignty-row" key={audit.id}><span>{locale === 'ar' ? 'حدث سيادي موثق' : 'Recorded sovereign event'}</span><time>{new Date(audit.createdAt).toLocaleString(locale === 'ar' ? 'ar-SA' : 'en-US')}</time></div>)}</section>
  </main>;
}
