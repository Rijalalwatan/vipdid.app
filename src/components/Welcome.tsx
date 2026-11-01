import { platformConfig } from '../config/platform.config';
import type { Copy, Locale } from '../i18n/content';

type Props = {
  locale: Locale;
  text: Copy;
  platformName: string;
};

export function Welcome({ locale, text, platformName }: Props) {
  return (
    <section className="welcome" aria-labelledby="welcome-title">
      <div className="welcome-content">
        <img className="welcome-logo" src={platformConfig.assets.logo} alt="" />
        <p className="eyebrow">{text.heroEyebrow}</p>
        <h1 id="welcome-title">{text.heroTitle}</h1>
        <p className="welcome-description">{text.heroDescription}</p>
        <button className="explore-button" type="button">{text.features}</button>
      </div>
      <div className="welcome-values"><span>{text.privacy}</span><span>{text.featuredOnly}</span><span>{text.features}</span></div>
      <footer className="site-footer"><span>{text.owner} {platformConfig.ownership[locale]}</span><span>{text.copyright} · {platformName}</span></footer>
    </section>
  );
}
