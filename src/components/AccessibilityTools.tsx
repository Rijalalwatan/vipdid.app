import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type PointerEvent as ReactPointerEvent } from 'react';
import type { AuthCopy, AuthLocale } from '../i18n/auth-content';

type VoiceRecognition = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onend: (() => void) | null;
  onerror: (() => void) | null;
};

type FloatingPosition = { left: number; top: number };
type DragState = { pointerId: number; offsetX: number; offsetY: number };

declare global { interface Window { SpeechRecognition?: VoiceConstructor; webkitSpeechRecognition?: VoiceConstructor; } }
type VoiceConstructor = new () => VoiceRecognition;

const isMobileViewport = () => window.matchMedia('(max-width: 700px)').matches;
const within = (value: number, minimum: number, maximum: number) => Math.min(Math.max(value, minimum), maximum);

export function AccessibilityTools({ locale, text, instructions }: { locale: AuthLocale; text: AuthCopy; instructions: string }) {
  const [large, setLarge] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [hidden, setHidden] = useState(false);
  const [position, setPosition] = useState<FloatingPosition | null>(null);
  const panelRef = useRef<HTMLElement>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  useEffect(() => {
    const resetOutsideMobile = () => {
      if (!isMobileViewport()) {
        setPosition(null);
        setHidden(false);
      }
    };
    window.addEventListener('resize', resetOutsideMobile);
    return () => window.removeEventListener('resize', resetOutsideMobile);
  }, []);

  const speak = () => {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    if (speaking) { setSpeaking(false); return; }
    const utterance = new SpeechSynthesisUtterance(instructions);
    utterance.lang = locale === 'ar' ? 'ar-SA' : 'en-US';
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    setSpeaking(true);
    window.speechSynthesis.speak(utterance);
  };

  const startDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (!isMobileViewport() || !panelRef.current || (event.pointerType === 'mouse' && event.button !== 0)) return;
    const box = panelRef.current.getBoundingClientRect();
    dragRef.current = { pointerId: event.pointerId, offsetX: event.clientX - box.left, offsetY: event.clientY - box.top };
    setPosition({ left: box.left, top: box.top });
    event.currentTarget.setPointerCapture(event.pointerId);
    event.preventDefault();
  };

  const movePanel = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    const panel = panelRef.current;
    if (!drag || drag.pointerId !== event.pointerId || !panel) return;
    const left = within(event.clientX - drag.offsetX, 8, Math.max(8, window.innerWidth - panel.offsetWidth - 8));
    const top = within(event.clientY - drag.offsetY, 8, Math.max(8, window.innerHeight - panel.offsetHeight - 8));
    setPosition({ left, top });
  };

  const stopDragging = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  };

  const moveWithKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!isMobileViewport() || !panelRef.current) return;
    const delta = 18;
    const direction = event.key === 'ArrowLeft' ? [-delta, 0] : event.key === 'ArrowRight' ? [delta, 0] : event.key === 'ArrowUp' ? [0, -delta] : event.key === 'ArrowDown' ? [0, delta] : null;
    if (!direction) return;
    event.preventDefault();
    const box = panelRef.current.getBoundingClientRect();
    const current = position ?? { left: box.left, top: box.top };
    setPosition({
      left: within(current.left + direction[0], 8, Math.max(8, window.innerWidth - box.width - 8)),
      top: within(current.top + direction[1], 8, Math.max(8, window.innerHeight - box.height - 8))
    });
  };

  const panelStyle: CSSProperties | undefined = position ? { inset: 'auto', left: `${position.left}px`, top: `${position.top}px` } : undefined;
  if (hidden) return <button type="button" className="accessibility-reopen" aria-label={text.showAccessibility} onClick={() => setHidden(false)}><svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="2" /><path d="M12 8v6m-5-3 5-3 5 3m-8 1-2 7m8-7 2 7m-8-2h6" /></svg></button>;

  return <aside ref={panelRef} className="accessibility-tools" aria-label={text.accessibility} style={panelStyle}>
    <button type="button" className="accessibility-drag-handle" aria-label={text.moveAccessibility} onPointerDown={startDragging} onPointerMove={movePanel} onPointerUp={stopDragging} onPointerCancel={stopDragging} onKeyDown={moveWithKeyboard}><span className="drag-grip" aria-hidden="true" /></button>
    <div className="accessibility-actions">
      <button type="button" className="access-tool" aria-pressed={large} onClick={() => { setLarge((value) => !value); document.documentElement.dataset.textSize = large ? 'normal' : 'large'; }}>{large ? text.normalText : text.largerText}</button>
      <button type="button" className="access-tool" aria-pressed={highContrast} onClick={() => { setHighContrast((value) => !value); document.documentElement.dataset.contrast = highContrast ? 'standard' : 'high'; }}>{highContrast ? text.standardContrast : text.contrast}</button>
      {'speechSynthesis' in window ? <button type="button" className="access-tool" aria-pressed={speaking} onClick={speak}>{speaking ? text.stopListening : text.listen}</button> : null}
    </div>
    <button type="button" className="accessibility-hide" aria-label={text.hideAccessibility} onClick={() => setHidden(true)}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" /></svg></button>
  </aside>;
}

export function VoiceFieldButton({ locale, text, onResult }: { locale: AuthLocale; text: AuthCopy; onResult: (value: string) => void }) {
  const [listening, setListening] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const start = () => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) { setUnavailable(true); return; }
    const recognition = new Recognition();
    recognition.lang = locale === 'ar' ? 'ar-SA' : 'en-US';
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => onResult(Array.from(event.results).map((result) => result[0]?.transcript ?? '').join(' ').trim());
    recognition.onend = () => setListening(false);
    recognition.onerror = () => { setListening(false); setUnavailable(true); };
    setUnavailable(false); setListening(true); recognition.start();
  };
  return <span className="voice-control"><button type="button" className="voice-button" onClick={start} aria-describedby={unavailable ? 'voice-unavailable' : undefined}>{text.voiceInput}</button>{unavailable ? <span id="voice-unavailable" className="sr-status" role="status">{text.voiceUnavailable}</span> : null}{listening ? <span className="sr-status" role="status">{text.voiceHint}</span> : null}</span>;
}
