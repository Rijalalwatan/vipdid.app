import type { Copy, Locale } from '../i18n/content';
import { PlatformMasthead } from './SiteChrome';

type Route = '/' | '/features' | '/privacy' | '/terms';
type Props = { locale: Locale; text: Copy; page: 'privacy' | 'terms'; onNavigate: (route: Route) => void };

export function SystemPage({ text, page, onNavigate }: Props) {
  const title = page === 'privacy' ? text.privacyTitle : text.termsTitle;
  const lead = page === 'privacy' ? text.privacyLead : text.termsLead;
  const body = page === 'privacy' ? text.privacyBody : text.termsBody;
  return (
    <div className="site-page system-page">
      <PlatformMasthead compact eyebrow={title} title={title} description={lead} />
      <article className="system-card"><p className="eyebrow">{title}</p><h2>{lead}</h2><p>{body}</p><button className="gold-button" type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button></article>
      <footer className="site-footer"><p>{text.footerOwner}</p><button type="button" onClick={() => onNavigate('/features')}>{text.features}</button><p>{text.copyright}</p></footer>
    </div>
  );
}
