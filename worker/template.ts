interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RATE_LIMIT: KVNamespace;
  MAILER: Fetcher;
  SESSION_SIGNING_KEY: string;
  TURNSTILE_SECRET_KEY: string;
}

type Locale = 'ar' | 'en';
type StaticAsset = { body: string; type: string; immutable: boolean };
type SearchRow = { slug: string; published_json: string | null; featured_until: number | null };
type PublicResult = { slug: string; name: string; title: string; summary: string; featured: boolean };
type UserRow = { id: string; permanent_id: string; name: string; role: 'user' | 'moderator' | 'adheed' | 'super_admin'; wallet_balance: number; email_verified_at: number | null; status: string; pin_hash: string | null; pin_salt: string | null; failed_login_attempts: number; locked_until: number | null };
type ChallengeRow = { id: string; user_id: string | null; code_hash: string; code_salt: string; expires_at: number; attempts: number; max_attempts: number };
type MediaCategory = 'avatar' | 'cover' | 'skill' | 'portfolio';
type ProfileRow = { id: string; user_id: string; tenant_id: string; slug: string; draft_json: string; is_published: number; storage_used_bytes: number; images_count: number; updated_at: number; created_at: number };
type MediaRow = { id: string; category: MediaCategory; r2_key: string; size_bytes: number; created_at: number };
type ContactRow = { email: string; phone: string | null; whatsapp: string | null; tenant_id: string };
declare const __STATIC_ASSETS__: Record<string, StaticAsset>;

const STATIC_ASSETS: Record<string, StaticAsset> = __STATIC_ASSETS__;
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const OWNER_EMAIL = 'rijalalwatan.com@gmail.com';
const SESSION_SECONDS = 60 * 60 * 24;
const DEVICE_SECONDS = 60 * 60 * 24 * 30;
const CHALLENGE_MS = 10 * 60 * 1000;
const IMAGE_STORAGE_LIMIT = 5 * 1024 * 1024;
const IMAGE_MAXIMUMS: Record<MediaCategory, number> = { avatar: 1, cover: 1, skill: 3, portfolio: 4 };
const RESERVED_SLUGS = new Set(['api', 'assets', 'brand', 'dashboard', 'features', 'favicon.ico', 'privacy', 'sw.js', 'terms', 'manus-routes.json']);
const securityHeaders = {
  'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'x-content-type-options': 'nosniff',
  'permissions-policy': 'camera=(), microphone=(self), geolocation=()',
  'content-security-policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; object-src 'none'; base-uri 'self'; form-action 'self'"
};

