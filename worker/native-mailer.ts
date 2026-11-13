/** In-process replacement for the legacy shared PlatformMailer Worker.
 * No public email endpoint, startup I/O, retries, credential logging or cross-app state.
 */
export interface MailMessage {
  from: string;
  to: string[];
  cc?: string[];
  bcc?: string[];
  subject: string;
  text?: string;
  html?: string;
  replyTo: string;
}
export interface NativeMailEnv {
  RESEND_API_KEY?: string;
  EMAIL?: { send(message: MailMessage): Promise<{ messageId?: string } | void> };
}
export interface MailTransport {
  fetch(request: Request): Promise<Response>;
}

const RESEND = 'https://api.resend.com/emails';
// Keep the existing sender for both applications; changing domains is a separate task.
const FROM = 'Saudi CV Support <support@saudi.cv>';
const REPLY = 'support@saudi.cv';
const QUOTAS = new Set(['daily_quota_exceeded', 'monthly_quota_exceeded']);
const out = (body: unknown, status: number) => new Response(JSON.stringify(body), {
  status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' },
});
const list = (value: unknown): string[] | null => typeof value === 'string' ? [value]
  : Array.isArray(value) && value.every(item => typeof item === 'string') ? value : null;
const valid = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function checkedMessage(input: unknown): Omit<MailMessage, 'from' | 'replyTo'> | null {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return null;
  const value = input as Record<string, unknown>;
  const to = list(value.to);
  const cc = value.cc === undefined ? undefined : list(value.cc);
  const bcc = value.bcc === undefined ? undefined : list(value.bcc);
  const subject = typeof value.subject === 'string' ? value.subject.trim() : '';
  const text = typeof value.text === 'string' ? value.text : undefined;
  const html = typeof value.html === 'string' ? value.html : undefined;
  if (!to?.length || !to.every(valid) || cc === null || bcc === null
    || (cc && !cc.every(valid)) || (bcc && !bcc.every(valid))
    || !subject || subject.length > 998 || (!text && !html)) return null;
  return { to, ...(cc ? { cc } : {}), ...(bcc ? { bcc } : {}), subject,
    ...(text ? { text } : {}), ...(html ? { html } : {}) };
}

export function createNativeMailer(env: NativeMailEnv): MailTransport {
  return { async fetch(request: Request): Promise<Response> {
    if (request.method !== 'POST' || new URL(request.url).pathname !== '/v1/support/send') {
      return out({ error: 'Not found.' }, 404);
    }
    let input: unknown;
    try { input = await request.json(); } catch { return out({ error: 'Request body must be valid JSON.' }, 400); }
    const message = checkedMessage(input);
    if (!message) return out({ error: 'Invalid mail message.' }, 400);
    if (!env.RESEND_API_KEY) return out({ error: 'Mail provider is not configured.' }, 503);
    const requestId = crypto.randomUUID();
    const payloadKey = (input as Record<string, unknown>).idempotencyKey;
    const key = request.headers.get('Idempotency-Key')
      || (typeof payloadKey === 'string' ? payloadKey : '')
      || `platform-mail-${requestId}`;
    if (!/^[\x21-\x7e]{1,256}$/.test(key)) return out({ error: 'Invalid idempotency key.' }, 400);
    let primary: Response;
    try {
      primary = await fetch(RESEND, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json',
          'Idempotency-Key': key, 'User-Agent': 'platform-native-mailer/1.0' },
        body: JSON.stringify({ from: FROM, ...message, reply_to: REPLY }),
      });
    } catch {
      // Do not send a second copy through fallback when delivery may have occurred.
      return out({ error: 'Primary delivery outcome is unknown.', requestId }, 503);
    }
    const result = await primary.json().catch(() => null) as Record<string, unknown> | null;
    if (primary.ok) return out({ provider: 'resend', requestId,
      messageId: typeof result?.id === 'string' ? result.id : null }, 202);
    const code = String(result?.name || result?.type || result?.code || '').toLowerCase();
    if (primary.status !== 429 || !QUOTAS.has(code)) {
      return out({ error: 'Primary delivery was not accepted.', requestId, primaryStatus: primary.status }, 503);
    }
    if (!env.EMAIL) return out({ error: 'Fallback delivery is not configured.', requestId }, 503);
    try {
      const fallback = await env.EMAIL.send({ from: FROM, ...message, replyTo: REPLY });
      return out({ provider: 'cloudflare', failover: 'resend_quota_exceeded', requestId,
        messageId: fallback?.messageId || null }, 202);
    } catch {
      return out({ error: 'Fallback delivery was not accepted.', requestId }, 503);
    }
  } };
}
