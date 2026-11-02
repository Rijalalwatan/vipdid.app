import { useState } from 'react';
import type { AccountProfile } from '../lib/profile';
import type { GovernanceCopy } from '../i18n/governance-content';

type Props = { locale: 'ar' | 'en'; text: GovernanceCopy; profile: AccountProfile };
export function DocumentTools({ locale, text, profile }: Props) {
  const [status, setStatus] = useState(''); const [busy, setBusy] = useState(false);
  const create = async (type: 'professional' | 'ats') => { setBusy(true); setStatus(text.creatingDocument); try { const payload = { locale, data: profile.data, media: profile.media, contact: profile.contact, slug: profile.slug || 'vipdid' }; const documents = await import('../lib/browser-documents'); if (type === 'professional') await documents.generateProfessionalPdf(payload); else await documents.generateAtsResume(payload); setStatus(text.documentReady); } catch { setStatus(text.documentFailed); } finally { setBusy(false); } };
  return <section className="dashboard-section document-tools" id="dashboard-documents" tabIndex={-1} aria-labelledby="documents-title"><h2 id="documents-title">{text.documentsTitle}</h2><p>{text.documentsLead}</p><div className="dashboard-actions"><button className="gold-button" type="button" disabled={busy || !profile.exists} onClick={() => void create('professional')}>{text.professionalPdf}</button><button className="outline-button" type="button" disabled={busy || !profile.exists} onClick={() => void create('ats')}>{text.atsPdf}</button></div><p className="sr-status" role="status" aria-live="polite">{status}</p></section>;
}
