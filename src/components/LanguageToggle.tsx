type Props = { label: string; onToggle: () => void };

export function LanguageToggle({ label, onToggle }: Props) {
  return (
    <button className="language-toggle" type="button" aria-label={label} onClick={onToggle}>
      <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2a10 10 0 1 0 0 20a10 10 0 0 0 0-20Zm0 18.25c-1.18-1.46-1.95-3.72-2.1-6.25h4.2c-.15 2.53-.92 4.79-2.1 6.25ZM9.9 10c.15-2.53.92-4.79 2.1-6.25c1.18 1.46 1.95 3.72 2.1 6.25H9.9Zm-2.15 0H4.16a8.04 8.04 0 0 1 5.11-5.52C8.43 6.02 7.87 7.89 7.75 10Zm0 4c.12 2.11.68 3.98 1.52 5.52A8.04 8.04 0 0 1 4.16 14h3.59Zm8.5 0h3.59a8.04 8.04 0 0 1-5.11 5.52c.84-1.54 1.4-3.41 1.52-5.52Zm0-4c-.12-2.11-.68-3.98-1.52-5.52A8.04 8.04 0 0 1 19.84 10h-3.59Z" /></svg>
    </button>
  );
}
