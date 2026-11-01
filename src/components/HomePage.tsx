import { FormEvent, useState } from 'react';
import { platformConfig } from '../config/platform.config';
import type { Copy, Locale } from '../i18n/content';
import { LockGateway } from './LockGateway';
import { EmblemCover, ScrollPills, jumpToSection } from './SiteChrome';

type Route = '/' | '/features' | '/privacy' | '/terms';
type SearchResult = { slug: string; name: string; title: string; summary: string; featured: boolean };
type Props = { locale: Locale; text: Copy; isLocked: boolean; onUnlocked: () => void; onNavigate: (route: Route) => void };

export function HomePage({ locale, text, isLocked, onUnlocked, onNavigate }: Props) {
  const [query, setQuery] = useState('');
  const [featured, setFeatured] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [results, setResults] = useState<SearchResult[] | null>(null);
  const [searchError, setSearchError] = useState(false);
  const [intent, setIntent] = useState<'member' | 'management'>('member');
  const [searching, setSearching] = useState(false);

  const performSearch = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setSearching(true);
    setSearchError(false);
    try {
      const params = new URLSearchParams({ q: query, featured: featured ? '1' : '0' });
      const response = await fetch(`/api/public/search?${params.toString()}`, { credentials: 'same-origin' });
      if (!response.ok) throw new Error('search');
      const data = await response.json() as { results: SearchResult[] };
      setResults(data.results);
    } catch {
      setSearchError(true);
      setResults(null);
    } finally {
      setSearching(false);
    }
  };

  const requestAccess = (nextIntent: 'member' | 'management') => {
    setIntent(nextIntent);
    jumpToSection('access');
  };

  const jumpItems = [
    { id: 'discover', label: text.navSearch },
    { id: 'access', label: text.navAccess },
    { id: 'management', label: text.navManagement },
    { id: 'platform-features', label: text.navFeatures }
  ];

  return (
    <div className="site-page home-page">
      <EmblemCover eyebrow={text.heroEyebrow} title={text.heroTitle} description={text.heroDescription} />
      <ScrollPills items={jumpItems} />

      <section className="section-panel discovery-section" id="discover" aria-labelledby="search-title">
        <div className="section-heading"><p className="eyebrow">{text.navSearch}</p><h2 id="search-title">{text.searchTitle}</h2><p>{text.searchDescription}</p></div>
        <form className="search-form" onSubmit={performSearch}>
          <input value={query} onChange={(event) => setQuery(event.target.value)} maxLength={80} placeholder={text.searchPlaceholder} aria-label={text.searchPlaceholder} />
          <button className="gold-button" type="submit" disabled={searching}>{text.searchAction}</button>
        </form>
        <div className="advanced-wrap">
          <button className="pill-button" type="button" onClick={() => setAdvanced((value) => !value)}>{advanced ? text.hideAdvancedAction : text.advancedAction}</button>
          {advanced ? <div className="filter-pills" aria-label={text.advancedAction}>
            <button type="button" className={!featured ? 'is-active' : ''} onClick={() => setFeatured(false)}>{text.allPublished}</button>
            <button type="button" className={featured ? 'is-active' : ''} onClick={() => setFeatured(true)}>{text.featuredOnly}</button>
            <span>{text.latestFirst}</span>
          </div> : null}
        </div>
        {searchError ? <p className="search-message" role="alert">{text.searchUnavailable}</p> : null}
        {results ? <div className="search-results" aria-live="polite"><h3>{text.resultsTitle}</h3>{results.length ? results.map((result) => <article className="result-card" key={result.slug}><span>{result.featured ? text.featuredOnly : text.allPublished}</span><h4>{result.name}</h4>{result.title ? <p className="result-title">{result.title}</p> : null}{result.summary ? <p>{result.summary}</p> : null}</article>) : <p className="search-message">{text.noSearchResults}</p>}</div> : null}
      </section>

      <section className="action-grid" aria-label={text.navAccess}>
        <button className="gold-button primary-action" type="button" onClick={() => isLocked ? requestAccess('member') : jumpToSection('my-space')}>{isLocked ? text.createSite : text.mySpace}</button>
        <button className="outline-button" type="button" onClick={() => requestAccess('management')}>{text.management}</button>
        <button className="outline-button" type="button" onClick={() => onNavigate('/features')}>{text.features}</button>
      </section>

      <section className="section-panel access-section" id="access" aria-labelledby="access-title">
        <div className="section-heading"><p className="eyebrow">{intent === 'management' ? text.navManagement : text.navAccess}</p><h2 id="access-title">{intent === 'management' ? text.managementAccessTitle : text.memberAccessTitle}</h2><p>{text.accessDescription}</p></div>
        {isLocked ? <LockGateway locale={locale} text={text} onUnlocked={onUnlocked} /> : <div className="private-space" id="my-space"><h3>{text.privateSpaceTitle}</h3><p>{text.privateSpaceDescription}</p></div>}
      </section>

      <section className="section-panel management-section" id="management" aria-labelledby="management-title">
        <div className="section-heading"><p className="eyebrow">{text.navManagement}</p><h2 id="management-title">{text.managementAccessTitle}</h2><p>{text.accessDescription}</p></div>
        <button className="pill-button" type="button" onClick={() => requestAccess('management')}>{text.management}</button>
      </section>

      <section className="section-panel feature-invitation" id="platform-features" aria-labelledby="features-title">
        <div className="section-heading"><p className="eyebrow">{text.featureEyebrow}</p><h2 id="features-title">{text.featureTitle}</h2><p>{text.featureDescription}</p></div>
        <button className="gold-button" type="button" onClick={() => onNavigate('/features')}>{text.features}</button>
      </section>

      <footer className="site-footer">
        <p>{text.footerOwner}</p>
        <div className="footer-actions">
          <button type="button" onClick={() => onNavigate('/privacy')}>{text.privacy}</button>
          <button type="button" onClick={() => onNavigate('/terms')}>{text.terms}</button>
          <a href={`https://wa.me/${platformConfig.contact.whatsapp}`}>{text.whatsappLabel}: {text.whatsappNumber}</a>
          <a href={`mailto:${platformConfig.contact.supportEmail}`}>{text.emailLabel}</a>
        </div>
        <p>{text.copyright}</p>
      </footer>
    </div>
  );
}