function responseJson(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...securityHeaders, ...headers } });
}
function secure(response: Response) { Object.entries(securityHeaders).forEach(([key, value]) => response.headers.set(key, value)); return response; }
function fromBase64(value: string) { const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(binary, (character) => character.charCodeAt(0)); }
function toBase64Url(bytes: Uint8Array) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, ''); }
function toBase64(bytes: Uint8Array) { let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte); return btoa(binary); }
function randomToken(size = 32) { const bytes = new Uint8Array(size); crypto.getRandomValues(bytes); return toBase64Url(bytes); }
function randomCode() { const values = new Uint32Array(1); let value = 0; do { crypto.getRandomValues(values); value = values[0]; } while (value >= 4294000000); return String(value % 1000000).padStart(6, '0'); }
async function digest(value: string) { return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))); }
async function hashed(value: string) { return toBase64(await digest(value)); }
function equal(left: Uint8Array, right: Uint8Array) { if (left.byteLength !== right.byteLength) return false; let comparison = 0; for (let index = 0; index < left.length; index += 1) comparison |= left[index] ^ right[index]; return comparison === 0; }
async function deriveSecretHash(value: string, salt: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: 210000 }, key, 256); return new Uint8Array(bits); }
async function sign(value: string, secret: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))); }
function localeOf(value: unknown): Locale { return value === 'en' ? 'en' : 'ar'; }
function emailOf(value: unknown) { const email = typeof value === 'string' ? value.trim().toLowerCase() : ''; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null; }
function phoneOf(value: unknown) { const phone = typeof value === 'string' ? value.trim() : ''; return !phone || (/^[0-9+()\s-]{5,28}$/.test(phone) ? phone : null); }
function pinOf(value: unknown) { return typeof value === 'string' && /^\d{6}$/.test(value) ? value : null; }
function cookie(request: Request, name: string) { return request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null; }
function sessionCookie(value: string) { return `vipdid_session=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=None`; }
function deviceCookie(value: string) { return `vipdid_device=${value}; Path=/; Max-Age=${DEVICE_SECONDS}; HttpOnly; Secure; SameSite=None`; }
function clearCookie(name: string) { return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`; }
function withCookies(response: Response, values: string[]) { values.forEach((value) => response.headers.append('set-cookie', value)); return response; }
function sameOrigin(request: Request) { const origin = request.headers.get('origin'); return !origin || origin === new URL(request.url).origin; }
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function textField(source: Record<string, unknown>, names: string[]) { for (const name of names) { const value = source[name]; if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 220); } return ''; }
function publicResult(row: SearchRow): PublicResult { let profile: Record<string, unknown> = {}; try { profile = record(row.published_json ? JSON.parse(row.published_json) : {}); } catch { profile = {}; } return { slug: row.slug, name: textField(profile, ['name', 'displayName', 'name_ar', 'name_en']) || row.slug, title: textField(profile, ['title', 'headline', 'title_ar', 'title_en']), summary: textField(profile, ['summary', 'description', 'bio', 'summary_ar', 'summary_en']), featured: Boolean(row.featured_until && row.featured_until > Date.now()) }; }
function userView(user: UserRow) { return { id: user.id, permanentId: user.permanent_id, name: user.name, role: user.role, walletBalance: user.wallet_balance, verified: Boolean(user.email_verified_at) }; }

async function setting(env: Env, key: string) { return (await env.DB.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null; }
async function hasAccess(request: Request, env: Env) { const value = cookie(request, 'vipdid_access'); if (!value) return false; const [payload, signature] = value.split('.'); if (!payload || !signature || !equal(encoder.encode(await sign(payload, env.SESSION_SIGNING_KEY)), encoder.encode(signature))) return false; try { const decoded = JSON.parse(decoder.decode(fromBase64(payload))) as { expiresAt?: number }; return typeof decoded.expiresAt === 'number' && decoded.expiresAt > Date.now(); } catch { return false; } }
async function locked(request: Request, env: Env) { return (await setting(env, 'site_lock_enabled')) === '1' && !(await hasAccess(request, env)); }
async function limited(env: Env, request: Request, label: string, email: string, maximum: number, seconds: number) { const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const key = `auth:${label}:${toBase64Url(await digest(`${ip}:${email}`)).slice(0, 30)}`; const count = Number(await env.RATE_LIMIT.get(key) ?? '0'); if (count >= maximum) return true; await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: seconds }); return false; }
async function clearLimit(env: Env, request: Request, label: string, email: string) { const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const key = `auth:${label}:${toBase64Url(await digest(`${ip}:${email}`)).slice(0, 30)}`; await env.RATE_LIMIT.delete(key); }
async function publicSearch(request: Request, env: Env) { const url = new URL(request.url); const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80).toLowerCase(); const featured = url.searchParams.get('featured') === '1'; const conditions = ['is_published = 1', 'allow_search_indexing = 1']; const values: (string | number)[] = []; if (featured) { conditions.push('(featured_until IS NOT NULL AND featured_until > ?)'); values.push(Date.now()); } if (query) { conditions.push('(lower(slug) LIKE ? OR lower(COALESCE(published_json, \'\')) LIKE ?)'); const phrase = `%${query.replace(/[\\%_]/g, '\\$&')}%`; values.push(phrase, phrase); } const sql = `SELECT slug, published_json, featured_until FROM profiles WHERE ${conditions.join(' AND ')} ORDER BY featured_until DESC, updated_at DESC LIMIT 20`; const response = await env.DB.prepare(sql).bind(...values).all<SearchRow>(); return responseJson({ results: (response.results ?? []).map(publicResult) }); }

const emailCopy = {
  ar: { subject: 'رمز التحقق من الهوية الرقمية لكبار الشخصيات', intro: 'رمز التحقق الخاص بك هو', expiry: 'ينتهي الرمز خلال عشر دقائق. لا تشاركه مع أي شخص.', text: 'رمز التحقق من الهوية الرقمية لكبار الشخصيات' },
  en: { subject: 'Your VIP Digital ID verification code', intro: 'Your verification code is', expiry: 'This code expires in ten minutes. Do not share it with anyone.', text: 'VIP Digital ID verification code' }
};
async function sendCode(env: Env, email: string, code: string, locale: Locale) { const copy = emailCopy[locale]; const text = `${copy.text}\n\n${copy.intro}: ${code}\n\n${copy.expiry}`; const html = `<div dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale}"><p>${copy.intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${code}</p><p>${copy.expiry}</p></div>`; const response = await env.MAILER.fetch(new Request('https://mailer/v1/support/send', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `vipdid-code-${await hashed(`${email}:${code}`)}` }, body: JSON.stringify({ to: email, subject: copy.subject, text, html }) })); return response.ok; }
async function verifyTurnstile(request: Request, env: Env, token: unknown) { if (typeof token !== 'string' || !token || !env.TURNSTILE_SECRET_KEY) return false; const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token }); const ip = request.headers.get('CF-Connecting-IP'); if (ip) form.set('remoteip', ip); const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form }); const result = await response.json().catch(() => ({ success: false })) as { success?: boolean; hostname?: string }; return response.ok && result.success === true && result.hostname === 'vipdid.app'; }
async function createChallenge(env: Env, request: Request, email: string, userId: string | null, purpose: 'registration' | 'login' | 'owner_setup', locale: Locale) { const now = Date.now(); const code = randomCode(); const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const codeHash = toBase64(await deriveSecretHash(code, salt)); const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const ipHash = toBase64(await digest(ip)); await env.DB.batch([
  env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL').bind(now, email, purpose),
  env.DB.prepare('INSERT INTO auth_challenges (id, user_id, email, purpose, code_hash, code_salt, locale, attempts, max_attempts, expires_at, consumed_at, requested_ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 6, ?, NULL, ?, ?)').bind(crypto.randomUUID(), userId, email, purpose, codeHash, salt, locale, now + CHALLENGE_MS, ipHash, now)
 ]); return code; }
