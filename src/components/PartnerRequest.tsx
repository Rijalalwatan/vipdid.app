import { FormEvent, useState } from 'react';
import type { SovereigntyLocale } from '../i18n/sovereignty-content';

type Copy = { requestPartner: string; requestPartnerLead: string; partnerSlug: string; partnerName: string; submitRequest: string; requested: string; error: string };
export function PartnerRequest({ locale, text }: { locale: SovereigntyLocale; text: Copy }) {
  const [slug, setSlug] = useState(''); const [name, setName] = useState(''); const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => { event.preventDefault(); setStatus(''); setBusy(true); try { const response = await fetch('/api/account/partners/request', { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'same-origin', body: JSON.stringify({ slug, name, locale }) }); if (!response.ok) throw new Error(); setStatus(text.requested); } catch { setStatus(text.error); } finally { setBusy(false); } };
  return <section className="sovereignty-panel partner-request" id="partner-request" tabIndex={-1} aria-labelledby="partner-request-title"><h2 id="partner-request-title">{text.requestPartner}</h2><p>{text.requestPartnerLead}</p><form onSubmit={submit}><label>{text.partnerName}<input value={name} maxLength={120} onChange={(event) => setName(event.target.value)} required /></label><label>{text.partnerSlug}<div className="path-field"><span>{locale === 'ar' ? 'vipdid.app.' : ''}</span><input dir="ltr" value={slug} maxLength={32} onChange={(event) => setSlug(event.target.value.toLowerCase())} required /></div></label><button className="outline-button" type="submit" disabled={busy}>{text.submitRequest}</button><p className="sr-status" role="status" aria-live="polite">{status}</p></form></section>;
}
