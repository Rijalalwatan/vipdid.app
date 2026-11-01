import type { Copy, Locale } from '../i18n/content';
import { PlatformMasthead, ScrollPills } from './SiteChrome';

type Route = '/' | '/features' | '/privacy' | '/terms';
type Props = { locale: Locale; text: Copy; onNavigate: (route: Route) => void };

export function FeaturesPage({ text, onNavigate }: Props) {
  const items = [
    { id: 'visitor', label: text.visitor },
    { id: 'member', label: text.member },
    { id: 'marketer', label: text.marketer },
    { id: 'adheed', label: text.adheed },
    { id: 'oversight', label: text.oversight },
    { id: 'feature-article', label: text.articlePill }
  ];
  const cards = [
    { id: 'visitor', title: text.visitorTitle, body: text.visitorBody },
    { id: 'member', title: text.memberTitle, body: text.memberBody },
    { id: 'marketer', title: text.marketerTitle, body: text.marketerBody },
    { id: 'adheed', title: text.adheedTitle, body: text.adheedBody },
    { id: 'oversight', title: text.oversightTitle, body: text.oversightBody }
  ];
  return (
    <div className="site-page features-page">
      <PlatformMasthead compact eyebrow={text.featureEyebrow} title={text.featureTitle} description={text.featureDescription} />
      <ScrollPills items={items} />
      <section className="feature-cards" aria-label={text.features}>
        {cards.map((card, index) => <article className="feature-card" id={card.id} key={card.id}><span>{String(index + 1).padStart(2, '0')}</span><h2>{card.title}</h2><p>{card.body}</p></article>)}
      </section>
      <section className="feature-article" id="feature-article"><p className="eyebrow">{text.featureEyebrow}</p><h2>{text.articleTitle}</h2><p>{text.articleBody}</p><button className="gold-button" type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button></section>
      <footer className="site-footer"><p>{text.footerOwner}</p><button type="button" onClick={() => onNavigate('/')}>{text.returnHome}</button><p>{text.copyright}</p></footer>
    </div>
  );
}
