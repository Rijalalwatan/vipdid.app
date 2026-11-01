import { useEffect, useState } from 'react';
import { platformConfig } from '../config/platform.config';
import { LanguageToggle } from './LanguageToggle';

type Locale = 'ar' | 'en';
type JumpItem = { id: string; label: string };

type TopBarProps = {
  locale: Locale;
  languageLabel: string;
  themeLabel: string;
  onLanguageToggle: () => void;
  onThemeToggle: () => void;
};

export function TopBar({ languageLabel, themeLabel, onLanguageToggle, onThemeToggle }: TopBarProps) {
  return (
    <header className="site-topbar">
      <button className="theme-toggle" type="button" aria-label={themeLabel} onClick={onThemeToggle}>
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a1 1 0 0 1 1 1v1.06a1 1 0 1 1-2 0V4a1 1 0 0 1 1-1Zm0 14a5 5 0 1 0 0-10 5 5 0 0 0 0 10Zm8-5a1 1 0 0 1-1 1h-1.06a1 1 0 1 1 0-2H19a1 1 0 0 1 1 1ZM7.12 7.12a1 1 0 0 1-1.41 0L4.96 6.37a1 1 0 0 1 1.41-1.41l.75.75a1 1 0 0 1 0 1.41ZM19.04 6.37l-.75.75a1 1 0 1 1-1.41-1.41l.75-.75a1 1 0 0 1 1.41 1.41ZM12 17.94a1 1 0 0 1 1 1V20a1 1 0 1 1-2 0v-1.06a1 1 0 0 1 1-1Zm7.04.67a1 1 0 0 1 0 1.41 1 1 0 0 1-1.41 0l-.75-.75a1 1 0 0 1 1.41-1.41l.75.75ZM6.37 17.63a1 1 0 0 1 1.41 1.41l-.75.75a1 1 0 1 1-1.41-1.41l.75-.75ZM6.06 12a1 1 0 0 1-1 1H4a1 1 0 1 1 0-2h1.06a1 1 0 0 1 1 1Z" /></svg>
      </button>
      <LanguageToggle label={languageLabel} onToggle={onLanguageToggle} />
    </header>
  );
}

type EmblemCoverProps = { eyebrow: string; title: string; description: string };

export function EmblemCover({ eyebrow, title, description }: EmblemCoverProps) {
  return (
    <section className="emblem-cover" aria-labelledby="cover-title">
      <div className="cover-content">
        <p className="eyebrow">{eyebrow}</p>
        <h1 id="cover-title">{title}</h1>
        <p>{description}</p>
      </div>
      <div className="cover-emblem" aria-hidden="true">
        <span className="emblem-ring" />
        <img src={platformConfig.assets.logo} alt="" />
      </div>
    </section>
  );
}

function scrollToSection(id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  target.scrollIntoView({ behavior: 'smooth', block: 'center' });
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
