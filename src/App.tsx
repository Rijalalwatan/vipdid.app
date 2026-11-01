import { useEffect, useMemo, useState } from 'react';
import { platformConfig, type PlatformLocale } from './config/platform.config';
import { content, type Locale } from './i18n/content';
import { BrandAura } from './components/BrandAura';
import { LanguageToggle } from './components/LanguageToggle';
import { LockGateway } from './components/LockGateway';
import { Welcome } from './components/Welcome';

function initialLocale(): Locale {
  const parameter = new URLSearchParams(window.location.search).get('lang');
  if (parameter === 'en') return 'en';
  return window.localStorage.getItem('vipdid_locale') === 'en' ? 'en' : 'ar';
}

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
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
    fetch('/api/lock/status', { credentials: 'same-origin' })
      .then((response) => response.json() as Promise<{ locked: boolean }>)
      .then((data: { locked: boolean }) => setIsLocked(data.locked))
      .catch(() => setIsLocked(true));
  }, []);

  useEffect(() => {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined);
  }, []);

  const language = useMemo(() => ({ locale, text, platform: platformConfig.names[locale as PlatformLocale] }), [locale, text]);
  const switchLocale = () => setLocale((current) => current === 'ar' ? 'en' : 'ar');

  return (
    <main className={`app-shell ${locale === 'ar' ? 'locale-ar' : 'locale-en'}`}>
      <BrandAura />
      <LanguageToggle label={language.text.languageAction} onToggle={switchLocale} />
      {isLocked === null ? <div className="initial-veil" aria-hidden="true" /> : isLocked ? (
        <LockGateway locale={locale} text={language.text} onUnlocked={() => setIsLocked(false)} />
      ) : (
        <Welcome locale={locale} text={language.text} platformName={language.platform} />
      )}
    </main>
  );
}
