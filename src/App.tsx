import { useEffect, useMemo, useState } from 'react';
import { platformConfig, type PlatformLocale } from './config/platform.config';
import { HomePage } from './components/HomePage';
import { FeaturesPage } from './components/FeaturesPage';
import { SystemPage } from './components/SystemPage';
import { BrandAura } from './components/BrandAura';
import { TopBar } from './components/SiteChrome';
import { AccessibilityTools } from './components/AccessibilityTools';
import { ProfileDashboard } from './components/ProfileDashboard';
import { PublicProfilePage } from './components/PublicProfilePage';
import { SovereignDashboard } from './components/SovereignDashboard';
import { PartnerDashboard } from './components/PartnerDashboard';
import { PartnerHomePage } from './components/PartnerHomePage';
import { CustodyAcceptancePage } from './components/CustodyAcceptancePage';
import type { AuthUser } from './components/AuthPortal';
import { authContent } from './i18n/auth-content';
import { profileContent } from './i18n/profile-content';
import { governanceContent } from './i18n/governance-content';
import { sovereigntyContent } from './i18n/sovereignty-content';
import { content, type Locale } from './i18n/content';

type Theme = 'dark' | 'light';
type Route = '/' | '/features' | '/privacy' | '/terms' | '/dashboard' | '/sovereign' | '/partner' | '/accept-custody' | { profile: string };
type TenantContext = { slug: string; name: string; nameEn?: string; logoUrl?: string; coverUrl?: string; type: 'main' | 'partner' };
const reservedRoutes = new Set(['features', 'privacy', 'terms', 'dashboard', 'sovereign', 'partner', 'accept-custody', 'api', 'assets', 'brand', 'favicon.ico', 'manus-routes.json', 'sw.js']);
function initialLocale(): Locale { const parameter = new URLSearchParams(window.location.search).get('lang'); if (parameter === 'en') return 'en'; return window.localStorage.getItem('vipdid_locale') === 'en' ? 'en' : 'ar'; }
function initialTheme(): Theme { return window.localStorage.getItem('vipdid_theme') === 'light' ? 'light' : 'dark'; }
function routeFromPathname(pathname: string): Route { if (pathname === '/features' || pathname === '/privacy' || pathname === '/terms' || pathname === '/dashboard' || pathname === '/sovereign' || pathname === '/partner' || pathname === '/accept-custody') return pathname; const slug = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, '')).toLowerCase(); return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug) && !reservedRoutes.has(slug) ? { profile: slug } : '/'; }

export function App() {
  const [locale, setLocale] = useState<Locale>(initialLocale);
  const [theme, setTheme] = useState<Theme>(initialTheme);
  const [route, setRoute] = useState<Route>(() => routeFromPathname(window.location.pathname));
  const [user, setUser] = useState<AuthUser | null>(null);
  const [tenant, setTenant] = useState<TenantContext | null>(null);
  const text = content[locale]; const authText = authContent[locale]; const profileText = profileContent[locale]; const governanceText = governanceContent[locale]; const sovereigntyText = sovereigntyContent[locale];
  useEffect(() => { const html = document.documentElement; html.lang = locale; html.dir = locale === 'ar' ? 'rtl' : 'ltr'; document.title = text.documentTitle; document.getElementById('app-manifest')?.setAttribute('href', locale === 'ar' ? '/manifest-ar.webmanifest' : '/manifest-en.webmanifest'); window.localStorage.setItem('vipdid_locale', locale); }, [locale, text.documentTitle]);
  useEffect(() => { document.documentElement.dataset.theme = theme; window.localStorage.setItem('vipdid_theme', theme); }, [theme]);
  useEffect(() => { fetch('/api/auth/me', { credentials: 'same-origin' }).then((response) => response.json() as Promise<{ authenticated?: boolean; user?: AuthUser | null }>).then((data) => setUser(data.authenticated && data.user ? data.user : null)).catch(() => setUser(null)); }, []);
  useEffect(() => { fetch('/api/platform/context', { credentials: 'same-origin' }).then((response) => response.json() as Promise<{ ok?: boolean; tenant?: TenantContext }>).then((data) => setTenant(data.ok && data.tenant ? data.tenant : null)).catch(() => setTenant(null)); }, []);
  useEffect(() => { if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => undefined); const onPopState = () => setRoute(routeFromPathname(window.location.pathname)); window.addEventListener('popstate', onPopState); return () => window.removeEventListener('popstate', onPopState); }, []);
  const language = useMemo(() => ({ locale, text, platform: platformConfig.names[locale as PlatformLocale] }), [locale, text]);
  const navigate = (nextRoute: string) => { if (window.location.pathname !== nextRoute) window.history.pushState({}, '', nextRoute); setRoute(routeFromPathname(nextRoute)); window.scrollTo({ top: 0, behavior: 'smooth' }); };
  const authenticated = (nextUser: AuthUser) => { setUser(nextUser); navigate('/dashboard'); };
  const openAccess = () => { if (user) { navigate('/dashboard'); return; } if (route !== '/') { navigate('/'); window.setTimeout(() => document.getElementById('access')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 0); return; } const target = document.getElementById('access'); target?.scrollIntoView({ behavior: 'smooth', block: 'center' }); target?.focus({ preventScroll: true }); };
  const home = tenant?.type === 'partner' ? <PartnerHomePage locale={locale} authText={authText} tenant={tenant} user={user} onAuthenticated={authenticated} onSignedOut={() => setUser(null)} onNavigate={navigate} /> : <HomePage locale={locale} text={language.text} authText={authText} user={user} onAuthenticated={authenticated} onSignedOut={() => setUser(null)} onNavigate={navigate} />;
  const dashboard = !user ? home : user.role === 'super_admin' || user.role === 'moderator' ? <SovereignDashboard locale={locale} text={sovereigntyText} /> : user.role === 'adheed' ? <PartnerDashboard locale={locale} text={sovereigntyText} /> : <ProfileDashboard locale={locale} text={profileText} governance={governanceText} sovereignty={sovereigntyText} user={user} onNavigate={navigate} onUserUpdated={setUser} />;
  const page = route === '/' ? home : route === '/dashboard' ? dashboard : route === '/sovereign' ? (user ? <SovereignDashboard locale={locale} text={sovereigntyText} /> : home) : route === '/partner' ? (user ? <PartnerDashboard locale={locale} text={sovereigntyText} /> : home) : route === '/accept-custody' ? <CustodyAcceptancePage locale={locale} text={sovereigntyText} onAccepted={authenticated} /> : route === '/features' ? <FeaturesPage locale={locale} text={language.text} onNavigate={navigate} /> : route === '/privacy' || route === '/terms' ? <SystemPage locale={locale} text={language.text} page={route === '/privacy' ? 'privacy' : 'terms'} onNavigate={navigate} /> : <PublicProfilePage locale={locale} text={profileText} slug={route.profile} onNavigate={navigate} />;
  return <div className={`app-shell locale-${locale} theme-${theme}`}><a className="skip-link" href="#main-content">{authText.skipToContent}</a><BrandAura /><TopBar locale={locale} languageLabel={language.text.languageAction} themeLabel={theme === 'dark' ? language.text.themeToLight : language.text.themeToDark} accessLabel={user ? profileText.dashboardTitle : language.text.topAccess} onLanguageToggle={() => setLocale((current) => current === 'ar' ? 'en' : 'ar')} onThemeToggle={() => setTheme((current) => current === 'dark' ? 'light' : 'dark')} onAccess={openAccess} /><AccessibilityTools locale={locale} text={authText} instructions={authText.instructions} />{page}</div>;
}
