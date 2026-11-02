import { useEffect, useMemo, useState } from 'react';
import { createGreenQr, downloadDataUrl, makeVcard, shareDataUrl } from '../lib/qr';
import { publicUrl, type ProfileData, type ProfileMedia, type PublicSection } from '../lib/profile';
import type { ProfileCopy, ProfileLocale } from '../i18n/profile-content';
import { ProfileCover, ScrollPills } from './SiteChrome';

type PublicProfile = { slug: string; data: ProfileData; media: ProfileMedia[]; contact: { email: string; phone: string; whatsapp: string } };
type Props = { locale: ProfileLocale; text: ProfileCopy; slug: string; onNavigate: (route: string) => void };

function entries(value: string) { return value.split('\n').map((line) => line.trim()).filter(Boolean); }
function validUrl(value: string) { try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null; } catch { return null; } }
function namedLinks(value: string) { return entries(value).map((line) => { const [label, ...rest] = line.split('|'); const url = validUrl(rest.join('|').trim()); return label.trim() && url ? { label: label.trim().slice(0, 100), url } : null; }).filter((value): value is { label: string; url: string } => Boolean(value)); }
export function PublicProfilePage({ locale, text, slug, onNavigate }: Props) {
  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'missing'>('loading');
  const [siteCode, setSiteCode] = useState('');
  const [contactCode, setContactCode] = useState('');

  useEffect(() => {
    setState('loading'); setProfile(null);
    fetch(`/api/public/profile/${encodeURIComponent(slug)}`).then(async (response) => {
      const payload = await response.json().catch(() => ({})) as { ok?: boolean; profile?: PublicProfile };
      if (!response.ok || !payload.ok || !payload.profile) throw new Error('missing');
      setProfile(payload.profile); setState('ready');
    }).catch(() => setState('missing'));
  }, [slug]);

  const vcard = useMemo(() => profile ? makeVcard(profile.data, profile.contact, publicUrl(profile.slug)) : '', [profile]);

  useEffect(() => {
    if (!profile) return;
    const create = async () => {
      const [site, contact] = await Promise.all([
        createGreenQr(publicUrl(profile.slug), undefined, 360),
        createGreenQr(vcard || publicUrl(profile.slug), undefined, 360)
      ]);
      setSiteCode(site); setContactCode(contact);
    };
    void create().catch(() => { setSiteCode(''); setContactCode(''); });
  }, [profile, vcard]);

  const downloadVcard = () => {
    if (!vcard || !profile) return;
    const href = URL.createObjectURL(new Blob([vcard], { type: 'text/vcard;charset=utf-8' }));
    const link = document.createElement('a'); link.href = href; link.download = `${profile.slug}.vcf`; link.click(); URL.revokeObjectURL(href);
  };

  if (state === 'loading') return <main className="public-profile-state" id="main-content" aria-live="polite"><p>{text.publicLoading}</p></main>;
  if (!profile) return <main className="public-profile-state" id="main-content"><h1>{text.publicNotFoundTitle}</h1><p>{text.publicNotFoundLead}</p><button className="gold-button" type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button></main>;

  const media = (category: ProfileMedia['category']) => profile.media.filter((asset) => asset.category === category);
  const avatar = media('avatar')[0]?.url;
  const cover = media('cover')[0]?.url ?? '/brand/cover.webp';
  const social = namedLinks(profile.data.socialLinks); const external = namedLinks(profile.data.externalLinks); const video = validUrl(profile.data.videoUrl);
  const tabs = [{ id: 'bio', label: text.tabBio }, { id: 'experiences', label: text.tabExperiences }, { id: 'skills', label: text.tabSkills }, { id: 'portfolio', label: text.tabPortfolio }, { id: 'contact', label: text.tabContact }, { id: 'codes', label: text.tabCodes }];
  const SectionText = ({ section, value }: { section: PublicSection; value: string }) => <section className="public-section" id={section} tabIndex={-1} aria-labelledby={`${section}-title`}><h2 id={`${section}-title`}>{tabs.find((tab) => tab.id === section)?.label}</h2>{entries(value).length ? <div className="line-list">{entries(value).map((item, index) => <p key={`${section}-${index}`}>{item}</p>)}</div> : <p className="empty-section">{text.emptySection}</p>}</section>;

  return <main className="public-profile-page" id="main-content" tabIndex={-1}><ProfileCover eyebrow={text.publicEyebrow} title={profile.data.displayName || profile.slug} description={profile.data.title} coverSrc={cover} imageSrc={avatar} imageAlt={text.imageAlt} /><ScrollPills items={tabs} />
    <SectionText section="bio" value={profile.data.bio} />
    <SectionText section="experiences" value={profile.data.experiences} />
    <section className="public-section" id="skills" tabIndex={-1} aria-labelledby="skills-title"><h2 id="skills-title">{text.tabSkills}</h2>{entries(profile.data.skills).length ? <div className="skill-cloud">{entries(profile.data.skills).map((skill) => <span key={skill}>{skill}</span>)}</div> : <p className="empty-section">{text.emptySection}</p>}{media('skill').length ? <div className="public-media-grid">{media('skill').map((asset) => <img key={asset.id} src={asset.url} alt={text.imageAlt} />)}</div> : null}</section>
    <section className="public-section" id="portfolio" tabIndex={-1} aria-labelledby="portfolio-title"><h2 id="portfolio-title">{text.tabPortfolio}</h2>{entries(profile.data.portfolio).length ? <div className="line-list">{entries(profile.data.portfolio).map((item, index) => <p key={`portfolio-${index}`}>{item}</p>)}</div> : <p className="empty-section">{text.emptySection}</p>}{media('portfolio').length ? <div className="public-media-grid portfolio-grid">{media('portfolio').map((asset) => <img key={asset.id} src={asset.url} alt={text.imageAlt} />)}</div> : null}{profile.data.services ? <div className="subsection"><h3>{text.services}</h3>{entries(profile.data.services).map((item) => <p key={item}>{item}</p>)}</div> : null}</section>
    <section className="public-section" id="contact" tabIndex={-1} aria-labelledby="contact-title"><h2 id="contact-title">{text.contact}</h2>{profile.data.showWhatsapp && profile.contact.whatsapp ? <a className="gold-button" href={`https://wa.me/${profile.contact.whatsapp.replace(/[^0-9]/g, '')}`}>{text.whatsapp}</a> : null}{profile.data.showPhone && profile.contact.phone ? <a className="outline-button" href={`tel:${profile.contact.phone}`}>{text.phone}</a> : null}{profile.data.showEmail && profile.contact.email ? <a className="outline-button" href={`mailto:${profile.contact.email}`}>{text.email}</a> : null}{!profile.data.showWhatsapp && !profile.data.showPhone && !profile.data.showEmail ? <p className="empty-section">{text.noContact}</p> : null}{vcard ? <button className="text-button" type="button" onClick={downloadVcard}>{text.saveContact}</button> : null}{social.length ? <div className="link-cluster"><h3>{text.siteLinks}</h3>{social.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div> : null}{video ? <p><a className="outline-button" href={video} target="_blank" rel="noreferrer">{text.openVideo}</a></p> : null}{external.length ? <div className="link-cluster"><h3>{text.externalLinksTitle}</h3>{external.map((link) => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label}</a>)}</div> : null}</section>
    <section className="public-section codes-section" id="codes" tabIndex={-1} aria-labelledby="codes-title"><h2 id="codes-title">{text.tabCodes}</h2><p>{text.codesLead}</p><div className="qr-grid"><figure><img src={siteCode} alt={text.siteCode} /><figcaption>{text.siteCode}</figcaption>{siteCode ? <div className="dashboard-actions"><button className="outline-button" type="button" onClick={() => downloadDataUrl(siteCode, `${profile.slug}-site-qr.png`)}>{text.downloadCode}</button><button className="outline-button" type="button" onClick={() => void shareDataUrl(siteCode, `${profile.slug}-site-qr.png`, text.siteCode)}>{text.shareCode}</button></div> : null}</figure><figure><img src={contactCode} alt={text.contactCode} /><figcaption>{text.contactCode}</figcaption>{contactCode ? <div className="dashboard-actions"><button className="outline-button" type="button" onClick={() => downloadDataUrl(contactCode, `${profile.slug}-contact-qr.png`)}>{text.downloadCode}</button><button className="outline-button" type="button" onClick={() => void shareDataUrl(contactCode, `${profile.slug}-contact-qr.png`, text.contactCode)}>{text.shareCode}</button></div> : null}</figure></div></section>
    <footer className="profile-footer"><p>{text.footerOwnership}</p><div><button type="button" onClick={() => onNavigate('/privacy')}>{text.privacy}</button><button type="button" onClick={() => onNavigate('/terms')}>{text.terms}</button><button type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button></div></footer>
  </main>;
}
