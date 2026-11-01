import { FormEvent, useState } from 'react';
import { platformConfig } from '../config/platform.config';
import type { Copy, Locale } from '../i18n/content';

type Props = {
  locale: Locale;
  text: Copy;
  onUnlocked: () => void;
};

export function LockGateway({ locale, text, onUnlocked }: Props) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/lock/unlock', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ password })
      });
      if (response.ok) {
        onUnlocked();
        return;
      }
      setError(response.status === 429 ? text.unavailable : text.invalidPassword);
    } catch {
      setError(text.unavailable);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="gateway" aria-labelledby="gateway-title">
      <div className="gateway-ornament" aria-hidden="true" />
      <div className="gateway-card">
        <div className="brand-lockup">
          <img src={platformConfig.assets.logo} className="brand-logo" alt="" />
          <span className="brand-pulse" aria-hidden="true" />
        </div>
        <p className="eyebrow">{text.lockEyebrow}</p>
        <h1 id="gateway-title">{text.lockTitle}</h1>
        <p className="gateway-description">{text.lockDescription}</p>
        <form className="lock-form" onSubmit={submit} noValidate>
          <label htmlFor="access-password">{text.passwordLabel}</label>
          <input id="access-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={text.passwordPlaceholder} required />
          {error ? <p className="form-error" role="alert">{error}</p> : null}
          <button type="submit" disabled={submitting}>{text.unlock}</button>
        </form>
        <div className="gateway-footer">
          <span>{text.protected}</span>
          <a href={`mailto:${platformConfig.contact.supportEmail}`} lang={locale}>{text.support}</a>
        </div>
      </div>
    </section>
  );
}
