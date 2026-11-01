import { useEffect, useMemo, useState } from 'react';
import { platformConfig, type PlatformLocale } from './config/platform.config';
import { HomePage } from './components/HomePage';
import { FeaturesPage } from './components/FeaturesPage';
import { SystemPage } from './components/SystemPage';
import { BrandAura } from './components/BrandAura';
import { TopBar } from './components/SiteChrome';
import { content, type Locale } from './i18n/content';

type Theme = 'dark' | 'light';
type Route = '/' | '/features' | '/privacy' | '/terms';

function initialLocale(): Locale {
  const parameter = new URLSearchParams(window.location.search).get('lang');
  if (parameter === 'en') return 'en';
  return window.localStorage.getItem('vipdid_locale') === 'en' ? 'en' : 'ar';
}

function initialTheme(): Theme {
  return window.localStorage.getItem('vipdid_theme') === 'light' ? 'light' : 'dark';
}

function routeFromPathname(pathname: string): Route {
  return pathname === '/features' || pathname === '/privacy' || pathname === '/terms' ? pathname : '/';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [route, setRoute] = useState<Route>(() => routeFromPathname(window.location.pathname));
  const [isLocked, setIsLocked] = useState<boolean | null>(null);
  const text = content[locale];

  useEffect(() => {
    const html = document.documentElement;
    html.lang = locale;
    html.dir = locale === 'ar' ? 'rtl' : 'ltr';
    document.title = text.documentTitle;
    document.getElementById('app-manifest')?.setAttribute('href', locale === 'ar' ? '/manifest-ar.webmanifest' : '/manifest-en.webmanifest');
    window.localStorage.setItem('vipdid_locale', locale);
  }, [locale, text.documentTitle]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    window.localStorage.setItem('vipdid_theme', theme);
  }, [theme]);

  useEffect(() => {
    fetch('/api/lock/status', { credentials: 'same-origin' })
      .then((response) => response.json() as Promise<{ locked: boolean }>)
      .then((data) => setIsLocked(data.locked))
      .catch(() => setIsLocked(true));
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    const onPopState = () => setRoute(routeFromPathname(window.location.pathname));
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const language = useMemo(() => ({ locale, text, platform: platformConfig.names[locale as PlatformLocale] }), [locale, text]);
  const navigate = (nextRoute: Route) => {
    if (window.location.pathname !== nextRoute) window.history.pushState({}, '', nextRoute);
    setRoute(nextRoute);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  return (
    <main className={`app-shell locale-${locale} theme-${theme}`}>
      <BrandAura />
      <TopBar
        locale={locale}
        languageLabel={language.text.languageAction}
        themeLabel={theme === 'dark' ? language.text.themeToLight : language.text.themeToDark}
        onLanguageToggle={() => setLocale((current) => current === 'ar' ? 'en' : 'ar')}
        onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')}
      />
      {route === '/' ? (
        <HomePage locale={locale} text={language.text} isLocked={isLocked !== false} onUnlocked={() => setIsLocked(false)} onNavigate={navigate} />
      ) : route === '/features' ? (
        <FeaturesPage locale={locale} text={language.text} onNavigate={navigate} />
      ) : (
        <SystemPage locale={locale} text={language.text} page={route === '/privacy' ? 'privacy' : 'terms'} onNavigate={navigate} />
      )}
    </main>
  );
}
