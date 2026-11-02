import { useEffect, useState } from 'react';
import { platformConfig } from '../config/platform.config';
import { LanguageToggle } from './LanguageToggle';

type Locale = 'ar' | 'en';
type JumpItem = { id: string; label: string };

type TopBarProps = {
  locale: Locale;
  languageLabel: string;
  themeLabel: string;
  accessLabel: string;
  onLanguageToggle: () => void;
  onThemeToggle: () => void;
  onAccess: () => void;
};

export function TopBar({ languageLabel, themeLabel, accessLabel, onLanguageToggle, onThemeToggle, onAccess }: TopBarProps) {
  return (
    <header className="site-topbar">
      <div className="topbar-side">
        <button className="theme-toggle" type="button" aria-label={themeLabel} onClick={onThemeToggle}>
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v1.06a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm8-5a1 1 0 0 1-1 1h-1.06a1 1 0 1 1 0-2H19a1 1 0 0 1 1 1ZM7.12 7.12a1 1 0 0 1-1.41 0L4.96 6.37a1 1 0 0 1 1.41-1.41l.75.75a1 1 0 0 1 0 1.41ZM19.04 6.37l-.75.75a1 1 0 1 1-1.41-1.41l.75-.75a1 1 0 0 1 1.41 1.41ZM12 17.94a1 1 0 0 1 1 1V20a1 1 0 1 1-2 0v-1.06a1 1 0 0 1 1-1Zm7.04.67a1 1 0 0 1 0 1.41 1 1 0 0 1-1.41 0l-.75-.75a1 1 0 0 1 1.41-1.41l.75.75ZM6.37 17.63a1 1 0 0 1 1.41 1.41l-.75.75a1 1 0 1 1-1.41-1.41l.75-.75ZM6.06 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1.06a1 1 0 0 1 1 1Z" /></svg>
        </button>
      </div>
      <div className="topbar-side topbar-actions">
        <button className="top-access" type="button" onClick={onAccess}>{accessLabel}</button>
        <LanguageToggle label={languageLabel} onToggle={onLanguageToggle} />
      </div>
    </header>
  );
}

type PlatformMastheadProps = {
  eyebrow: string;
  title: string;
  description: string;
  compact?: boolean;
};

export function PlatformMasthead({ eyebrow, title, description, compact = false }: PlatformMastheadProps) {
  return (
    <section className={`platform-masthead${compact ? ' masthead-compact' : ''}`} aria-labelledby="platform-masthead-title">
      <div className="masthead-circuit" aria-hidden="true">
        <span className="circuit-orbit circuit-orbit-one" />
        <span className="circuit-orbit circuit-orbit-two" />
        <span className="circuit-orbit circuit-orbit-three" />
        <span className="circuit-beam" />
        <svg className="circuit-network" viewBox="0 0 900 560" preserveAspectRatio="none">
          <path d="M18 438 L174 324 L302 401 L448 218 L606 307 L752 136 L886 216" />
          <path d="M44 164 L198 246 L350 122 L498 280 L655 184 L844 330" />
          <path d="M128 538 L286 366 L438 446 L586 388 L758 500" />
          <circle cx="174" cy="324" r="5" /><circle cx="302" cy="401" r="4" /><circle cx="448" cy="218" r="6" /><circle cx="606" cy="307" r="4" /><circle cx="752" cy="136" r="5" /><circle cx="198" cy="246" r="4" /><circle cx="350" cy="122" r="5" /><circle cx="498" cy="280" r="4" /><circle cx="655" cy="184" r="5" /><circle cx="438" cy="446" r="4" />
        </svg>
      </div>
      <div className="masthead-content">
        <div className="masthead-emblem" aria-hidden="true">
          <span className="emblem-halo emblem-halo-outer" />
          <span className="emblem-halo emblem-halo-inner" />
          <img src={platformConfig.assets.logo} alt="" />
        </div>
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="platform-masthead-title">{title}</h1>
        <p>{description}</p>
      </div>
    </section>
  );
}

type ProfileCoverProps = { eyebrow: string; title: string; description: string };

export function ProfileCover({ eyebrow, title, description }: ProfileCoverProps) {
  return (
    <section className="profile-cover" aria-labelledby="profile-cover-title">
      <div className="profile-cover-content">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="profile-cover-title">{title}</h1>
        <p>{description}</p>
      </div>
      <div className="profile-cover-emblem" aria-hidden="true">
        <span className="profile-emblem-ring" />
        <img src={platformConfig.assets.logo} alt="" />
      </div>
    </section>
  );
}

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  if (!target.hasAttribute('tabindex')) target.tabIndex = -1;
  target.focus({ preventScroll: true });
  target.classList.remove('target-pulse');
  window.requestAnimationFrame(() => target.classList.add('target-pulse'));
  window.setTimeout(() => target.classList.remove('target-pulse'), 950);
}

export function ScrollPills({ items }: { items: JumpItem[] }) {
  const [active, setActive] = useState(items[0]?.id ?? '');

  useEffect(() => {
    const nodes = items.map(({ id }) => document.getElementById(id)).filter((node): node is HTMLElement => Boolean(node));
    const observer = new IntersectionObserver((entries) => {
      const current = entries.filter((entry) => entry.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
      if (current?.target.id) setActive(current.target.id);
    }, { rootMargin: '-34% 0px -48% 0px', threshold: [0.05, 0.25, 0.55] });
    nodes.forEach((node) => observer.observe(node));
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav className="quick-pills" aria-label={items.map((item) => item.label).join(' ')}>
      {items.map((item) => <button className={active === item.id ? 'is-active' : ''} key={item.id} type="button" onClick={() => scrollToSection(item.id)}>{item.label}</button>)}
    </nav>
  );
}

export function jumpToSection(id: string) {
  scrollToSection(id);
}
