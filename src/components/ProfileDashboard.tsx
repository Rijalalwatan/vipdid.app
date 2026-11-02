import { ChangeEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { convertToWebP } from '../lib/image-webp';
import { emptyProfile, imageStorageLimit, mediaMaximums, readableBytes, type AccountProfile, type MediaCategory, type ProfileData } from '../lib/profile';
import type { ProfileCopy, ProfileLocale } from '../i18n/profile-content';
import type { AuthUser } from './AuthPortal';
import { jumpToSection } from './SiteChrome';

type Props = { locale: ProfileLocale; text: ProfileCopy; user: AuthUser; onNavigate: (route: string) => void };
type Section = { id: string; label: string; field?: keyof ProfileData; hint?: string };

const pathRule = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/;
const profileSections = (text: ProfileCopy): Section[] => [
  { id: 'identity', label: text.dashboardTabIdentity }, { id: 'media', label: text.dashboardTabMedia },
  { id: 'bio', label: text.dashboardTabBio, field: 'bio', hint: text.textAreaHint },
  { id: 'experiences', label: text.dashboardTabExperiences, field: 'experiences', hint: text.textAreaHint },
  { id: 'education', label: text.dashboardTabEducation, field: 'education', hint: text.textAreaHint },
  { id: 'courses', label: text.dashboardTabCourses, field: 'courses', hint: text.textAreaHint },
  { id: 'skills', label: text.dashboardTabSkills, field: 'skills', hint: text.textAreaHint },
  { id: 'languages', label: text.dashboardTabLanguages, field: 'languages', hint: text.textAreaHint },
  { id: 'achievements', label: text.dashboardTabAchievements, field: 'achievements', hint: text.textAreaHint },
  { id: 'awards', label: text.dashboardTabAwards, field: 'awards', hint: text.textAreaHint },
  { id: 'portfolio', label: text.dashboardTabPortfolio, field: 'portfolio', hint: text.textAreaHint },
  { id: 'services', label: text.dashboardTabServices, field: 'services', hint: text.textAreaHint },
  { id: 'links', label: text.dashboardTabLinks, field: 'socialLinks', hint: text.linksHint },
  { id: 'contact', label: text.dashboardTabContact }
];

function messageFor(error: unknown, text: ProfileCopy) {
  const code = error instanceof Error ? error.message : '';
  if (code === 'slug_taken' || code === 'reserved_slug') return text.pathTaken;
  if (code === 'invalid_slug') return text.pathInvalid;
  if (code === 'image_limit' || code === 'storage_limit' || code === 'invalid_image' || code === 'image_too_large') return text.imageRejected;
  return text.saveFailed;
}

export function ProfileDashboard({ locale, text, user, onNavigate }: Props) {
  const [profile, setProfile] = useState<AccountProfile | null>(null);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [uploading, setUploading] = useState<MediaCategory | null>(null);
  const sections = useMemo(() => profileSections(text), [text]);

  const fetchProfile = useCallback(async () => {
    const response = await fetch('/api/account/profile', { credentials: 'same-origin' });
    const payload = await response.json().catch(() => ({})) as { ok?: boolean; profile?: AccountProfile; error?: string };
    if (!response.ok || !payload.ok || !payload.profile) throw new Error(payload.error ?? 'unknown');
    setProfile(payload.profile);
  }, []);

  useEffect(() => { void fetchProfile().catch(() => setError(text.saveFailed)); }, [fetchProfile, text.saveFailed]);

  const updateData = <K extends keyof ProfileData>(field: K, value: ProfileData[K]) => {
    setProfile((current) => current ? { ...current, data: { ...current.data, [field]: value } } : current);
    setDirty(true); setStatus(''); setError('');
  };
  const updateSlug = (value: string) => { setProfile((current) => current ? { ...current, slug: value.toLowerCase().replace(/\s+/g, '-') } : current); setDirty(true); setStatus(''); setError(''); };

  const save = useCallback(async () => {
    if (!profile) return false;
    const slug = profile.slug.trim().toLowerCase();
    if (!pathRule.test(slug)) { setError(slug ? text.pathInvalid : text.pathRequired); return false; }
    setSaving(true); setError('');
    try {
      const response = await fetch('/api/account/profile', { method: 'PUT', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ slug, data: profile.data }) });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; profile?: AccountProfile; error?: string };
      if (!response.ok || !payload.ok || !payload.profile) throw new Error(payload.error ?? 'unknown');
      setProfile(payload.profile); setDirty(false); setStatus(text.statusSaved);
      return true;
    } catch (cause) { setError(messageFor(cause, text)); return false; } finally { setSaving(false); }
  }, [profile, text]);

  useEffect(() => {
    if (!dirty || !profile || saving) return;
    const timer = window.setTimeout(() => { void save(); }, 3000);
    return () => window.clearTimeout(timer);
  }, [dirty, profile, saving, save]);

  const upload = async (category: MediaCategory, event: ChangeEvent<HTMLInputElement>) => {
    const source = event.target.files?.[0];
    event.target.value = '';
    if (!source || !profile) return;
    if (!(await save())) return;
    setUploading(category); setStatus(text.statusPreparing); setError('');
    try {
      const file = await convertToWebP(source, category);
      const form = new FormData(); form.append('category', category); form.append('file', file);
      const response = await fetch('/api/account/media', { method: 'POST', credentials: 'same-origin', body: form });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; profile?: AccountProfile; error?: string };
      if (!response.ok || !payload.ok || !payload.profile) throw new Error(payload.error ?? 'unknown');
      setProfile(payload.profile); setDirty(false); setStatus(text.imageReady);
    } catch (cause) { setError(messageFor(cause, text)); } finally { setUploading(null); }
  };

  const removeMedia = async (id: string) => {
    setError(''); setStatus('');
    try {
      const response = await fetch(`/api/account/media/${encodeURIComponent(id)}`, { method: 'DELETE', credentials: 'same-origin' });
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; profile?: AccountProfile; error?: string };
      if (!response.ok || !payload.ok || !payload.profile) throw new Error(payload.error ?? 'unknown');
      setProfile(payload.profile); setStatus(text.statusRemoved);
    } catch { setError(text.removeFailed); }
  };

  if (!profile) return <section className="dashboard-page" aria-live="polite"><p>{text.publicLoading}</p></section>;
  const assets = (category: MediaCategory) => profile.media.filter((asset) => asset.category === category);
  const titleFor = (category: MediaCategory) => ({ avatar: text.imageAvatar, cover: text.imageCover, skill: text.imageSkill, portfolio: text.imagePortfolio })[category];
  const renderMedia = (category: MediaCategory) => {
    const current = assets(category); const remaining = mediaMaximums[category] - current.length;
    return <section className="media-uploader" aria-labelledby={`media-${category}`}><div className="media-uploader-heading"><h3 id={`media-${category}`}>{titleFor(category)}</h3><span>{text.imageLimit}: {remaining}</span></div><div className="media-grid">{current.map((asset) => <figure key={asset.id}><img src={asset.url} alt={titleFor(category)} /><figcaption><span>{readableBytes(asset.sizeBytes, locale)}</span><button type="button" onClick={() => void removeMedia(asset.id)}>{text.removeImage}</button></figcaption></figure>)}</div>{remaining > 0 ? <label className="upload-button"><span>{current.length && (category === 'avatar' || category === 'cover') ? text.replaceImage : text.chooseImage}</span><input type="file" accept="image/*" onChange={(event) => void upload(category, event)} disabled={uploading !== null || saving} /></label> : null}</section>;
  };

  return <main className="dashboard-page" id="main-content" tabIndex={-1}><header className="dashboard-hero"><p className="eyebrow">{text.dashboardEyebrow}</p><h1>{text.dashboardTitle}</h1><p>{text.dashboardLead}</p><p className="autosave-note">{text.autoSave}</p><div className="dashboard-actions"><button className="gold-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? text.saving : text.saveDraft}</button>{profile.exists ? <a className="outline-button" href={`/${profile.slug}`}>{text.preview}</a> : null}</div><p className="sr-status" role="status" aria-live="polite">{status}</p>{error ? <p className="form-error" role="alert">{error}</p> : null}</header>
    <nav className="dashboard-tabs" aria-label={text.dashboardTitle}>{sections.map((section) => <button type="button" key={section.id} onClick={() => jumpToSection(`dashboard-${section.id}`)}>{section.label}</button>)}</nav>
    <section className="dashboard-section" id="dashboard-identity" tabIndex={-1} aria-labelledby="dashboard-identity-title"><h2 id="dashboard-identity-title">{text.dashboardTabIdentity}</h2><p>{text.identityLead}</p><div className="dashboard-fields"><label htmlFor="profile-name">{text.displayName}<input id="profile-name" value={profile.data.displayName} maxLength={120} onChange={(event) => updateData('displayName', event.target.value)} /></label><label htmlFor="profile-title">{text.professionalTitle}<input id="profile-title" value={profile.data.title} maxLength={180} onChange={(event) => updateData('title', event.target.value)} /></label><label htmlFor="profile-slug">{text.path}<div className="path-field"><span>vipdid.app/</span><input id="profile-slug" value={profile.slug} maxLength={32} autoCapitalize="none" autoComplete="off" aria-describedby="profile-slug-hint" onChange={(event) => updateSlug(event.target.value)} /></div></label><p id="profile-slug-hint" className="field-hint">{text.pathHint}</p></div></section>
    <section className="dashboard-section" id="dashboard-media" tabIndex={-1} aria-labelledby="dashboard-media-title"><h2 id="dashboard-media-title">{text.dashboardTabMedia}</h2><p>{text.mediaLead}</p><div className="storage-summary"><span>{text.storageUsage}: {readableBytes(profile.storageUsedBytes, locale)} / {readableBytes(imageStorageLimit, locale)}</span><span>{text.profileMedia}: {profile.imageCount} / 9</span></div><div className="media-uploaders">{renderMedia('avatar')}{renderMedia('cover')}{renderMedia('skill')}{renderMedia('portfolio')}</div></section>
    {sections.filter((section) => section.field).map((section) => <section className="dashboard-section" id={`dashboard-${section.id}`} tabIndex={-1} key={section.id} aria-labelledby={`dashboard-${section.id}-title`}><h2 id={`dashboard-${section.id}-title`}>{section.label}</h2><label htmlFor={`profile-${section.id}`}>{section.label}<textarea id={`profile-${section.id}`} rows={6} maxLength={4000} value={String(profile.data[section.field as keyof ProfileData] ?? '')} onChange={(event) => updateData(section.field as keyof ProfileData, event.target.value)} /></label><p className="field-hint">{section.hint}</p>{section.id === 'links' ? <><label htmlFor="profile-video">{text.videoUrl}<input id="profile-video" inputMode="url" value={profile.data.videoUrl} maxLength={500} onChange={(event) => updateData('videoUrl', event.target.value)} /></label><label htmlFor="profile-external">{text.externalLinks}<textarea id="profile-external" rows={5} maxLength={4000} value={profile.data.externalLinks} onChange={(event) => updateData('externalLinks', event.target.value)} /></label><p className="field-hint">{text.linksHint}</p></> : null}</section>)}
    <section className="dashboard-section" id="dashboard-contact" tabIndex={-1} aria-labelledby="dashboard-contact-title"><h2 id="dashboard-contact-title">{text.dashboardTabContact}</h2><p>{text.contactLead}</p><dl className="registered-contact"><div><dt>{text.registeredEmail}</dt><dd>{profile.contact.email}</dd></div><div><dt>{text.registeredPhone}</dt><dd>{profile.contact.phone || '—'}</dd></div><div><dt>{text.registeredWhatsapp}</dt><dd>{profile.contact.whatsapp || '—'}</dd></div></dl><fieldset><legend>{text.contactLead}</legend><label className="check-label"><input type="checkbox" checked={profile.data.showEmail} onChange={(event) => updateData('showEmail', event.target.checked)} />{text.showEmail}</label><label className="check-label"><input type="checkbox" checked={profile.data.showPhone} onChange={(event) => updateData('showPhone', event.target.checked)} />{text.showPhone}</label><label className="check-label"><input type="checkbox" checked={profile.data.showWhatsapp} onChange={(event) => updateData('showWhatsapp', event.target.checked)} />{text.showWhatsapp}</label></fieldset></section>
    <footer className="dashboard-footer"><button className="gold-button" type="button" disabled={saving} onClick={() => void save()}>{saving ? text.saving : text.saveDraft}</button><button className="text-button" type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button></footer>
  </main>;
}

export function defaultAccountProfile(user: AuthUser): AccountProfile { return { slug: '', data: emptyProfile(user.name), media: [], imageCount: 0, storageUsedBytes: 0, exists: false, contact: { email: '', phone: '', whatsapp: '' } }; }
