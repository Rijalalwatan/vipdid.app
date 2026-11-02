import { useEffect, useState } from 'react';
import { platformConfig } from '../config/platform.config';
import { LanguageToggle } from './LanguageToggle';
import { VipMatrix } from './VipMatrix';
import { VipTechGlyphs } from './VipTechGlyphs';

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
      <VipTechGlyphs />
      <VipMatrix className="masthead-matrix" />
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

type ProfileCoverProps = { eyebrow: string; title: string; description: string; coverSrc?: string; imageSrc?: string; imageAlt?: string };

export function ProfileCover({ eyebrow, title, description, coverSrc = '/brand/cover.webp', imageSrc = platformConfig.assets.logo, imageAlt = '' }: ProfileCoverProps) {
  return (
    <section className="profile-cover" aria-labelledby="profile-cover-title">
      <img className="profile-cover-image" src={coverSrc} alt="" />
      <div className="profile-cover-content">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="profile-cover-title">{title}</h1>
        <p>{description}</p>
      </div>
      <div className="profile-cover-emblem">
        <span className="profile-emblem-ring" aria-hidden="true" />
        <img src={imageSrc} alt={imageAlt} />
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