async function consumeChallenge(env: Env, email: string, code: string, purpose: 'registration' | 'login' | 'owner_setup') { const now = Date.now(); const challenge = await env.DB.prepare('SELECT id, user_id, code_hash, code_salt, expires_at, attempts, max_attempts FROM auth_challenges WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(email, purpose).first<ChallengeRow>(); if (!challenge || challenge.expires_at <= now) return { ok: false as const, error: 'challenge_expired' }; if (challenge.attempts >= challenge.max_attempts) return { ok: false as const, error: 'challenge_limited' }; const actual = await deriveSecretHash(code, challenge.code_salt); if (!equal(actual, fromBase64(challenge.code_hash))) { await env.DB.prepare('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?').bind(challenge.id).run(); return { ok: false as const, error: 'invalid_code' }; } return { ok: true as const, challenge }; }
async function activeDevice(request: Request, env: Env, userId: string) { const token = cookie(request, 'vipdid_device'); if (!token) return null; const device = await env.DB.prepare('SELECT id FROM trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > ? AND revoked_at IS NULL').bind(userId, await hashed(token), Date.now()).first<{ id: string }>(); if (device) await env.DB.prepare('UPDATE trusted_devices SET last_used_at = ? WHERE id = ?').bind(Date.now(), device.id).run(); return device; }
async function issueSession(env: Env, user: UserRow, trustDevice: boolean) { const now = Date.now(); const sessionToken = randomToken(); const sessionId = crypto.randomUUID(); const cookies = [sessionCookie(sessionToken)]; let deviceId: string | null = null; if (trustDevice) { const deviceToken = randomToken(); deviceId = crypto.randomUUID(); await env.DB.prepare('INSERT INTO trusted_devices (id, user_id, token_hash, last_used_at, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').bind(deviceId, user.id, await hashed(deviceToken), now, now + DEVICE_SECONDS * 1000, now).run(); cookies.push(deviceCookie(deviceToken)); }
 await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, trusted_device_id, expires_at, last_seen_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)').bind(sessionId, user.id, await hashed(sessionToken), deviceId, now + SESSION_SECONDS * 1000, now, now).run(); await env.DB.prepare('UPDATE users SET last_login_at = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').bind(now, user.id).run(); return { user: userView(user), cookies }; }
async function authUser(request: Request, env: Env) { const token = cookie(request, 'vipdid_session'); if (!token) return null; const user = await env.DB.prepare(`SELECT u.id, u.permanent_id, u.name, u.role, u.wallet_balance, u.email_verified_at, u.status, u.pin_hash, u.pin_salt, u.failed_login_attempts, u.locked_until FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL AND u.status = 'active'`).bind(await hashed(token), Date.now()).first<UserRow>(); if (user) await env.DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(Date.now(), await hashed(token)).run(); return user; }

async function register(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const body = await request.json().catch(() => ({})); const input = record(body); const locale = localeOf(input.locale); const email = emailOf(input.email); const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : ''; const phone = phoneOf(input.phone); const whatsapp = phoneOf(input.whatsapp); if (!email || !name || phone === null || whatsapp === null || input.termsAccepted !== true || input.privacyAccepted !== true || input.eligibilityAccepted !== true) return responseJson({ ok: false, error: 'invalid_input' }, 400); if (await limited(env, request, 'register', email, 4, 900)) return responseJson({ ok: false, error: 'limited' }, 429); if (!(await verifyTurnstile(request, env, input.turnstileToken))) return responseJson({ ok: false, error: 'human_failed' }, 400); const now = Date.now(); let user = await env.DB.prepare('SELECT id, status FROM users WHERE email = ?').bind(email).first<{ id: string; status: string }>(); if (user?.status === 'active') return responseJson({ ok: false, error: 'email_in_use' }, 409); if (!user) { const id = `user_${crypto.randomUUID()}`; await env.DB.prepare('INSERT INTO users (id, permanent_id, tenant_id, name, email, phone, whatsapp, pin_hash, pin_salt, role, is_managed, wallet_balance, status, failed_login_attempts, terms_accepted_at, privacy_accepted_at, eligibility_acknowledged_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, 0, ?, 0, ?, ?, ?, ?)').bind(id, `pending_${crypto.randomUUID()}`, 'tenant_main', name, email, phone || null, whatsapp || null, 'user', 'pending_verification', now, now, now, now).run(); user = { id, status: 'pending_verification' }; } else { await env.DB.prepare('UPDATE users SET name = ?, phone = ?, whatsapp = ?, terms_accepted_at = ?, privacy_accepted_at = ?, eligibility_acknowledged_at = ? WHERE id = ?').bind(name, phone || null, whatsapp || null, now, now, now, user.id).run(); }
 const code = await createChallenge(env, request, email, user.id, 'registration', locale); if (!(await sendCode(env, email, code, locale))) return responseJson({ ok: false, error: 'delivery_failed' }, 503); await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'tenant_main', user.id, 'registration_code_sent', 'user', user.id, JSON.stringify({ locale }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now).run(); return responseJson({ ok: true, state: 'verification_required' }, 202); }

async function verifyRegistration(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const code = pinOf(input.code); const pin = pinOf(input.pin); if (!email || !code || !pin) return responseJson({ ok: false, error: 'invalid_input' }, 400); const checked = await consumeChallenge(env, email, code, 'registration'); if (!checked.ok) return responseJson({ ok: false, error: checked.error }, 401); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE id = ? AND email = ? AND status = 'pending_verification'`).bind(checked.challenge.user_id, email).first<UserRow>(); if (!user) return responseJson({ ok: false, error: 'invalid_request' }, 400); const sequence = Math.max(1, Number(await setting(env, 'next_permanent_id_seq') ?? '1')); const permanentId = `C${sequence + 1}`; const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const pinHash = toBase64(await deriveSecretHash(pin, salt)); const now = Date.now(); await env.DB.batch([
  env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, checked.challenge.id),
  env.DB.prepare('UPDATE users SET permanent_id = ?, pin_hash = ?, pin_salt = ?, pin_set_at = ?, email_verified_at = ?, status = ?, wallet_balance = wallet_balance + 100 WHERE id = ?').bind(permanentId, pinHash, salt, now, now, 'active', user.id),
  env.DB.prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?').bind(String(sequence + 1), now, 'next_permanent_id_seq'),
  env.DB.prepare('INSERT INTO ledger_entries (id, idempotency_key, from_account, to_account, amount, tx_type, metadata_json, actor_id, created_at) VALUES (?, ?, ?, ?, 100, ?, ?, ?, ?)').bind(crypto.randomUUID(), `registration-bonus:${user.id}`, 'treasury', user.id, 'registration_verification_bonus', JSON.stringify({ permanentId }), user.id, now),
  env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'tenant_main', user.id, 'registration_verified', 'user', user.id, JSON.stringify({ permanentId }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
 ]);
 const active = { ...user, permanent_id: permanentId, wallet_balance: user.wallet_balance + 100, email_verified_at: now, status: 'active', pin_hash: pinHash, pin_salt: salt }; const issued = await issueSession(env, active, input.trustDevice !== false); return withCookies(responseJson({ ok: true, user: issued.user }), issued.cookies); }

async function loginStart(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const pin = pinOf(input.pin); const locale = localeOf(input.locale); if (!email || !pin) return responseJson({ ok: false, error: 'invalid_login' }, 400); if (await limited(env, request, 'login', email, 8, 900)) return responseJson({ ok: false, error: 'limited' }, 429); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE email = ?`).bind(email).first<UserRow>(); const now = Date.now(); if (!user || user.status !== 'active') return responseJson({ ok: false, error: 'invalid_login' }, 401); if (user.locked_until && user.locked_until > now) return responseJson({ ok: false, error: 'account_locked' }, 429); if (!user.pin_hash || !user.pin_salt) return responseJson({ ok: false, error: 'pin_not_set' }, 401); if (!equal(await deriveSecretHash(pin, user.pin_salt), fromBase64(user.pin_hash))) { const attempts = user.failed_login_attempts + 1; const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : null; await env.DB.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').bind(attempts, lockedUntil, user.id).run(); return responseJson({ ok: false, error: lockedUntil ? 'account_locked' : 'invalid_login' }, 401); }
 await clearLimit(env, request, 'login', email); const device = await activeDevice(request, env, user.id); if (device) { const issued = await issueSession(env, user, false); return withCookies(responseJson({ ok: true, state: 'authenticated', user: issued.user }), issued.cookies); }
 const code = await createChallenge(env, request, email, user.id, 'login', locale); if (!(await sendCode(env, email, code, locale))) return responseJson({ ok: false, error: 'delivery_failed' }, 503); return responseJson({ ok: true, state: 'verification_required' }, 202); }

async function verifyLogin(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const code = pinOf(input.code); if (!email || !code) return responseJson({ ok: false, error: 'invalid_input' }, 400); const checked = await consumeChallenge(env, email, code, 'login'); if (!checked.ok) return responseJson({ ok: false, error: checked.error }, 401); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE id = ? AND email = ? AND status = 'active'`).bind(checked.challenge.user_id, email).first<UserRow>(); if (!user) return responseJson({ ok: false, error: 'invalid_login' }, 401); await env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ?').bind(Date.now(), checked.challenge.id).run(); const issued = await issueSession(env, user, input.trustDevice !== false); return withCookies(responseJson({ ok: true, state: 'authenticated', user: issued.user }), issued.cookies); }

async function ownerStart(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const locale = localeOf(input.locale); if (!email || email !== OWNER_EMAIL || !(await verifyTurnstile(request, env, input.turnstileToken))) return responseJson({ ok: false, error: 'invalid_login' }, 401); if (await limited(env, request, 'owner', email, 3, 900)) return responseJson({ ok: false, error: 'limited' }, 429); const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ? AND role = 'super_admin'`).bind(email).first<{ id: string }>(); if (!user) return responseJson({ ok: false, error: 'invalid_login' }, 401); const code = await createChallenge(env, request, email, user.id, 'owner_setup', locale); if (!(await sendCode(env, email, code, locale))) return responseJson({ ok: false, error: 'delivery_failed' }, 503); return responseJson({ ok: true, state: 'verification_required' }, 202); }

async function ownerVerify(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const code = pinOf(input.code); const pin = pinOf(input.pin); if (!email || email !== OWNER_EMAIL || !code || !pin) return responseJson({ ok: false, error: 'invalid_input' }, 400); const checked = await consumeChallenge(env, email, code, 'owner_setup'); if (!checked.ok) return responseJson({ ok: false, error: checked.error }, 401); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE id = ? AND email = ? AND role = 'super_admin'`).bind(checked.challenge.user_id, email).first<UserRow>(); if (!user) return responseJson({ ok: false, error: 'invalid_login' }, 401); const now = Date.now(); const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const pinHash = toBase64(await deriveSecretHash(pin, salt)); await env.DB.batch([env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ?').bind(now, checked.challenge.id), env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, pin_set_at = ?, email_verified_at = ?, status = ? WHERE id = ?').bind(pinHash, salt, now, now, 'active', user.id)]); const issued = await issueSession(env, { ...user, pin_hash: pinHash, pin_salt: salt, email_verified_at: now, status: 'active' }, input.trustDevice !== false); return withCookies(responseJson({ ok: true, state: 'authenticated', user: issued.user }), issued.cookies); }


function slugOf(value: unknown) { const slug = typeof value === 'string' ? value.trim().toLowerCase() : ''; return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(slug) && !RESERVED_SLUGS.has(slug) ? slug : null; }
function textOf(value: unknown, maximum = 4000) { return typeof value === 'string' ? value.trim().slice(0, maximum) : ''; }
function profileDraft(value: unknown, fallbackName: string) {
  const input = record(value);
  return {
    displayName: textOf(input.displayName, 120) || fallbackName,
    title: textOf(input.title, 180), bio: textOf(input.bio), experiences: textOf(input.experiences), education: textOf(input.education), courses: textOf(input.courses),
    skills: textOf(input.skills), languages: textOf(input.languages), achievements: textOf(input.achievements), awards: textOf(input.awards),
    portfolio: textOf(input.portfolio), services: textOf(input.services), socialLinks: textOf(input.socialLinks), videoUrl: textOf(input.videoUrl, 500), externalLinks: textOf(input.externalLinks),
    showWhatsapp: input.showWhatsapp === true, showPhone: input.showPhone === true, showEmail: input.showEmail === true
  };
}
function readDraft(value: string | null | undefined, fallbackName: string) { try { return profileDraft(value ? JSON.parse(value) : {}, fallbackName); } catch { return profileDraft({}, fallbackName); } }
function mediaView(row: MediaRow) { return { id: row.id, category: row.category, sizeBytes: row.size_bytes, url: `/api/media/${encodeURIComponent(row.id)}` }; }
function isCategory(value: unknown): value is MediaCategory { return value === 'avatar' || value === 'cover' || value === 'skill' || value === 'portfolio'; }
function isWebP(bytes: Uint8Array) { return bytes.byteLength >= 12 && decoder.decode(bytes.slice(0, 4)) === 'RIFF' && decoder.decode(bytes.slice(8, 12)) === 'WEBP'; }

async function accountProfileData(env: Env, user: UserRow) {
  const [profile, contact] = await Promise.all([
    env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>(),
    env.DB.prepare('SELECT email, phone, whatsapp, tenant_id FROM users WHERE id = ?').bind(user.id).first<ContactRow>()
  ]);
  const media = profile ? (await env.DB.prepare('SELECT id, category, r2_key, size_bytes, created_at FROM media_assets WHERE profile_id = ? ORDER BY created_at ASC').bind(profile.id).all<MediaRow>()).results ?? [] : [];
  const storage = media.reduce((total, item) => total + item.size_bytes, 0);
  return { slug: profile?.slug ?? '', data: readDraft(profile?.draft_json, user.name), media: media.map(mediaView), imageCount: media.length, storageUsedBytes: storage, exists: Boolean(profile), contact: { email: contact?.email ?? '', phone: contact?.phone ?? '', whatsapp: contact?.whatsapp ?? '' } };
}

async function accountProfile(request: Request, env: Env) { const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401); return responseJson({ ok: true, profile: await accountProfileData(env, user) }); }

async function saveAccountProfile(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const input = record(await request.json().catch(() => ({}))); const slug = slugOf(input.slug);
  if (!slug) return responseJson({ ok: false, error: 'invalid_slug' }, 400);
  const existing = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>();
  const clash = await env.DB.prepare('SELECT id FROM profiles WHERE slug = ? AND user_id != ?').bind(slug, user.id).first<{ id: string }>();
  if (clash) return responseJson({ ok: false, error: RESERVED_SLUGS.has(slug) ? 'reserved_slug' : 'slug_taken' }, 409);
  const data = JSON.stringify(profileDraft(input.data, user.name)); const now = Date.now();
  try {
    if (existing) await env.DB.prepare('UPDATE profiles SET slug = ?, draft_json = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(slug, data, now, existing.id, user.id).run();
    else {
      const owner = await env.DB.prepare('SELECT tenant_id FROM users WHERE id = ?').bind(user.id).first<{ tenant_id: string }>();
      if (!owner) return responseJson({ ok: false, error: 'unauthorized' }, 401);
      await env.DB.prepare('INSERT INTO profiles (id, user_id, tenant_id, slug, is_published, published_version_id, draft_json, published_json, allow_search_indexing, active_days_balance, featured_until, storage_used_bytes, images_count, updated_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?, NULL, 1, 0, NULL, 0, 0, ?, ?)').bind(`profile_${crypto.randomUUID()}`, user.id, owner.tenant_id, slug, data, now, now).run();
    }
  } catch { return responseJson({ ok: false, error: 'slug_taken' }, 409); }
  await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'tenant_main', user.id, 'profile_draft_saved', 'profile', existing?.id ?? user.id, JSON.stringify({ slug }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now).run();
  return responseJson({ ok: true, profile: await accountProfileData(env, user) });
}

async function uploadProfileMedia(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const form = await request.formData().catch(() => null); const category = form?.get('category'); const file = form?.get('file');
  if (!isCategory(category) || !(file instanceof File) || file.type !== 'image/webp') return responseJson({ ok: false, error: 'invalid_image' }, 400);
  const profile = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>();
  if (!profile) return responseJson({ ok: false, error: 'profile_required' }, 400);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes) || bytes.byteLength < 64 || bytes.byteLength > 2 * 1024 * 1024) return responseJson({ ok: false, error: 'invalid_image' }, 400);
  const categoryRows = (await env.DB.prepare('SELECT id, category, r2_key, size_bytes, created_at FROM media_assets WHERE profile_id = ? AND category = ? ORDER BY created_at ASC').bind(profile.id, category).all<MediaRow>()).results ?? [];
  const allRows = (await env.DB.prepare('SELECT id, category, r2_key, size_bytes, created_at FROM media_assets WHERE profile_id = ?').bind(profile.id).all<MediaRow>()).results ?? [];
  const replacements = category === 'avatar' || category === 'cover' ? categoryRows : [];
  if (!replacements.length && categoryRows.length >= IMAGE_MAXIMUMS[category]) return responseJson({ ok: false, error: 'image_limit' }, 400);
  const used = allRows.reduce((total, item) => total + item.size_bytes, 0) - replacements.reduce((total, item) => total + item.size_bytes, 0);
  if (used + bytes.byteLength > IMAGE_STORAGE_LIMIT || allRows.length - replacements.length + 1 > 9) return responseJson({ ok: false, error: 'storage_limit' }, 400);
  const id = `media_${crypto.randomUUID()}`; const key = `profiles/${user.id}/${category}/${crypto.randomUUID()}.webp`; const now = Date.now();
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { userId: user.id, profileId: profile.id, category } });
    await env.DB.batch([
      ...replacements.map((item) => env.DB.prepare('DELETE FROM media_assets WHERE id = ? AND profile_id = ?').bind(item.id, profile.id)),
      env.DB.prepare('INSERT INTO media_assets (id, user_id, profile_id, category, r2_key, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, user.id, profile.id, category, key, bytes.byteLength, now),
      env.DB.prepare('UPDATE profiles SET storage_used_bytes = ?, images_count = ?, updated_at = ? WHERE id = ?').bind(used + bytes.byteLength, allRows.length - replacements.length + 1, now, profile.id),
      env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), profile.tenant_id, user.id, 'profile_media_uploaded', 'media', id, JSON.stringify({ category, size: bytes.byteLength }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
    ]);
  } catch { await env.MEDIA.delete(key).catch(() => undefined); return responseJson({ ok: false, error: 'invalid_image' }, 400); }
  await Promise.all(replacements.map((item) => env.MEDIA.delete(item.r2_key).catch(() => undefined)));
  return responseJson({ ok: true, profile: await accountProfileData(env, user) });
}

async function deleteProfileMedia(request: Request, env: Env, id: string) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const media = await env.DB.prepare('SELECT m.id, m.category, m.r2_key, m.size_bytes, m.created_at, p.id AS profile_id, p.tenant_id FROM media_assets m JOIN profiles p ON p.id = m.profile_id WHERE m.id = ? AND m.user_id = ?').bind(id, user.id).first<MediaRow & { profile_id: string; tenant_id: string }>();
  if (!media) return responseJson({ ok: false, error: 'not_found' }, 404);
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM media_assets WHERE id = ? AND user_id = ?').bind(media.id, user.id),
    env.DB.prepare('UPDATE profiles SET storage_used_bytes = MAX(0, storage_used_bytes - ?), images_count = MAX(0, images_count - 1), updated_at = ? WHERE id = ?').bind(media.size_bytes, now, media.profile_id),
    env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), media.tenant_id, user.id, 'profile_media_deleted', 'media', media.id, JSON.stringify({ category: media.category }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
  ]);
  await env.MEDIA.delete(media.r2_key).catch(() => undefined);
  return responseJson({ ok: true, profile: await accountProfileData(env, user) });
}

async function mediaAsset(env: Env, id: string) {
  const media = await env.DB.prepare('SELECT r2_key FROM media_assets WHERE id = ?').bind(id).first<{ r2_key: string }>();
  if (!media) return new Response('Not Found', { status: 404, headers: securityHeaders });
  const object = await env.MEDIA.get(media.r2_key);
  if (!object) return new Response('Not Found', { status: 404, headers: securityHeaders });
  return secure(new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'image/webp', 'content-length': String(object.size), 'cache-control': object.httpMetadata?.cacheControl ?? 'public, max-age=31536000, immutable' } }));
}

async function publicProfile(env: Env, slug: string) {
  const profile = await env.DB.prepare('SELECT p.id, p.user_id, p.tenant_id, p.slug, p.draft_json, p.is_published, p.storage_used_bytes, p.images_count, p.updated_at, p.created_at, u.name, u.email, u.phone, u.whatsapp FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.slug = ? AND u.status = ?').bind(slug, 'active').first<ProfileRow & { name: string; email: string; phone: string | null; whatsapp: string | null }>();
  if (!profile) return responseJson({ ok: false, error: 'not_found' }, 404);
  const media = (await env.DB.prepare('SELECT id, category, r2_key, size_bytes, created_at FROM media_assets WHERE profile_id = ? ORDER BY created_at ASC').bind(profile.id).all<MediaRow>()).results ?? [];
  return responseJson({ ok: true, profile: { slug: profile.slug, data: readDraft(profile.draft_json, profile.name), media: media.map(mediaView), contact: { email: profile.email, phone: profile.phone ?? '', whatsapp: profile.whatsapp ?? '' } } });
}

async function me(request: Request, env: Env) { const user = await authUser(request, env); return responseJson({ ok: true, authenticated: Boolean(user), user: user ? userView(user) : null }); }
async function logout(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const token = cookie(request, 'vipdid_session'); if (token) await env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(Date.now(), await hashed(token)).run(); return withCookies(responseJson({ ok: true }), [clearCookie('vipdid_session'), clearCookie('vipdid_device')]); }
async function unlock(request: Request, env: Env) { const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const rateKey = `lock:${toBase64Url(await digest(ip)).slice(0, 24)}`; const current = Number(await env.RATE_LIMIT.get(rateKey) ?? '0'); if (current >= 5) return responseJson({ ok: false, reason: 'limited' }, 429); const body = await request.json<{ password?: string }>().catch(() => ({} as { password?: string })); const [enabled, expectedHash, salt] = await Promise.all([setting(env, 'site_lock_enabled'), setting(env, 'site_lock_password_hash'), setting(env, 'site_lock_password_salt')]); if (enabled !== '1') return responseJson({ ok: true, locked: false }); const verified = Boolean(body.password && expectedHash && salt && equal(await deriveSecretHash(body.password, salt), fromBase64(expectedHash))); if (!verified) { await env.RATE_LIMIT.put(rateKey, String(current + 1), { expirationTtl: 900 }); return responseJson({ ok: false, reason: 'invalid' }, 401); } await env.RATE_LIMIT.delete(rateKey); const payload = toBase64Url(encoder.encode(JSON.stringify({ expiresAt: Date.now() + 43200000 }))); const token = `${payload}.${await sign(payload, env.SESSION_SIGNING_KEY)}`; return responseJson({ ok: true, locked: false }, 200, { 'set-cookie': `vipdid_access=${token}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=None` }); }
function staticAsset(pathname: string) { const key = pathname === '/' ? 'index.html' : pathname.slice(1); const asset = STATIC_ASSETS[key]; if (!asset) return null; return new Response(fromBase64(asset.body), { headers: { 'content-type': asset.type, 'cache-control': asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff' } }); }

function routeSlug(pathname: string) { const value = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, '')); return slugOf(value); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return responseJson({ ok: true, service: 'vipdid' });
    if (url.pathname === '/api/lock/status' && request.method === 'GET') return responseJson({ locked: await locked(request, env) });
    if (url.pathname === '/api/lock/unlock' && request.method === 'POST') return unlock(request, env);
    if (url.pathname === '/api/public/search' && request.method === 'GET') return publicSearch(request, env);
    if (url.pathname.startsWith('/api/public/profile/') && request.method === 'GET') { const slug = slugOf(decodeURIComponent(url.pathname.slice('/api/public/profile/'.length))); return slug ? publicProfile(env, slug) : responseJson({ ok: false, error: 'not_found' }, 404); }
    if (url.pathname.startsWith('/api/media/') && request.method === 'GET') { const id = decodeURIComponent(url.pathname.slice('/api/media/'.length)); return /^media_[a-z0-9-]{36}$/.test(id) ? mediaAsset(env, id) : new Response('Not Found', { status: 404, headers: securityHeaders }); }
    if (url.pathname === '/api/auth/me' && request.method === 'GET') return me(request, env);
    if (url.pathname === '/api/auth/register' && request.method === 'POST') return register(request, env);
    if (url.pathname === '/api/auth/register/verify' && request.method === 'POST') return verifyRegistration(request, env);
    if (url.pathname === '/api/auth/login/start' && request.method === 'POST') return loginStart(request, env);
    if (url.pathname === '/api/auth/login/verify' && request.method === 'POST') return verifyLogin(request, env);
    if (url.pathname === '/api/auth/owner/start' && request.method === 'POST') return ownerStart(request, env);
    if (url.pathname === '/api/auth/owner/verify' && request.method === 'POST') return ownerVerify(request, env);
    if (url.pathname === '/api/auth/logout' && request.method === 'POST') return logout(request, env);
    if (url.pathname === '/api/account/profile' && request.method === 'GET') return accountProfile(request, env);
    if (url.pathname === '/api/account/profile' && request.method === 'PUT') return saveAccountProfile(request, env);
    if (url.pathname === '/api/account/media' && request.method === 'POST') return uploadProfileMedia(request, env);
    if (url.pathname.startsWith('/api/account/media/') && request.method === 'DELETE') return deleteProfileMedia(request, env, decodeURIComponent(url.pathname.slice('/api/account/media/'.length)));
    const asset = staticAsset(url.pathname);
    if (asset) return secure(asset);
    const profile = request.method === 'GET' ? routeSlug(url.pathname) : null;
    if (request.method === 'GET' && (['/', '/dashboard', '/features', '/privacy', '/terms'].includes(url.pathname) || profile)) return secure(staticAsset('/')!);
    return new Response('Not Found', { status: 404, headers: securityHeaders });
  }
};
