import { useEffect, useState } from 'react';
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

type VoiceConstructor = new () => VoiceRecognition;
declare global { interface Window { SpeechRecognition?: VoiceConstructor; webkitSpeechRecognition?: VoiceConstructor; } }

export function AccessibilityTools({ locale, text, instructions }: { locale: AuthLocale; text: AuthCopy; instructions: string }) {
  const [large, setLarge] = useState(false);
  const [highContrast, setHighContrast] = useState(false);
  const [speaking, setSpeaking] = useState(false);

  useEffect(() => () => window.speechSynthesis?.cancel(), []);
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

  return <aside className="accessibility-tools" aria-label={text.accessibility}>
    <button type="button" className="access-tool" aria-pressed={large} onClick={() => { setLarge((value) => !value); document.documentElement.dataset.textSize = large ? 'normal' : 'large'; }}>{large ? text.normalText : text.largerText}</button>
    <button type="button" className="access-tool" aria-pressed={highContrast} onClick={() => { setHighContrast((value) => !value); document.documentElement.dataset.contrast = highContrast ? 'standard' : 'high'; }}>{highContrast ? text.standardContrast : text.contrast}</button>
    {'speechSynthesis' in window ? <button type="button" className="access-tool" aria-pressed={speaking} onClick={speak}>{speaking ? text.stopListening : text.listen}</button> : null}
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
