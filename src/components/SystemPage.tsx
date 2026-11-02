import { platformConfig } from '../config/platform.config';
import type { Copy, Locale } from '../i18n/content';
import { PlatformMasthead } from './SiteChrome';

type Route = '/' | '/features' | '/privacy' | '/terms';
type Props = { locale: Locale; text: Copy; page: 'privacy' | 'terms'; onNavigate: (route: Route) => void };

export function SystemPage({ text, page, onNavigate }: Props) {
  const title = page === 'privacy' ? text.privacyTitle : text.termsTitle;
  const lead = page === 'privacy' ? text.privacyLead : text.termsLead;
  const body = page === 'privacy' ? text.privacyBody : text.termsBody;
  const sections = body.split('\n\n').map((section) => {
    const [heading, ...paragraphs] = section.split('\n');
    return { heading, paragraphs };
  });
  return (
    <div className="site-page system-page">
      <PlatformMasthead compact eyebrow={title} title={title} description={lead} />
      <article className="system-card"><p className="eyebrow">{title}</p><h2>{lead}</h2><div className="policy-sections">{sections.map((section) => <section className="policy-section" key={section.heading}><h3>{section.heading}</h3>{section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}</section>)}</div><section className="system-contact" aria-label={text.support}><p>{text.footerOwner}</p><a href={`https://wa.me/${platformConfig.contact.whatsapp}`}>{text.whatsappLabel}: {text.whatsappNumber}</a><a href={`mailto:${platformConfig.contact.supportEmail}`}>{text.emailLabel}: {platformConfig.contact.supportEmail}</a><a href={`mailto:${text.ownerEmail}`}>{text.ownerEmailLabel}: {text.ownerEmail}</a><div className="system-contact-actions"><a className="gold-button" href={`https://wa.me/${platformConfig.contact.whatsapp}`}>{text.inquiryAction}</a><a className="outline-button" href={`mailto:${platformConfig.contact.supportEmail}`}>{text.emailAction}</a></div></section><button className="gold-button" type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button></article>
      <footer className="site-footer"><p>{text.footerOwner}</p><div className="footer-actions"><button type="button" onClick={() => onNavigate('/features')}>{text.features}</button><a href={`https://wa.me/${platformConfig.contact.whatsapp}`}>{text.whatsappLabel}</a><a href={`mailto:${platformConfig.contact.supportEmail}`}>{text.emailLabel}</a><a href={`mailto:${text.ownerEmail}`}>{text.ownerEmailLabel}</a></div><p>{text.copyright}</p></footer>
    </div>
  );
}
