import { DAY_REDEMPTION_COST, FIRST_PUBLICATION_REWARD, REGISTRATION_REWARD, TREASURY_ACCOUNT, activeUserById, activeUserByPermanentId, awardFromTreasury, debitToTreasury, grantCategoryOf, idempotencyOf, permanentIdOf, pointAmountOf, redeemDays, transferPoints } from './midpoint';

interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RATE_LIMIT: KVNamespace;
  MAILER: Fetcher;
  SESSION_SIGNING_KEY: string;
  TURNSTILE_SECRET_KEY: string;
  PIN_PEPPER_SECRET: string;
}

type Locale = 'ar' | 'en';
type StaticAsset = { body: string; type: string; immutable: boolean };
type SearchRow = { slug: string; published_json: string | null; featured_until: number | null };
type PublicResult = { slug: string; name: string; title: string; summary: string; featured: boolean };
type UserRow = { id: string; permanent_id: string; name: string; role: 'user' | 'moderator' | 'adheed' | 'super_admin'; wallet_balance: number; email_verified_at: number | null; status: string; pin_hash: string | null; pin_salt: string | null; failed_login_attempts: number; locked_until: number | null };
type ChallengeRow = { id: string; user_id: string | null; code_hash: string; code_salt: string; expires_at: number; attempts: number; max_attempts: number };
type MediaCategory = 'avatar' | 'cover' | 'skill' | 'portfolio';
type ProfileRow = { id: string; user_id: string; tenant_id: string; slug: string; draft_json: string; published_json: string | null; is_published: number; storage_used_bytes: number; images_count: number; updated_at: number; created_at: number };
type MediaRow = { id: string; category: MediaCategory; r2_key: string; size_bytes: number; created_at: number };
type ContactRow = { email: string; phone: string | null; whatsapp: string | null; tenant_id: string };
type PublicationRow = { id: string; status: 'pending' | 'approved' | 'changes_requested' | 'rejected'; review_note: string | null; submitted_at: number; reviewed_at: number | null; submitted_payload_json: string; submission_locale: Locale };
type ReviewRequestRow = PublicationRow & { slug: string; owner_name: string; owner_email: string };
type NotificationRow = { id: string; kind: 'publication_approved' | 'publication_changes_requested' | 'publication_rejected'; title: string; message: string; created_at: number };
type WalletLedgerRow = { id: string; from_account: string; to_account: string; amount: number; tx_type: string; created_at: number };
type GrantRequestRow = { id: string; status: 'pending' | 'approved' | 'rejected'; request_reason: string; grant_category: 'seasonal' | 'exceptional' | 'activity' | null; awarded_amount: number | null; reviewer_reason: string | null; requested_at: number; user_name?: string; permanent_id?: string };
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
  'content-security-policy': "default-src 'self'; script-src 'self' https://challenges.cloudflare.com; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self' https://challenges.cloudflare.com; frame-src https://challenges.cloudflare.com; manifest-src 'self'; worker-src 'self'; media-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors https://vipdid.app"
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
async function deriveSecretHash(value: string, salt: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(value), 'PBKDF2', false, ['deriveBits']); const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: 100000 }, key, 256); return new Uint8Array(bits); }
async function sign(value: string, secret: string) { const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']); return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value)))); }
function pinHashVersion(value: string) { return value.startsWith('v2:') ? value.slice(3) : null; }
async function derivePinHash(pin: string, userId: string, pepper: string, salt: string) { return deriveSecretHash(`vipdid:pin:v2:${userId}:${pepper}:${pin}`, salt); }
async function createPinRecord(pin: string, userId: string, env: Env) { if (!env.PIN_PEPPER_SECRET) throw new Error('pin_pepper_unavailable'); const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const hash = await derivePinHash(pin, userId, env.PIN_PEPPER_SECRET, salt); return { salt, hash: `v2:${toBase64(hash)}` }; }
async function verifyUserPin(env: Env, user: UserRow, pin: string) {
  if (!user.pin_hash || !user.pin_salt) return false;
  const current = pinHashVersion(user.pin_hash);
  if (current) {
    if (!env.PIN_PEPPER_SECRET) return false;
    return equal(await derivePinHash(pin, user.id, env.PIN_PEPPER_SECRET, user.pin_salt), fromBase64(current));
  }
  const legacy = equal(await deriveSecretHash(pin, user.pin_salt), fromBase64(user.pin_hash));
  if (legacy && env.PIN_PEPPER_SECRET) {
    const next = await createPinRecord(pin, user.id, env);
    await env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, pin_set_at = ? WHERE id = ? AND pin_hash = ?').bind(next.hash, next.salt, Date.now(), user.id, user.pin_hash).run();
  }
  return legacy;
}
async function requireStepUpPin(env: Env, user: UserRow, value: unknown) { const pin = pinOf(value); return Boolean(pin && await verifyUserPin(env, user, pin)); }
async function pause(milliseconds: number) { await new Promise<void>((resolve) => setTimeout(resolve, milliseconds)); }
async function allocatePermanentId(env: Env) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const row = await env.DB.prepare("UPDATE system_settings SET value = CAST(value AS INTEGER) + 1, updated_at = ? WHERE key = 'next_permanent_id_seq' RETURNING value").bind(Date.now()).first<{ value: string | number }>();
      const sequence = Number(row?.value);
      if (!Number.isSafeInteger(sequence) || sequence < 2) throw new Error('sequence_unavailable');
      return `C${sequence}`;
    } catch (error) {
      if (attempt === 2) throw error;
      await pause(20 * (attempt + 1));
    }
  }
  throw new Error('sequence_unavailable');
}
function localeOf(value: unknown): Locale { return value === 'en' ? 'en' : 'ar'; }
function emailOf(value: unknown) { const email = typeof value === 'string' ? value.trim().toLowerCase() : ''; return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254 ? email : null; }
function phoneOf(value: unknown) { const phone = typeof value === 'string' ? value.trim() : ''; return !phone || (/^[0-9+()\s-]{5,28}$/.test(phone) ? phone : null); }
function pinOf(value: unknown) { return typeof value === 'string' && /^\d{6}$/.test(value) ? value : null; }
function cookie(request: Request, name: string) { return request.headers.get('cookie')?.match(new RegExp(`(?:^|;\\s*)${name}=([^;]+)`))?.[1] ?? null; }
function sessionCookie(value: string) { return `vipdid_session=${value}; Path=/; Max-Age=${SESSION_SECONDS}; HttpOnly; Secure; SameSite=None`; }
function deviceCookie(value: string) { return `vipdid_device=${value}; Path=/; Max-Age=${DEVICE_SECONDS}; HttpOnly; Secure; SameSite=None`; }
function clearCookie(name: string) { return `${name}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=None`; }
function withCookies(response: Response, values: string[]) { values.forEach((value) => response.headers.append('set-cookie', value)); return response; }
function sameOrigin(request: Request) { const origin = request.headers.get('origin'); if (origin) return origin === new URL(request.url).origin; return request.headers.get('sec-fetch-site') === 'same-origin'; }
function record(value: unknown): Record<string, unknown> { return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}; }
function textField(source: Record<string, unknown>, names: string[]) { for (const name of names) { const value = source[name]; if (typeof value === 'string' && value.trim()) return value.trim().slice(0, 220); } return ''; }
function publicResult(row: SearchRow): PublicResult { let profile: Record<string, unknown> = {}; try { profile = record(row.published_json ? JSON.parse(row.published_json) : {}); } catch { profile = {}; } return { slug: row.slug, name: textField(profile, ['name', 'displayName', 'name_ar', 'name_en']) || row.slug, title: textField(profile, ['title', 'headline', 'title_ar', 'title_en']), summary: textField(profile, ['summary', 'description', 'bio', 'summary_ar', 'summary_en']), featured: Boolean(row.featured_until && row.featured_until > Date.now()) }; }
function userView(user: UserRow) { return { id: user.id, permanentId: user.permanent_id, name: user.name, role: user.role, walletBalance: user.wallet_balance, verified: Boolean(user.email_verified_at) }; }

async function setting(env: Env, key: string) { return (await env.DB.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>())?.value ?? null; }
async function hasAccess(request: Request, env: Env) { const value = cookie(request, 'vipdid_access'); if (!value) return false; const [payload, signature] = value.split('.'); if (!payload || !signature || !equal(encoder.encode(await sign(payload, env.SESSION_SIGNING_KEY)), encoder.encode(signature))) return false; try { const decoded = JSON.parse(decoder.decode(fromBase64(payload))) as { expiresAt?: number }; return typeof decoded.expiresAt === 'number' && decoded.expiresAt > Date.now(); } catch { return false; } }
async function locked(request: Request, env: Env) { return (await setting(env, 'site_lock_enabled')) === '1' && !(await hasAccess(request, env)); }
async function limited(env: Env, request: Request, label: string, email: string, maximum: number, seconds: number) { const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const key = `auth:${label}:${toBase64Url(await digest(`${ip}:${email}`)).slice(0, 30)}`; const count = Number(await env.RATE_LIMIT.get(key) ?? '0'); if (count >= maximum) return true; await env.RATE_LIMIT.put(key, String(count + 1), { expirationTtl: seconds }); return false; }
async function clearLimit(env: Env, request: Request, label: string, email: string) { const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const key = `auth:${label}:${toBase64Url(await digest(`${ip}:${email}`)).slice(0, 30)}`; await env.RATE_LIMIT.delete(key); }
async function publicSearch(request: Request, env: Env) { const tenant = await tenantForRequest(request, env); if (!tenant) return responseJson({ results: [] }); const url = new URL(request.url); const query = (url.searchParams.get('q') ?? '').trim().slice(0, 80).toLowerCase(); const featured = url.searchParams.get('featured') === '1'; const conditions = ['tenant_id = ?', 'is_published = 1', 'allow_search_indexing = 1']; const values: (string | number)[] = [tenant.id]; if (featured) { conditions.push('(featured_until IS NOT NULL AND featured_until > ?)'); values.push(Date.now()); } if (query) { conditions.push('(lower(slug) LIKE ? OR lower(COALESCE(published_json, \'\')) LIKE ?)'); const phrase = `%${query.replace(/[\\%_]/g, '\\$&')}%`; values.push(phrase, phrase); } const sql = `SELECT slug, published_json, featured_until FROM profiles WHERE ${conditions.join(' AND ')} ORDER BY featured_until DESC, updated_at DESC LIMIT 20`; const response = await env.DB.prepare(sql).bind(...values).all<SearchRow>(); return responseJson({ results: (response.results ?? []).map(publicResult) }); }

const emailCopy = {
  ar: { subject: 'رمز التحقق من الهوية الرقمية لكبار الشخصيات', intro: 'رمز التحقق الخاص بك هو', expiry: 'ينتهي الرمز خلال عشر دقائق. لا تشاركه مع أي شخص.', text: 'رمز التحقق من الهوية الرقمية لكبار الشخصيات' },
  en: { subject: 'Your VIP Digital ID verification code', intro: 'Your verification code is', expiry: 'This code expires in ten minutes. Do not share it with anyone.', text: 'VIP Digital ID verification code' }
};
async function sendCode(env: Env, email: string, code: string, locale: Locale) { const copy = emailCopy[locale]; const text = `${copy.text}\n\n${copy.intro}: ${code}\n\n${copy.expiry}`; const html = `<div dir="${locale === 'ar' ? 'rtl' : 'ltr'}" lang="${locale}"><p>${copy.intro}</p><p style="font-size:28px;font-weight:700;letter-spacing:5px">${code}</p><p>${copy.expiry}</p></div>`; const response = await env.MAILER.fetch(new Request('https://mailer/v1/support/send', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `vipdid-code-${await hashed(`${email}:${code}`)}` }, body: JSON.stringify({ to: email, subject: copy.subject, text, html }) })); return response.ok; }
function hostnameForRequest(request: Request) { return new URL(request.url).hostname.toLowerCase().replace(/^www\./, ''); }
async function allowedTurnstileHostname(env: Env, hostname: string) {
  if (hostname === 'vipdid.app' || hostname.endsWith('.vipdid.app')) return true;
  const tenant = await env.DB.prepare("SELECT id FROM tenants WHERE custom_domain = ? AND status = 'active' LIMIT 1").bind(hostname).first<{ id: string }>();
  return Boolean(tenant);
}
async function verifyTurnstile(request: Request, env: Env, token: unknown) {
  if (typeof token !== 'string' || !token || !env.TURNSTILE_SECRET_KEY) return false;
  const form = new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token });
  const ip = request.headers.get('CF-Connecting-IP'); if (ip) form.set('remoteip', ip);
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: form });
  const result = await response.json().catch(() => ({ success: false })) as { success?: boolean; hostname?: string };
  const issued = typeof result.hostname === 'string' ? result.hostname.toLowerCase().replace(/^www\./, '') : '';
  const requested = hostnameForRequest(request);
  return response.ok && result.success === true && issued === requested && await allowedTurnstileHostname(env, requested);
}

async function createChallenge(env: Env, request: Request, email: string, userId: string | null, purpose: 'registration' | 'login' | 'owner_setup', locale: Locale) { const now = Date.now(); const code = randomCode(); const salt = toBase64(crypto.getRandomValues(new Uint8Array(16))); const codeHash = toBase64(await deriveSecretHash(code, salt)); const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const ipHash = toBase64(await digest(ip)); await env.DB.batch([
  env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE email = ? AND purpose = ? AND consumed_at IS NULL').bind(now, email, purpose),
  env.DB.prepare('INSERT INTO auth_challenges (id, user_id, email, purpose, code_hash, code_salt, locale, attempts, max_attempts, expires_at, consumed_at, requested_ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 6, ?, NULL, ?, ?)').bind(crypto.randomUUID(), userId, email, purpose, codeHash, salt, locale, now + CHALLENGE_MS, ipHash, now)
 ]); return code; }
async function consumeChallenge(env: Env, email: string, code: string, purpose: 'registration' | 'login' | 'owner_setup') { const now = Date.now(); const challenge = await env.DB.prepare('SELECT id, user_id, code_hash, code_salt, expires_at, attempts, max_attempts FROM auth_challenges WHERE email = ? AND purpose = ? AND consumed_at IS NULL ORDER BY created_at DESC LIMIT 1').bind(email, purpose).first<ChallengeRow>(); if (!challenge || challenge.expires_at <= now) return { ok: false as const, error: 'challenge_expired' }; if (challenge.attempts >= challenge.max_attempts) return { ok: false as const, error: 'challenge_limited' }; const actual = await deriveSecretHash(code, challenge.code_salt); if (!equal(actual, fromBase64(challenge.code_hash))) { await env.DB.prepare('UPDATE auth_challenges SET attempts = attempts + 1 WHERE id = ?').bind(challenge.id).run(); return { ok: false as const, error: 'invalid_code' }; } return { ok: true as const, challenge }; }
async function activeDevice(request: Request, env: Env, userId: string) { const token = cookie(request, 'vipdid_device'); if (!token) return null; const device = await env.DB.prepare('SELECT id FROM trusted_devices WHERE user_id = ? AND token_hash = ? AND expires_at > ? AND revoked_at IS NULL').bind(userId, await hashed(token), Date.now()).first<{ id: string }>(); if (device) await env.DB.prepare('UPDATE trusted_devices SET last_used_at = ? WHERE id = ?').bind(Date.now(), device.id).run(); return device; }
async function issueSession(env: Env, user: UserRow, trustDevice: boolean) { const now = Date.now(); const sessionToken = randomToken(); const sessionId = crypto.randomUUID(); const cookies = [sessionCookie(sessionToken)]; let deviceId: string | null = null; if (trustDevice) { const deviceToken = randomToken(); deviceId = crypto.randomUUID(); await env.DB.prepare('INSERT INTO trusted_devices (id, user_id, token_hash, last_used_at, expires_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, ?)').bind(deviceId, user.id, await hashed(deviceToken), now, now + DEVICE_SECONDS * 1000, now).run(); cookies.push(deviceCookie(deviceToken)); }
 await env.DB.prepare('INSERT INTO auth_sessions (id, user_id, token_hash, trusted_device_id, expires_at, last_seen_at, revoked_at, created_at) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)').bind(sessionId, user.id, await hashed(sessionToken), deviceId, now + SESSION_SECONDS * 1000, now, now).run(); await env.DB.prepare('UPDATE users SET last_login_at = ?, failed_login_attempts = 0, locked_until = NULL WHERE id = ?').bind(now, user.id).run(); return { user: userView(user), cookies }; }
async function authUser(request: Request, env: Env) { const token = cookie(request, 'vipdid_session'); if (!token) return null; const user = await env.DB.prepare(`SELECT u.id, u.permanent_id, u.name, u.role, u.wallet_balance, u.email_verified_at, u.status, u.pin_hash, u.pin_salt, u.failed_login_attempts, u.locked_until FROM auth_sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ? AND s.expires_at > ? AND s.revoked_at IS NULL AND u.status = 'active'`).bind(await hashed(token), Date.now()).first<UserRow>(); if (user) await env.DB.prepare('UPDATE auth_sessions SET last_seen_at = ? WHERE token_hash = ?').bind(Date.now(), await hashed(token)).run(); return user; }

async function register(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const input = record(await request.json().catch(() => ({}))); const locale = localeOf(input.locale); const email = emailOf(input.email); const name = typeof input.name === 'string' ? input.name.trim().slice(0, 120) : ''; const phone = phoneOf(input.phone); const whatsapp = phoneOf(input.whatsapp);
  const rawReferral = typeof input.referralPermanentId === 'string' ? input.referralPermanentId.trim() : ''; const referral = rawReferral ? permanentIdOf(rawReferral) : null;
  if (!email || !name || phone === null || whatsapp === null || (rawReferral && !referral) || input.termsAccepted !== true || input.privacyAccepted !== true || input.eligibilityAccepted !== true) return responseJson({ ok: false, error: rawReferral && !referral ? 'invalid_referral' : 'invalid_input' }, 400);
  const tenant = await tenantForRequest(request, env); if (!tenant) return responseJson({ ok: false, error: 'tenant_unavailable' }, 404);
  if (await limited(env, request, 'register', email, 4, 900)) return responseJson({ ok: false, error: 'limited' }, 429);
  if (!(await verifyTurnstile(request, env, input.turnstileToken))) return responseJson({ ok: false, error: 'human_failed' }, 400);
  if (referral) { const referrer = await env.DB.prepare("SELECT id, email FROM users WHERE permanent_id = ? AND status = 'active'").bind(referral).first<{ id: string; email: string }>(); if (!referrer || referrer.email.toLowerCase() === email) return responseJson({ ok: false, error: 'invalid_referral' }, 400); }
  const now = Date.now(); let user = await env.DB.prepare('SELECT id, status, referred_by_permanent_id FROM users WHERE email = ?').bind(email).first<{ id: string; status: string; referred_by_permanent_id: string | null }>();
  if (user?.status === 'active') return responseJson({ ok: false, error: 'email_in_use' }, 409);
  if (!user) {
    const id = `user_${crypto.randomUUID()}`;
    await env.DB.prepare('INSERT INTO users (id, permanent_id, tenant_id, name, email, phone, whatsapp, pin_hash, pin_salt, role, is_managed, referred_by_permanent_id, wallet_balance, status, failed_login_attempts, terms_accepted_at, privacy_accepted_at, eligibility_acknowledged_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, NULL, NULL, ?, 0, ?, 0, ?, 0, ?, ?, ?, ?)').bind(id, `pending_${crypto.randomUUID()}`, tenant.id, name, email, phone, whatsapp, 'user', referral, 'pending_verification', now, now, now, now).run();
    user = { id, status: 'pending_verification', referred_by_permanent_id: referral };
  } else {
    if (referral && user.referred_by_permanent_id && user.referred_by_permanent_id !== referral) return responseJson({ ok: false, error: 'referral_locked' }, 409);
    await env.DB.prepare('UPDATE users SET name = ?, phone = ?, whatsapp = ?, referred_by_permanent_id = COALESCE(referred_by_permanent_id, ?), terms_accepted_at = ?, privacy_accepted_at = ?, eligibility_acknowledged_at = ? WHERE id = ?').bind(name, phone, whatsapp, referral, now, now, now, user.id).run();
  }
  const code = await createChallenge(env, request, email, user.id, 'registration', locale); if (!(await sendCode(env, email, code, locale))) return responseJson({ ok: false, error: 'delivery_failed' }, 503);
  await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), tenant.id, user.id, 'registration_code_sent', 'user', user.id, JSON.stringify({ locale, referral }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now).run();
  return responseJson({ ok: true, state: 'verification_required' }, 202);
}

async function verifyRegistration(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const code = pinOf(input.code); const pin = pinOf(input.pin);
  if (!email || !code || !pin) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  const checked = await consumeChallenge(env, email, code, 'registration'); if (!checked.ok) return responseJson({ ok: false, error: checked.error }, 401);
  const user = await env.DB.prepare("SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until, referred_by_permanent_id FROM users WHERE id = ? AND email = ? AND status = 'pending_verification'").bind(checked.challenge.user_id, email).first<UserRow & { referred_by_permanent_id: string | null }>();
  if (!user) return responseJson({ ok: false, error: 'invalid_request' }, 400);
  let permanentId: string; let pinRecord: { salt: string; hash: string };
  try { permanentId = await allocatePermanentId(env); pinRecord = await createPinRecord(pin, user.id, env); } catch { return responseJson({ ok: false, error: 'verification_unavailable' }, 503); }
  const now = Date.now();
  try {
    await env.DB.batch([
      env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ? AND consumed_at IS NULL').bind(now, checked.challenge.id),
      env.DB.prepare("UPDATE users SET permanent_id = ?, pin_hash = ?, pin_salt = ?, pin_set_at = ?, email_verified_at = ?, status = ? WHERE id = ? AND status = 'pending_verification'").bind(permanentId, pinRecord.hash, pinRecord.salt, now, now, 'active', user.id),
      env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'tenant_main', user.id, 'registration_verified', 'user', user.id, JSON.stringify({ permanentId }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
    ]);
  } catch { return responseJson({ ok: false, error: 'verification_failed' }, 409); }
  const registration = await awardFromTreasury(env, user.id, REGISTRATION_REWARD, 'registration_verification_bonus', `registration-bonus:${user.id}`, user.id, { permanentId });
  if (!registration.ok) return responseJson({ ok: false, error: registration.error }, 503);
  if (user.referred_by_permanent_id) {
    const referrer = await activeUserByPermanentId(env, user.referred_by_permanent_id);
    if (referrer && referrer.id !== user.id) await awardFromTreasury(env, referrer.id, REGISTRATION_REWARD, 'referral_registration_bonus', `referral-registration:${user.id}`, user.id, { referredUserId: user.id });
  }
  const active = { ...user, permanent_id: permanentId, wallet_balance: user.wallet_balance + REGISTRATION_REWARD, email_verified_at: now, status: 'active', pin_hash: pinRecord.hash, pin_salt: pinRecord.salt };
  const issued = await issueSession(env, active, input.trustDevice !== false); return withCookies(responseJson({ ok: true, user: issued.user }), issued.cookies);
}

async function loginStart(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const pin = pinOf(input.pin); const locale = localeOf(input.locale); if (!email || !pin) return responseJson({ ok: false, error: 'invalid_login' }, 400); if (await limited(env, request, 'login', email, 8, 900)) return responseJson({ ok: false, error: 'limited' }, 429); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE email = ?`).bind(email).first<UserRow>(); const now = Date.now(); if (!user || user.status !== 'active') return responseJson({ ok: false, error: 'invalid_login' }, 401); if (user.locked_until && user.locked_until > now) return responseJson({ ok: false, error: 'account_locked' }, 429); if (!user.pin_hash || !user.pin_salt || !(await verifyUserPin(env, user, pin))) { const attempts = user ? user.failed_login_attempts + 1 : 1; const lockedUntil = attempts >= 5 ? now + 15 * 60 * 1000 : null; if (user) await env.DB.prepare('UPDATE users SET failed_login_attempts = ?, locked_until = ? WHERE id = ?').bind(attempts, lockedUntil, user.id).run(); return responseJson({ ok: false, error: lockedUntil ? 'account_locked' : 'invalid_login' }, 401); }
 await clearLimit(env, request, 'login', email); const device = await activeDevice(request, env, user.id); if (device) { const issued = await issueSession(env, user, false); return withCookies(responseJson({ ok: true, state: 'authenticated', user: issued.user }), issued.cookies); }
 const code = await createChallenge(env, request, email, user.id, 'login', locale); if (!(await sendCode(env, email, code, locale))) return responseJson({ ok: false, error: 'delivery_failed' }, 503); return responseJson({ ok: true, state: 'verification_required' }, 202); }

async function verifyLogin(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const code = pinOf(input.code); if (!email || !code) return responseJson({ ok: false, error: 'invalid_input' }, 400); const checked = await consumeChallenge(env, email, code, 'login'); if (!checked.ok) return responseJson({ ok: false, error: checked.error }, 401); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE id = ? AND email = ? AND status = 'active'`).bind(checked.challenge.user_id, email).first<UserRow>(); if (!user) return responseJson({ ok: false, error: 'invalid_login' }, 401); await env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ?').bind(Date.now(), checked.challenge.id).run(); const issued = await issueSession(env, user, input.trustDevice !== false); return withCookies(responseJson({ ok: true, state: 'authenticated', user: issued.user }), issued.cookies); }

async function ownerStart(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const locale = localeOf(input.locale); if (!email || email !== OWNER_EMAIL || !(await verifyTurnstile(request, env, input.turnstileToken))) return responseJson({ ok: false, error: 'invalid_login' }, 401); if (await limited(env, request, 'owner', email, 3, 900)) return responseJson({ ok: false, error: 'limited' }, 429); const user = await env.DB.prepare(`SELECT id FROM users WHERE email = ? AND role = 'super_admin'`).bind(email).first<{ id: string }>(); if (!user) return responseJson({ ok: false, error: 'invalid_login' }, 401); const code = await createChallenge(env, request, email, user.id, 'owner_setup', locale); if (!(await sendCode(env, email, code, locale))) return responseJson({ ok: false, error: 'delivery_failed' }, 503); return responseJson({ ok: true, state: 'verification_required' }, 202); }

async function ownerVerify(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const input = record(await request.json().catch(() => ({}))); const email = emailOf(input.email); const code = pinOf(input.code); const pin = pinOf(input.pin); if (!email || email !== OWNER_EMAIL || !code || !pin) return responseJson({ ok: false, error: 'invalid_input' }, 400); const checked = await consumeChallenge(env, email, code, 'owner_setup'); if (!checked.ok) return responseJson({ ok: false, error: checked.error }, 401); const user = await env.DB.prepare(`SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE id = ? AND email = ? AND role = 'super_admin'`).bind(checked.challenge.user_id, email).first<UserRow>(); if (!user) return responseJson({ ok: false, error: 'invalid_login' }, 401); let pinRecord: { salt: string; hash: string }; try { pinRecord = await createPinRecord(pin, user.id, env); } catch { return responseJson({ ok: false, error: 'verification_unavailable' }, 503); } const now = Date.now(); await env.DB.batch([env.DB.prepare('UPDATE auth_challenges SET consumed_at = ? WHERE id = ?').bind(now, checked.challenge.id), env.DB.prepare('UPDATE users SET pin_hash = ?, pin_salt = ?, pin_set_at = ?, email_verified_at = ?, status = ? WHERE id = ?').bind(pinRecord.hash, pinRecord.salt, now, now, 'active', user.id)]); const issued = await issueSession(env, { ...user, pin_hash: pinRecord.hash, pin_salt: pinRecord.salt, email_verified_at: now, status: 'active' }, input.trustDevice !== false); return withCookies(responseJson({ ok: true, state: 'authenticated', user: issued.user }), issued.cookies); }

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
type ProfileSnapshot = { data: ReturnType<typeof profileDraft>; mediaIds: string[]; hasMediaSelection: boolean };
function mediaIdsOf(value: unknown) { return Array.isArray(value) ? Array.from(new Set(value.filter((item): item is string => typeof item === 'string' && /^media_[a-z0-9-]{36}$/.test(item)))) : []; }
function snapshotOf(value: string | null | undefined, fallbackName: string): ProfileSnapshot { try { const input = record(value ? JSON.parse(value) : {}); return { data: profileDraft(input, fallbackName), mediaIds: mediaIdsOf(input.mediaIds), hasMediaSelection: Array.isArray(input.mediaIds) }; } catch { return { data: profileDraft({}, fallbackName), mediaIds: [], hasMediaSelection: false }; } }
function readDraft(value: string | null | undefined, fallbackName: string) { return snapshotOf(value, fallbackName).data; }
function snapshotJson(data: ReturnType<typeof profileDraft>, mediaIds: string[]) { return JSON.stringify({ ...data, mediaIds: Array.from(new Set(mediaIds)) }); }
function mediaView(row: MediaRow) { return { id: row.id, category: row.category, sizeBytes: row.size_bytes, url: `/api/media/${encodeURIComponent(row.id)}` }; }
function isCategory(value: unknown): value is MediaCategory { return value === 'avatar' || value === 'cover' || value === 'skill' || value === 'portfolio'; }
async function allProfileMedia(env: Env, profileId: string) { return (await env.DB.prepare('SELECT id, category, r2_key, size_bytes, created_at FROM media_assets WHERE profile_id = ? ORDER BY created_at ASC').bind(profileId).all<MediaRow>()).results ?? []; }
async function selectedMediaIds(env: Env, profile: ProfileRow, fallbackName: string) { const snapshot = snapshotOf(profile.draft_json, fallbackName); if (snapshot.hasMediaSelection) return snapshot.mediaIds; return (await allProfileMedia(env, profile.id)).map((item) => item.id); }
async function protectedMediaIds(env: Env, profile: ProfileRow, fallbackName: string) { const ids = new Set<string>(profile.published_json ? snapshotOf(profile.published_json, fallbackName).mediaIds : []); const pending = (await env.DB.prepare("SELECT submitted_payload_json FROM publish_requests WHERE profile_id = ? AND status = 'pending'").bind(profile.id).all<{ submitted_payload_json: string }>()).results ?? []; for (const request of pending) for (const id of snapshotOf(request.submitted_payload_json, fallbackName).mediaIds) ids.add(id); return ids; }
async function cleanUnusedMedia(env: Env, profile: ProfileRow, fallbackName: string) { const keep = new Set(await selectedMediaIds(env, profile, fallbackName)); for (const id of await protectedMediaIds(env, profile, fallbackName)) keep.add(id); const all = await allProfileMedia(env, profile.id); const unused = all.filter((item) => !keep.has(item.id)); if (!unused.length) return; await env.DB.batch([ ...unused.map((item) => env.DB.prepare('DELETE FROM media_assets WHERE id = ? AND profile_id = ?').bind(item.id, profile.id)), env.DB.prepare('UPDATE profiles SET storage_used_bytes = ?, images_count = ?, updated_at = ? WHERE id = ?').bind(all.filter((item) => keep.has(item.id)).reduce((sum, item) => sum + item.size_bytes, 0), all.length - unused.length, Date.now(), profile.id) ]); await Promise.all(unused.map((item) => env.MEDIA.delete(item.r2_key).catch(() => undefined))); }
function isWebP(bytes: Uint8Array) { return bytes.byteLength >= 12 && decoder.decode(bytes.slice(0, 4)) === 'RIFF' && decoder.decode(bytes.slice(8, 12)) === 'WEBP'; }

async function accountProfileData(env: Env, user: UserRow) {
  const [profile, contact] = await Promise.all([
    env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, published_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>(),
    env.DB.prepare('SELECT email, phone, whatsapp, tenant_id FROM users WHERE id = ?').bind(user.id).first<ContactRow>()
  ]);
  const allMedia = profile ? await allProfileMedia(env, profile.id) : [];
  const snapshot = profile ? snapshotOf(profile.draft_json, user.name) : { data: profileDraft({}, user.name), mediaIds: [], hasMediaSelection: true };
  const selected = snapshot.hasMediaSelection ? allMedia.filter((item) => snapshot.mediaIds.includes(item.id)) : allMedia;
  const latest = profile ? await env.DB.prepare('SELECT id, status, review_note, submitted_at, reviewed_at, submitted_payload_json, submission_locale FROM publish_requests WHERE profile_id = ? ORDER BY submitted_at DESC LIMIT 1').bind(profile.id).first<PublicationRow>() : null;
  const storage = allMedia.reduce((total, item) => total + item.size_bytes, 0);
  return { slug: profile?.slug ?? '', data: snapshot.data, media: selected.map(mediaView), imageCount: selected.length, storageUsedBytes: storage, exists: Boolean(profile), contact: { email: contact?.email ?? '', phone: contact?.phone ?? '', whatsapp: contact?.whatsapp ?? '' }, publication: { isPublished: Boolean(profile?.is_published), latestStatus: latest?.status ?? null, latestRequestId: latest?.id ?? null, submittedAt: latest?.submitted_at ?? null, reviewNote: latest?.review_note ?? null } };
}

async function accountProfile(request: Request, env: Env) { const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401); return responseJson({ ok: true, profile: await accountProfileData(env, user) }); }

async function saveAccountProfile(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const input = record(await request.json().catch(() => ({}))); const slug = slugOf(input.slug);
  if (!slug) return responseJson({ ok: false, error: 'invalid_slug' }, 400);
  const existing = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, published_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>();
  const clash = await env.DB.prepare('SELECT id FROM profiles WHERE slug = ? AND user_id != ? AND tenant_id = (SELECT tenant_id FROM users WHERE id = ?)').bind(slug, user.id, user.id).first<{ id: string }>();
  if (clash) return responseJson({ ok: false, error: RESERVED_SLUGS.has(slug) ? 'reserved_slug' : 'slug_taken' }, 409);
  const mediaIds = existing ? await selectedMediaIds(env, existing, user.name) : [];
  const data = snapshotJson(profileDraft(input.data, user.name), mediaIds); const now = Date.now(); let profileId = existing?.id;
  try {
    if (existing) await env.DB.prepare('UPDATE profiles SET slug = ?, draft_json = ?, updated_at = ? WHERE id = ? AND user_id = ?').bind(slug, data, now, existing.id, user.id).run();
    else {
      const owner = await env.DB.prepare('SELECT tenant_id FROM users WHERE id = ?').bind(user.id).first<{ tenant_id: string }>();
      if (!owner) return responseJson({ ok: false, error: 'unauthorized' }, 401);
      profileId = `profile_${crypto.randomUUID()}`;
      await env.DB.prepare('INSERT INTO profiles (id, user_id, tenant_id, slug, is_published, published_version_id, draft_json, published_json, allow_search_indexing, active_days_balance, featured_until, storage_used_bytes, images_count, updated_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?, NULL, 1, 0, NULL, 0, 0, ?, ?)').bind(profileId, user.id, owner.tenant_id, slug, data, now, now).run();
    }
  } catch { return responseJson({ ok: false, error: 'slug_taken' }, 409); }
  await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), existing?.tenant_id ?? 'tenant_main', user.id, 'profile_draft_saved', 'profile', profileId ?? user.id, JSON.stringify({ slug }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now).run();
  return responseJson({ ok: true, profile: await accountProfileData(env, user) });
}

async function uploadProfileMedia(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const form = await request.formData().catch(() => null); const category = form?.get('category'); const file = form?.get('file');
  if (!isCategory(category) || !(file instanceof File) || file.type !== 'image/webp') return responseJson({ ok: false, error: 'invalid_image' }, 400);
  const profile = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, published_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>();
  if (!profile) return responseJson({ ok: false, error: 'profile_required' }, 400);
  const pending = await env.DB.prepare("SELECT id FROM publish_requests WHERE profile_id = ? AND status = 'pending' LIMIT 1").bind(profile.id).first<{ id: string }>();
  if (pending) return responseJson({ ok: false, error: 'media_under_review' }, 409);
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (!isWebP(bytes) || bytes.byteLength < 64 || bytes.byteLength > 2 * 1024 * 1024) return responseJson({ ok: false, error: 'invalid_image' }, 400);
  const allRows = await allProfileMedia(env, profile.id); const selectedIds = await selectedMediaIds(env, profile, user.name);
  const categoryRows = allRows.filter((item) => selectedIds.includes(item.id) && item.category === category);
  const replacements = category === 'avatar' || category === 'cover' ? categoryRows : [];
  if (!replacements.length && categoryRows.length >= IMAGE_MAXIMUMS[category]) return responseJson({ ok: false, error: 'image_limit' }, 400);
  const protectedIds = await protectedMediaIds(env, profile, user.name); const deleteNow = replacements.filter((item) => !protectedIds.has(item.id));
  const storageAfter = allRows.reduce((total, item) => total + item.size_bytes, 0) - deleteNow.reduce((total, item) => total + item.size_bytes, 0) + bytes.byteLength;
  if (storageAfter > IMAGE_STORAGE_LIMIT) return responseJson({ ok: false, error: 'storage_limit' }, 400);
  const id = `media_${crypto.randomUUID()}`; const key = `profiles/${user.id}/${category}/${crypto.randomUUID()}.webp`; const now = Date.now();
  const newSelection = [...selectedIds.filter((item) => !replacements.some((replacement) => replacement.id === item)), id];
  const nextDraft = snapshotJson(snapshotOf(profile.draft_json, user.name).data, newSelection);
  try {
    await env.MEDIA.put(key, bytes, { httpMetadata: { contentType: 'image/webp', cacheControl: 'public, max-age=31536000, immutable' }, customMetadata: { userId: user.id, profileId: profile.id, category } });
    await env.DB.batch([
      ...deleteNow.map((item) => env.DB.prepare('DELETE FROM media_assets WHERE id = ? AND profile_id = ?').bind(item.id, profile.id)),
      env.DB.prepare('INSERT INTO media_assets (id, user_id, profile_id, category, r2_key, size_bytes, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').bind(id, user.id, profile.id, category, key, bytes.byteLength, now),
      env.DB.prepare('UPDATE profiles SET draft_json = ?, storage_used_bytes = ?, images_count = ?, updated_at = ? WHERE id = ?').bind(nextDraft, storageAfter, allRows.length - deleteNow.length + 1, now, profile.id),
      env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), profile.tenant_id, user.id, 'profile_media_uploaded', 'media', id, JSON.stringify({ category, size: bytes.byteLength }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
    ]);
  } catch { await env.MEDIA.delete(key).catch(() => undefined); return responseJson({ ok: false, error: 'invalid_image' }, 400); }
  await Promise.all(deleteNow.map((item) => env.MEDIA.delete(item.r2_key).catch(() => undefined)));
  return responseJson({ ok: true, profile: await accountProfileData(env, user) });
}

async function deleteProfileMedia(request: Request, env: Env, id: string) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const profile = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, published_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>();
  if (!profile) return responseJson({ ok: false, error: 'not_found' }, 404);
  const media = await env.DB.prepare('SELECT id, category, r2_key, size_bytes, created_at FROM media_assets WHERE id = ? AND profile_id = ? AND user_id = ?').bind(id, profile.id, user.id).first<MediaRow>();
  if (!media) return responseJson({ ok: false, error: 'not_found' }, 404);
  const selectedIds = await selectedMediaIds(env, profile, user.name); if (!selectedIds.includes(media.id)) return responseJson({ ok: false, error: 'not_found' }, 404);
  const now = Date.now(); const nextDraft = snapshotJson(snapshotOf(profile.draft_json, user.name).data, selectedIds.filter((item) => item !== media.id)); const protectedIds = await protectedMediaIds(env, profile, user.name); const retain = protectedIds.has(media.id);
  await env.DB.batch([
    ...(retain ? [] : [env.DB.prepare('DELETE FROM media_assets WHERE id = ? AND profile_id = ?').bind(media.id, profile.id)]),
    env.DB.prepare('UPDATE profiles SET draft_json = ?, storage_used_bytes = ?, images_count = ?, updated_at = ? WHERE id = ?').bind(nextDraft, retain ? profile.storage_used_bytes : Math.max(0, profile.storage_used_bytes - media.size_bytes), retain ? profile.images_count : Math.max(0, profile.images_count - 1), now, profile.id),
    env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), profile.tenant_id, user.id, 'profile_media_removed_from_draft', 'media', media.id, JSON.stringify({ category: media.category, retainedForPublishedVersion: retain }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
  ]);
  if (!retain) await env.MEDIA.delete(media.r2_key).catch(() => undefined);
  return responseJson({ ok: true, profile: await accountProfileData(env, user) });
}

async function mediaAsset(request: Request, env: Env, id: string) {
  const media = await env.DB.prepare('SELECT m.r2_key, m.user_id, p.is_published, p.published_json, u.name FROM media_assets m JOIN profiles p ON p.id = m.profile_id JOIN users u ON u.id = m.user_id WHERE m.id = ?').bind(id).first<{ r2_key: string; user_id: string; is_published: number; published_json: string | null; name: string }>();
  if (!media) return new Response('Not Found', { status: 404, headers: securityHeaders });
  const published = media.is_published === 1 && snapshotOf(media.published_json, media.name).mediaIds.includes(id);
  if (!published) {
    const viewer = await authUser(request, env);
    if (!viewer || (viewer.id !== media.user_id && viewer.role !== 'super_admin')) return new Response('Forbidden', { status: 403, headers: { ...securityHeaders, 'cache-control': 'private, no-cache, no-store', vary: 'Cookie' } });
  }
  const object = await env.MEDIA.get(media.r2_key);
  if (!object) return new Response('Not Found', { status: 404, headers: securityHeaders });
  return secure(new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'image/webp', 'content-length': String(object.size), 'cache-control': published ? 'public, max-age=31536000, immutable' : 'private, no-cache, no-store', ...(published ? {} : { vary: 'Cookie' }) } }));
}

async function publicProfile(request: Request, env: Env, slug: string) {
  const tenant = await tenantForRequest(request, env); if (!tenant) return responseJson({ ok: false, error: 'not_found' }, 404);
  const profile = await env.DB.prepare("SELECT p.id, p.user_id, p.tenant_id, p.slug, p.draft_json, p.published_json, p.is_published, p.storage_used_bytes, p.images_count, p.updated_at, p.created_at, u.name, u.email, u.phone, u.whatsapp FROM profiles p JOIN users u ON u.id = p.user_id WHERE p.slug = ? AND p.tenant_id = ? AND p.is_published = 1 AND p.published_json IS NOT NULL AND u.status = 'active'").bind(slug, tenant.id).first<ProfileRow & { name: string; email: string; phone: string | null; whatsapp: string | null }>();
  if (!profile) return responseJson({ ok: false, error: 'not_found' }, 404);
  const snapshot = snapshotOf(profile.published_json, profile.name); const all = await allProfileMedia(env, profile.id); const media = snapshot.hasMediaSelection ? all.filter((item) => snapshot.mediaIds.includes(item.id)) : all;
  return responseJson({ ok: true, profile: { slug: profile.slug, data: snapshot.data, media: media.map(mediaView), contact: { email: snapshot.data.showEmail ? profile.email : '', phone: snapshot.data.showPhone ? profile.phone ?? '' : '', whatsapp: snapshot.data.showWhatsapp ? profile.whatsapp ?? '' : '' } } });
}

const publicationMail = {
  ar: {
    approved: { subject: 'تم اعتماد موقعك في الهوية الرقمية لكبار الشخصيات', title: 'تم اعتماد موقعك', text: 'اعتمد المشرف البشري النسخة التي أرسلتها، وأصبحت متاحة للزوار.' },
    changes_requested: { subject: 'طُلب تعديل موقعك في الهوية الرقمية لكبار الشخصيات', title: 'طُلب تعديل موقعك', text: 'راجع ملاحظة المشرف وعدّل المسودة ثم أرسلها للمراجعة من جديد.' },
    rejected: { subject: 'لم يُعتمد طلب موقعك في الهوية الرقمية لكبار الشخصيات', title: 'لم يُعتمد طلب موقعك', text: 'راجع ملاحظة المشرف قبل إرسال طلب جديد.' }
  },
  en: {
    approved: { subject: 'Your VIP Digital ID site was approved', title: 'Your site was approved', text: 'A human reviewer approved the version you submitted, and it is now available to visitors.' },
    changes_requested: { subject: 'Changes were requested for your VIP Digital ID site', title: 'Changes were requested', text: 'Review the reviewer note, update your draft, and submit it again.' },
    rejected: { subject: 'Your VIP Digital ID site request was not approved', title: 'Your request was not approved', text: 'Review the reviewer note before submitting a new request.' }
  }
};
function htmlSafe(value: string) { return value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character); }
async function sendPublicationDecision(env: Env, email: string, locale: Locale, decision: 'approved' | 'changes_requested' | 'rejected', note: string, requestId: string) {
  const copy = publicationMail[locale][decision]; const reason = note ? `\n\n${locale === 'ar' ? 'ملاحظة المشرف:' : 'Reviewer note:'}\n${note}` : ''; const direction = locale === 'ar' ? 'rtl' : 'ltr';
  const response = await env.MAILER.fetch(new Request('https://mailer/v1/support/send', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `vipdid-publication-${requestId}-${decision}` }, body: JSON.stringify({ to: email, subject: copy.subject, text: `${copy.title}\n\n${copy.text}${reason}`, html: `<div dir="${direction}" lang="${locale}"><h1>${htmlSafe(copy.title)}</h1><p>${htmlSafe(copy.text)}</p>${note ? `<p><strong>${locale === 'ar' ? 'ملاحظة المشرف:' : 'Reviewer note:'}</strong><br>${htmlSafe(note)}</p>` : ''}</div>` }) }));
  return response.ok;
}

async function submitPublication(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const input = record(await request.json().catch(() => ({}))); const locale = localeOf(input.locale);
  const profile = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, published_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE user_id = ?').bind(user.id).first<ProfileRow>();
  if (!profile) return responseJson({ ok: false, error: 'profile_required' }, 400);
  const pending = await env.DB.prepare("SELECT id FROM publish_requests WHERE profile_id = ? AND status = 'pending' LIMIT 1").bind(profile.id).first<{ id: string }>();
  if (pending) return responseJson({ ok: false, error: 'request_pending' }, 409);
  const mediaIds = await selectedMediaIds(env, profile, user.name); const snapshot = snapshotJson(snapshotOf(profile.draft_json, user.name).data, mediaIds); const id = `publish_${crypto.randomUUID()}`; const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO publish_requests (id, profile_id, user_id, tenant_id, submitted_payload_json, status, reviewer_id, review_note, submission_locale, submitted_at, reviewed_at) VALUES (?, ?, ?, ?, ?, ?, NULL, NULL, ?, ?, NULL)').bind(id, profile.id, user.id, profile.tenant_id, snapshot, 'pending', locale, now),
    env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), profile.tenant_id, user.id, profile.is_published ? 'publication_update_submitted' : 'publication_initial_submitted', 'publish_request', id, JSON.stringify({ slug: profile.slug, mediaCount: mediaIds.length }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
  ]);
  return responseJson({ ok: true, profile: await accountProfileData(env, user) }, 202);
}

async function accountNotifications(request: Request, env: Env) { const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401); const entries = (await env.DB.prepare('SELECT id, kind, title, message, created_at FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 12').bind(user.id).all<NotificationRow>()).results ?? []; return responseJson({ ok: true, notifications: entries.map((item) => ({ id: item.id, kind: item.kind, title: item.title, message: item.message, createdAt: item.created_at })) }); }

async function adminPublishRequests(request: Request, env: Env) {
  const reviewer = await authUser(request, env); if (!reviewer) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (reviewer.role !== 'super_admin') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const entries = (await env.DB.prepare("SELECT r.id, r.status, r.review_note, r.submitted_at, r.reviewed_at, r.submitted_payload_json, r.submission_locale, p.slug, u.name AS owner_name, u.email AS owner_email FROM publish_requests r JOIN profiles p ON p.id = r.profile_id JOIN users u ON u.id = r.user_id WHERE r.status = 'pending' ORDER BY r.submitted_at ASC LIMIT 50").all<ReviewRequestRow>()).results ?? [];
  return responseJson({ ok: true, requests: entries.map((item) => ({ id: item.id, status: item.status, reviewNote: item.review_note, submittedAt: item.submitted_at, slug: item.slug, ownerName: item.owner_name, ownerEmail: item.owner_email, submissionLocale: item.submission_locale, snapshot: (() => { const snapshot = snapshotOf(item.submitted_payload_json, item.owner_name); return { data: snapshot.data, mediaIds: snapshot.mediaIds }; })() })) });
}

async function decidePublication(request: Request, env: Env, requestId: string) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const reviewer = await authUser(request, env); if (!reviewer) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (reviewer.role !== 'super_admin' && reviewer.role !== 'moderator' && reviewer.role !== 'adheed') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const input = record(await request.json().catch(() => ({}))); const decision = input.decision; const note = textOf(input.note, 800);
  if (decision !== 'approved' && decision !== 'changes_requested' && decision !== 'rejected') return responseJson({ ok: false, error: 'invalid_request' }, 400);
  if (decision !== 'approved' && !note) return responseJson({ ok: false, error: 'reason_required' }, 400);
  const recordRequest = await env.DB.prepare("SELECT r.id, r.profile_id, r.user_id, r.tenant_id, r.status, r.review_note, r.submitted_at, r.reviewed_at, r.submitted_payload_json, r.submission_locale, p.slug, u.name AS owner_name, u.email AS owner_email FROM publish_requests r JOIN profiles p ON p.id = r.profile_id JOIN users u ON u.id = r.user_id WHERE r.id = ?").bind(requestId).first<ReviewRequestRow & { profile_id: string; user_id: string; tenant_id: string }>();
  if (!recordRequest) return responseJson({ ok: false, error: 'not_found' }, 404); if (!(await canManageTenant(env, reviewer, recordRequest.tenant_id))) return responseJson({ ok: false, error: 'forbidden' }, 403); if (recordRequest.status !== 'pending') return responseJson({ ok: false, error: 'decision_recorded' }, 409);
  const now = Date.now(); const changed = await env.DB.prepare("UPDATE publish_requests SET status = ?, reviewer_id = ?, review_note = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(decision, reviewer.id, note || null, now, requestId).run();
  if (!changed.meta.changes) return responseJson({ ok: false, error: 'decision_recorded' }, 409);
  if (decision === 'approved') {
    const profileBefore = await env.DB.prepare('SELECT is_published FROM profiles WHERE id = ?').bind(recordRequest.profile_id).first<{ is_published: number }>();
    await env.DB.prepare('UPDATE profiles SET published_json = ?, published_version_id = ?, is_published = 1, updated_at = ? WHERE id = ?').bind(recordRequest.submitted_payload_json, recordRequest.id, now, recordRequest.profile_id).run();
    if (!profileBefore?.is_published) {
      await awardFromTreasury(env, recordRequest.user_id, FIRST_PUBLICATION_REWARD, 'first_publication_bonus', `first-publication:${recordRequest.user_id}`, reviewer.id, { requestId });
      const referral = await env.DB.prepare('SELECT referred_by_permanent_id FROM users WHERE id = ?').bind(recordRequest.user_id).first<{ referred_by_permanent_id: string | null }>();
      if (referral?.referred_by_permanent_id) { const referrer = await activeUserByPermanentId(env, referral.referred_by_permanent_id); if (referrer && referrer.id !== recordRequest.user_id) await awardFromTreasury(env, referrer.id, FIRST_PUBLICATION_REWARD, 'referral_first_publication_bonus', `referral-first-publication:${recordRequest.user_id}`, reviewer.id, { referredUserId: recordRequest.user_id, requestId }); }
    }
  }
  const message = publicationMail[recordRequest.submission_locale][decision]; const notificationKind = `publication_${decision}` as NotificationRow['kind'];
  await env.DB.batch([
    env.DB.prepare('INSERT INTO notifications (id, user_id, request_id, kind, locale, title, message, is_read, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)').bind(`notice_${crypto.randomUUID()}`, recordRequest.user_id, requestId, notificationKind, recordRequest.submission_locale, message.title, note ? `${message.text}\n\n${recordRequest.submission_locale === 'ar' ? 'ملاحظة المشرف:' : 'Reviewer note:'}\n${note}` : message.text, now),
    env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), recordRequest.tenant_id, reviewer.id, `publication_${decision}`, 'publish_request', requestId, JSON.stringify({ slug: recordRequest.slug, reviewedAt: now }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
  ]);
  if (decision === 'approved') { const profile = await env.DB.prepare('SELECT id, user_id, tenant_id, slug, draft_json, published_json, is_published, storage_used_bytes, images_count, updated_at, created_at FROM profiles WHERE id = ?').bind(recordRequest.profile_id).first<ProfileRow>(); if (profile) await cleanUnusedMedia(env, profile, recordRequest.owner_name); }
  const delivered = await sendPublicationDecision(env, recordRequest.owner_email, recordRequest.submission_locale, decision, note, requestId).catch(() => false);
  await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), recordRequest.tenant_id, reviewer.id, 'publication_decision_notification', 'publish_request', requestId, JSON.stringify({ delivered }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), Date.now()).run();
  return responseJson({ ok: true, delivered });
}

async function deletePublicationRequest(request: Request, env: Env, requestId: string) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const actor = await authUser(request, env); if (!actor) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (actor.role !== 'super_admin') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const target = await env.DB.prepare("SELECT tenant_id FROM publish_requests WHERE id = ? AND status = 'pending'").bind(requestId).first<{ tenant_id: string }>();
  if (!target) return responseJson({ ok: false, error: 'not_found' }, 404);
  const removed = await env.DB.prepare("DELETE FROM publish_requests WHERE id = ? AND status = 'pending'").bind(requestId).run();
  if (!removed.meta.changes) return responseJson({ ok: false, error: 'not_found' }, 404);
  await auditSovereignty(env, request, actor.id, target.tenant_id, 'publication_request_deleted', 'publish_request', requestId, {});
  return responseJson({ ok: true });
}

function validGiftLink(value: unknown) { try { const url = new URL(typeof value === 'string' ? value.trim() : ''); return ['https:', 'http:'].includes(url.protocol) && url.href.length <= 900 ? url.href : null; } catch { return null; } }
async function confirmGift(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const input = record(await request.json().catch(() => ({}))); const recipient = textOf(input.recipient, 120); const link = validGiftLink(input.link); const idempotencyKey = idempotencyOf(input.idempotencyKey, 'gift');
  if (!recipient || !link || !idempotencyKey) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  const outcome = await debitToTreasury(env, user.id, DAY_REDEMPTION_COST, 'gift_qr', idempotencyKey, { service: 'client_side_qr_gift' });
  if (!outcome.ok) return responseJson({ ok: false, error: outcome.error }, 409);
  if (!outcome.idempotent) await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'tenant_main', user.id, 'gift_qr_confirmed', 'ledger_entry', idempotencyKey, JSON.stringify({ amount: DAY_REDEMPTION_COST }), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), Date.now()).run();
  const current = await activeUserById(env, user.id);
  return responseJson({ ok: true, alreadyProcessed: outcome.idempotent, user: current ? userView({ ...user, wallet_balance: current.wallet_balance }) : userView(user) });
}

async function accountWallet(request: Request, env: Env) {
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const [entitlement, entries, grants, referral] = await Promise.all([
    env.DB.prepare('SELECT active_days FROM point_entitlements WHERE user_id = ?').bind(user.id).first<{ active_days: number }>(),
    env.DB.prepare('SELECT id, from_account, to_account, amount, tx_type, created_at FROM ledger_entries WHERE actor_id = ? OR from_account = ? OR to_account = ? ORDER BY created_at DESC LIMIT 50').bind(user.id, user.id, user.id).all<WalletLedgerRow>(),
    env.DB.prepare('SELECT id, status, request_reason, grant_category, awarded_amount, reviewer_reason, requested_at FROM point_grant_requests WHERE user_id = ? ORDER BY requested_at DESC LIMIT 20').bind(user.id).all<GrantRequestRow>(),
    env.DB.prepare('SELECT referred_by_permanent_id FROM users WHERE id = ?').bind(user.id).first<{ referred_by_permanent_id: string | null }>()
  ]);
  return responseJson({ ok: true, wallet: { balance: user.wallet_balance, permanentId: user.permanent_id, activeDays: entitlement?.active_days ?? 0, referral: { link: `https://vipdid.app/?ref=${encodeURIComponent(user.permanent_id)}`, referrer: referral?.referred_by_permanent_id ?? null }, entries: (entries.results ?? []).map((entry) => ({ id: entry.id, amount: entry.amount, type: entry.tx_type, createdAt: entry.created_at, direction: entry.to_account === user.id ? 'incoming' : 'outgoing' })), grantRequests: (grants.results ?? []).map((entry) => ({ id: entry.id, status: entry.status, reason: entry.request_reason, category: entry.grant_category, amount: entry.awarded_amount, reviewerReason: entry.reviewer_reason, requestedAt: entry.requested_at })) } });
}

async function walletTransfer(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const input = record(await request.json().catch(() => ({}))); const recipientPermanentId = permanentIdOf(input.recipientPermanentId); const amount = pointAmountOf(input.amount); const idempotencyKey = idempotencyOf(input.idempotencyKey, 'transfer');
  if (!recipientPermanentId || !amount || !idempotencyKey) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  if (recipientPermanentId === user.permanent_id) return responseJson({ ok: false, error: 'self_transfer' }, 400);
  const recipient = await activeUserByPermanentId(env, recipientPermanentId); if (!recipient) return responseJson({ ok: false, error: 'recipient_not_found' }, 404);
  const outcome = await transferPoints(env, user.id, recipient.id, amount, idempotencyKey); if (!outcome.ok) return responseJson({ ok: false, error: outcome.error }, 409);
  const current = await activeUserById(env, user.id); return responseJson({ ok: true, alreadyProcessed: outcome.idempotent, user: current ? userView({ ...user, wallet_balance: current.wallet_balance }) : userView(user) });
}

async function walletRedeemDays(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const input = record(await request.json().catch(() => ({}))); const days = pointAmountOf(input.days, 36500); const idempotencyKey = idempotencyOf(input.idempotencyKey, 'redeem');
  if (!days || !idempotencyKey) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  const outcome = await redeemDays(env, user.id, days, idempotencyKey); if (!outcome.ok) return responseJson({ ok: false, error: outcome.error }, 409);
  const current = await activeUserById(env, user.id); return responseJson({ ok: true, alreadyProcessed: outcome.idempotent, user: current ? userView({ ...user, wallet_balance: current.wallet_balance }) : userView(user) });
}

async function requestPointGrant(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const user = await authUser(request, env); if (!user) return responseJson({ ok: false, error: 'unauthorized' }, 401);
  const reason = textOf(record(await request.json().catch(() => ({}))).reason, 800); if (reason.length < 8) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  if (await env.DB.prepare("SELECT id FROM point_grant_requests WHERE user_id = ? AND status = 'pending' LIMIT 1").bind(user.id).first<{ id: string }>()) return responseJson({ ok: false, error: 'request_pending' }, 409);
  const now = Date.now(); await env.DB.batch([
    env.DB.prepare('INSERT INTO point_grant_requests (id, user_id, tenant_id, status, request_reason, grant_category, awarded_amount, reviewer_id, reviewer_reason, requested_at, reviewed_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, NULL)').bind(`grant_${crypto.randomUUID()}`, user.id, 'tenant_main', 'pending', reason, now),
    env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), 'tenant_main', user.id, 'point_grant_requested', 'point_grant_request', user.id, JSON.stringify({}), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), now)
  ]);
  return responseJson({ ok: true }, 202);
}

async function adminWalletOverview(request: Request, env: Env) {
  const admin = await authUser(request, env); if (!admin) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (admin.role !== 'super_admin') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const [treasury, requests] = await Promise.all([
    setting(env, 'treasury_balance'),
    env.DB.prepare("SELECT g.id, g.status, g.request_reason, g.grant_category, g.awarded_amount, g.reviewer_reason, g.requested_at, u.name AS user_name, u.permanent_id FROM point_grant_requests g JOIN users u ON u.id = g.user_id WHERE g.status = 'pending' ORDER BY g.requested_at ASC LIMIT 50").all<GrantRequestRow>()
  ]);
  return responseJson({ ok: true, overview: { treasuryBalance: Math.max(0, Number(treasury ?? '0')), pendingRequests: (requests.results ?? []).map((item) => ({ id: item.id, status: item.status, reason: item.request_reason, category: item.grant_category, amount: item.awarded_amount, reviewerReason: item.reviewer_reason, requestedAt: item.requested_at, userName: item.user_name ?? '', permanentId: item.permanent_id ?? '' })) } });
}

async function decidePointGrant(request: Request, env: Env, grantId: string) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const admin = await authUser(request, env); if (!admin) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (admin.role !== 'super_admin') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const input = record(await request.json().catch(() => ({}))); if (!(await requireStepUpPin(env, admin, input.stepUpPin))) return responseJson({ ok: false, error: 'step_up_required' }, 401);
  const decision = input.decision === 'approved' ? 'approved' : input.decision === 'rejected' ? 'rejected' : null; const note = textOf(input.note, 800); const amount = pointAmountOf(input.amount); const category = grantCategoryOf(input.category);
  if (!decision || !note || (decision === 'approved' && (!amount || !category))) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  const grant = await env.DB.prepare("SELECT id, user_id, tenant_id FROM point_grant_requests WHERE id = ? AND status = 'pending'").bind(grantId).first<{ id: string; user_id: string; tenant_id: string }>(); if (!grant) return responseJson({ ok: false, error: 'not_found' }, 404);
  if (decision === 'approved') { const outcome = await awardFromTreasury(env, grant.user_id, amount!, 'admin_grant', `grant-request:${grant.id}`, admin.id, { category, grantRequestId: grant.id }); if (!outcome.ok) return responseJson({ ok: false, error: outcome.error }, 409); }
  const now = Date.now(); const changed = await env.DB.prepare("UPDATE point_grant_requests SET status = ?, grant_category = ?, awarded_amount = ?, reviewer_id = ?, reviewer_reason = ?, reviewed_at = ? WHERE id = ? AND status = 'pending'").bind(decision, decision === 'approved' ? category : null, decision === 'approved' ? amount : null, admin.id, note, now, grant.id).run(); if (!changed.meta.changes) return responseJson({ ok: false, error: 'decision_recorded' }, 409);
  return responseJson({ ok: true });
}

async function adminDirectGrant(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const admin = await authUser(request, env); if (!admin) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (admin.role !== 'super_admin') return responseJson({ ok: false, error: 'forbidden' }, 403);
  const input = record(await request.json().catch(() => ({}))); if (!(await requireStepUpPin(env, admin, input.stepUpPin))) return responseJson({ ok: false, error: 'step_up_required' }, 401);
  const recipientPermanentId = permanentIdOf(input.recipientPermanentId); const amount = pointAmountOf(input.amount); const category = grantCategoryOf(input.category); const reason = textOf(input.reason, 800); const idempotencyKey = idempotencyOf(input.idempotencyKey, 'admin_grant');
  if (!recipientPermanentId || !amount || !category || reason.length < 4 || !idempotencyKey) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  const recipient = await activeUserByPermanentId(env, recipientPermanentId); if (!recipient) return responseJson({ ok: false, error: 'recipient_not_found' }, 404);
  const outcome = await awardFromTreasury(env, recipient.id, amount, 'admin_grant', idempotencyKey, admin.id, { category, reason }); if (!outcome.ok) return responseJson({ ok: false, error: outcome.error }, 409);
  return responseJson({ ok: true, alreadyProcessed: outcome.idempotent });
}

type TenantRow = { id: string; slug: string; name_ar: string; name_en: string; logo_url: string | null; cover_url: string | null; status: 'pending' | 'active' | 'suspended'; tenant_type: 'main' | 'partner'; owner_user_id: string | null; assigned_moderator_id: string | null };
function tenantSlugOf(value: unknown) { const valueText = typeof value === 'string' ? value.trim().toLowerCase() : ''; return /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/.test(valueText) && !RESERVED_SLUGS.has(valueText) ? valueText : null; }
async function tenantForHost(env: Env, host: string) {
  if (host === 'vipdid.app') return env.DB.prepare("SELECT id, slug, name_ar, name_en, logo_url, cover_url, status, tenant_type, owner_user_id, assigned_moderator_id FROM tenants WHERE id = 'tenant_main'").first<TenantRow>();
  const match = host.match(/^([a-z0-9-]+)\.vipdid\.app$/);
  if (match) return env.DB.prepare("SELECT id, slug, name_ar, name_en, logo_url, cover_url, status, tenant_type, owner_user_id, assigned_moderator_id FROM tenants WHERE slug = ? AND status = 'active' AND tenant_type = 'partner'").bind(match[1]).first<TenantRow>();
  return env.DB.prepare("SELECT id, slug, name_ar, name_en, logo_url, cover_url, status, tenant_type, owner_user_id, assigned_moderator_id FROM tenants WHERE custom_domain = ? AND status = 'active' AND tenant_type = 'partner'").bind(host).first<TenantRow>();
}
async function tenantForRequest(request: Request, env: Env) { return tenantForHost(env, hostnameForRequest(request)); }

async function canManageTenant(env: Env, actor: UserRow, tenantId: string) { if (actor.role === 'super_admin') return true; const tenant = await env.DB.prepare('SELECT owner_user_id, assigned_moderator_id FROM tenants WHERE id = ?').bind(tenantId).first<{ owner_user_id: string | null; assigned_moderator_id: string | null }>(); return Boolean(tenant && ((actor.role === 'adheed' && tenant.owner_user_id === actor.id) || (actor.role === 'moderator' && tenant.assigned_moderator_id === actor.id))); }
async function auditSovereignty(env: Env, request: Request, actorId: string, tenantId: string, action: string, targetType: string, targetId: string, details: Record<string, unknown> = {}) { await env.DB.prepare('INSERT INTO audit_logs (id, tenant_id, actor_id, action, target_type, target_id, details_json, ip_hash, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)').bind(crypto.randomUUID(), tenantId, actorId, action, targetType, targetId, JSON.stringify(details), toBase64(await digest(request.headers.get('CF-Connecting-IP') ?? 'unknown')), Date.now()).run(); }
async function managedAccount(env: Env, request: Request, actor: UserRow, tenantId: string, nameValue: unknown, emailValue: unknown, slugValue: unknown, role: 'user' | 'moderator' | 'adheed') {
  const name = textOf(nameValue, 120); const email = emailOf(emailValue); const slug = tenantSlugOf(slugValue); if (!name || !email || !slug) return null;
  const tenant = await env.DB.prepare('SELECT id FROM tenants WHERE id = ?').bind(tenantId).first<{ id: string }>(); if (!tenant || !(await canManageTenant(env, actor, tenantId))) return null;
  const existing = await env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>(); const profile = await env.DB.prepare('SELECT id FROM profiles WHERE tenant_id = ? AND slug = ?').bind(tenantId, slug).first<{ id: string }>(); if (existing || profile) return null;
  let permanent: string; try { permanent = await allocatePermanentId(env); } catch { return null; }
  const now = Date.now(); const id = `user_${crypto.randomUUID()}`; const profileId = `profile_${crypto.randomUUID()}`; const draft = snapshotJson(profileDraft({}, name), []);
  await env.DB.batch([env.DB.prepare('INSERT INTO users (id, permanent_id, tenant_id, name, email, phone, whatsapp, pin_hash, pin_salt, role, is_managed, managed_by_user_id, custody_transfer_email, custody_token_hash, custody_token_expires, referred_by_permanent_id, wallet_balance, status, failed_login_attempts, terms_accepted_at, privacy_accepted_at, eligibility_acknowledged_at, created_at) VALUES (?, ?, ?, ?, ?, NULL, NULL, NULL, NULL, ?, 1, ?, NULL, NULL, NULL, NULL, 0, ?, 0, ?, ?, ?, ?)').bind(id, permanent, tenantId, name, email, role, actor.id, 'pending_verification', now, now, now, now), env.DB.prepare('INSERT INTO profiles (id, user_id, tenant_id, slug, is_published, published_version_id, draft_json, published_json, allow_search_indexing, active_days_balance, featured_until, storage_used_bytes, images_count, updated_at, created_at) VALUES (?, ?, ?, ?, 0, NULL, ?, NULL, 1, 0, NULL, 0, 0, ?, ?)').bind(profileId, id, tenantId, slug, draft, now, now)]);
  await auditSovereignty(env, request, actor.id, tenantId, 'managed_account_created', 'user', id, { role, permanentId: permanent, slug }); return { id, email, permanent, profileId };
}

async function sendCustodyInvitation(env: Env, recipient: string, rawToken: string, locale: Locale, subject: 'user' | 'tenant') { const link = `https://vipdid.app/accept-custody?custody=${encodeURIComponent(rawToken)}`; const arabic = locale === 'ar'; const heading = subject === 'tenant' ? (arabic ? 'دعوة تسليم عهدة العضيد' : 'Partner custody invitation') : (arabic ? 'دعوة تسليم عهدة الحساب' : 'Account custody invitation'); const text = arabic ? `${heading}\n\nأكمل الاستلام عبر الرابط الآمن التالي:\n${link}\n\nينتهي الرابط خلال 72 ساعة.` : `${heading}\n\nComplete the transfer through this secure link:\n${link}\n\nThis link expires in 72 hours.`; const response = await env.MAILER.fetch(new Request('https://mailer/v1/support/send', { method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': `vipdid-custody-${await hashed(rawToken)}` }, body: JSON.stringify({ to: recipient, subject: heading, text, html: `<div dir="${arabic ? 'rtl' : 'ltr'}" lang="${locale}"><h1>${htmlSafe(heading)}</h1><p>${htmlSafe(arabic ? 'أكمل الاستلام عبر الرابط الآمن:' : 'Complete the transfer through this secure link:')}</p><p><a href="${htmlSafe(link)}">${htmlSafe(link)}</a></p></div>` }) })); return response.ok; }
async function issueCustody(request: Request, env: Env, actor: UserRow, subjectType: 'user' | 'tenant', subjectUserId: string, tenantId: string, recipientValue: unknown, locale: Locale) { const recipient = emailOf(recipientValue); if (!recipient || !(await canManageTenant(env, actor, tenantId))) return responseJson({ ok: false, error: 'forbidden' }, 403); const rawToken = randomToken(36); const now = Date.now(); const id = `custody_${crypto.randomUUID()}`; await env.DB.batch([env.DB.prepare("UPDATE custody_invitations SET status = 'revoked' WHERE subject_type = ? AND subject_user_id = ? AND status = 'pending'").bind(subjectType, subjectUserId), env.DB.prepare('INSERT INTO custody_invitations (id, subject_type, subject_user_id, tenant_id, recipient_email, token_hash, status, created_by, expires_at, accepted_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?)').bind(id, subjectType, subjectUserId, tenantId, recipient, await hashed(rawToken), 'pending', actor.id, now + 72 * 60 * 60 * 1000, now)]); const delivered = await sendCustodyInvitation(env, recipient, rawToken, locale, subjectType); await auditSovereignty(env, request, actor.id, tenantId, `${subjectType}_custody_invited`, subjectType, subjectUserId, { invitationId: id, delivered }); return responseJson({ ok: true, delivered }, 202); }
async function custodyAccept(request: Request, env: Env) {
  if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403);
  const input = record(await request.json().catch(() => ({}))); const rawToken = typeof input.token === 'string' ? input.token : ''; const pin = pinOf(input.pin); if (!rawToken || !pin) return responseJson({ ok: false, error: 'invalid_input' }, 400);
  const now = Date.now(); const invitation = await env.DB.prepare("SELECT id, subject_type, subject_user_id, tenant_id, recipient_email FROM custody_invitations WHERE token_hash = ? AND status = 'pending' AND expires_at > ?").bind(await hashed(rawToken), now).first<{ id: string; subject_type: 'user' | 'tenant'; subject_user_id: string; tenant_id: string; recipient_email: string }>(); if (!invitation) return responseJson({ ok: false, error: 'custody_invalid' }, 400);
  let pinRecord: { salt: string; hash: string }; try { pinRecord = await createPinRecord(pin, invitation.subject_user_id, env); } catch { return responseJson({ ok: false, error: 'custody_unavailable' }, 503); }
  const conflict = await env.DB.prepare('SELECT id FROM users WHERE email = ? AND id != ?').bind(invitation.recipient_email, invitation.subject_user_id).first<{ id: string }>(); if (conflict) return responseJson({ ok: false, error: 'email_in_use' }, 409);
  const changed = await env.DB.batch([env.DB.prepare("UPDATE custody_invitations SET status = 'accepted', accepted_at = ? WHERE id = ? AND status = 'pending'").bind(now, invitation.id), env.DB.prepare('UPDATE users SET email = ?, pin_hash = ?, pin_salt = ?, pin_set_at = ?, email_verified_at = ?, status = ?, is_managed = 0, managed_by_user_id = NULL, custody_transfer_email = NULL, custody_token_hash = NULL, custody_token_expires = NULL WHERE id = ?').bind(invitation.recipient_email, pinRecord.hash, pinRecord.salt, now, now, 'active', invitation.subject_user_id), env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND revoked_at IS NULL').bind(now, invitation.subject_user_id)]); if (!changed[0]?.meta.changes) return responseJson({ ok: false, error: 'custody_invalid' }, 409);
  const user = await env.DB.prepare('SELECT id, permanent_id, name, role, wallet_balance, email_verified_at, status, pin_hash, pin_salt, failed_login_attempts, locked_until FROM users WHERE id = ?').bind(invitation.subject_user_id).first<UserRow>(); if (!user) return responseJson({ ok: false, error: 'custody_invalid' }, 409); await auditSovereignty(env, request, user.id, invitation.tenant_id, `${invitation.subject_type}_custody_accepted`, invitation.subject_type, invitation.subject_user_id, { invitationId: invitation.id }); const issued = await issueSession(env, user, true); return withCookies(responseJson({ ok: true, user: issued.user }), issued.cookies);
}

async function platformContext(request: Request, env: Env) { const tenant = await tenantForRequest(request, env); if (!tenant) return responseJson({ ok: false, error: 'not_found' }, 404); return responseJson({ ok: true, tenant: { slug: tenant.slug, name: tenant.name_ar, nameEn: tenant.name_en, logoUrl: tenant.logo_url, coverUrl: tenant.cover_url, type: tenant.tenant_type } }); }
async function sovereignOverview(request: Request, env: Env) { const actor = await authUser(request, env); if (!actor) return responseJson({ ok: false, error: 'unauthorized' }, 401); if (actor.role !== 'super_admin') return responseJson({ ok: false, error: 'forbidden' }, 403); const [treasury, reviews, audits, partners] = await Promise.all([setting(env, 'treasury_balance'), env.DB.prepare("SELECT r.id, p.slug, u.name AS owner_name, t.name_ar AS tenant_name FROM publish_requests r JOIN profiles p ON p.id = r.profile_id JOIN users u ON u.id = r.user_id JOIN tenants t ON t.id = r.tenant_id WHERE r.status = 'pending' ORDER BY r.submitted_at LIMIT 50").all<{ id: string; slug: string; owner_name: string; tenant_name: string }>(), env.DB.prepare('SELECT id, action, created_at FROM audit_logs ORDER BY created_at DESC LIMIT 50').all<{ id: string; action: string; created_at: number }>(), env.DB.prepare("SELECT id, slug, name_ar, status FROM tenants WHERE tenant_type = 'partner' ORDER BY created_at DESC LIMIT 50").all<{ id: string; slug: string; name_ar: string; status: string }>()]); return responseJson({ ok: true, overview: { lockEnabled: (await setting(env, 'site_lock_enabled')) === '1', treasuryBalance: Number(treasury ?? '0'), reviews: (reviews.results ?? []).map(r => ({ id:r.id, slug:r.slug, ownerName:r.owner_name, tenantName:r.tenant_name })), audits: (audits.results ?? []).map(a=>({ id:a.id, action:a.action, createdAt:a.created_at })), partners: (partners.results ?? []).map(p=>({ id:p.id, slug:p.slug, name:p.name_ar, status:p.status })) } }); }
async function sovereignLock(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok:false,error:'invalid_request' },403); const actor=await authUser(request,env); if(!actor||actor.role!=='super_admin') return responseJson({ok:false,error:'forbidden'},403); const input=record(await request.json().catch(()=>({}))); if(!(await requireStepUpPin(env, actor, input.stepUpPin))) return responseJson({ok:false,error:'step_up_required'},401); const enabled=input.enabled===true; const password=typeof input.password==='string'?input.password:''; if(password&&password.length<8)return responseJson({ok:false,error:'invalid_input'},400); const now=Date.now(); const commands=[env.DB.prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?').bind(enabled?'1':'0',now,'site_lock_enabled')]; if(password){const salt=toBase64(crypto.getRandomValues(new Uint8Array(16)));commands.push(env.DB.prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?').bind(toBase64(await deriveSecretHash(password,salt)),now,'site_lock_password_hash'),env.DB.prepare('UPDATE system_settings SET value = ?, updated_at = ? WHERE key = ?').bind(salt,now,'site_lock_password_salt'));} await env.DB.batch(commands); await auditSovereignty(env,request,actor.id,'tenant_main','platform_lock_updated','setting','site_lock_enabled',{enabled}); return responseJson({ok:true}); }

async function sovereignCreate(request: Request, env: Env, kind: 'supervisor'|'managed'|'partner') { if(!sameOrigin(request))return responseJson({ok:false,error:'invalid_request'},403); const actor=await authUser(request,env);if(!actor||actor.role!=='super_admin')return responseJson({ok:false,error:'forbidden'},403);const input=record(await request.json().catch(()=>({})));if(!(await requireStepUpPin(env,actor,input.stepUpPin)))return responseJson({ok:false,error:'step_up_required'},401);const locale=localeOf(input.locale);if(kind==='partner'){const slug=tenantSlugOf(input.slug), name=textOf(input.name,120), email=emailOf(input.email);if(!slug||!name||!email)return responseJson({ok:false,error:'invalid_input'},400);const existing=await env.DB.prepare('SELECT id FROM tenants WHERE slug=?').bind(slug).first<{id:string}>();if(existing)return responseJson({ok:false,error:'slug_taken'},409);const tenantId=`tenant_${crypto.randomUUID()}`;await env.DB.prepare('INSERT INTO tenants (id,slug,name_ar,name_en,logo_url,cover_url,description_ar,description_en,theme_config_json,status,owner_user_id,assigned_moderator_id,is_managed_by_admin,custody_transfer_email,custody_token_hash,custody_token_expires,created_by,created_at,approved_by,approved_at,tenant_type,requested_at,request_reason,updated_at) VALUES (?, ?, ?, ?, NULL,NULL,NULL,NULL,?, ?, NULL,NULL,1,NULL,NULL,NULL,?,?,?, ?, ?, ?,NULL,?)').bind(tenantId,slug,name,name,'{}','active',actor.id,Date.now(),actor.id,Date.now(),'partner',Date.now(),Date.now()).run();const created=await managedAccount(env,request,actor,tenantId,name,email,slug,'adheed');if(!created)return responseJson({ok:false,error:'creation_failed'},409);await env.DB.prepare('UPDATE tenants SET owner_user_id=? WHERE id=?').bind(created.id,tenantId).run();return issueCustody(request,env,actor,'tenant',created.id,tenantId,email,locale);}const result=await managedAccount(env,request,actor,'tenant_main',input.name,input.email,input.slug,kind==='supervisor'?'moderator':'user');if(!result)return responseJson({ok:false,error:'creation_failed'},409);if(kind==='supervisor')await env.DB.prepare('UPDATE tenants SET assigned_moderator_id = ?, updated_at = ? WHERE id = ?').bind(result.id,Date.now(),'tenant_main').run();return issueCustody(request,env,actor,'user',result.id,'tenant_main',result.email,locale); }

async function requestPartner(request: Request, env: Env) { if(!sameOrigin(request))return responseJson({ok:false,error:'invalid_request'},403);const actor=await authUser(request,env);if(!actor)return responseJson({ok:false,error:'unauthorized'},401);const input=record(await request.json().catch(()=>({})));const slug=tenantSlugOf(input.slug),name=textOf(input.name,120);if(!slug||!name)return responseJson({ok:false,error:'invalid_input'},400);const existing=await env.DB.prepare('SELECT id FROM tenants WHERE slug=?').bind(slug).first<{id:string}>();if(existing)return responseJson({ok:false,error:'slug_taken'},409);const now=Date.now();await env.DB.prepare('INSERT INTO tenants (id,slug,name_ar,name_en,logo_url,cover_url,description_ar,description_en,theme_config_json,status,owner_user_id,assigned_moderator_id,is_managed_by_admin,custody_transfer_email,custody_token_hash,custody_token_expires,created_by,created_at,approved_by,approved_at,tenant_type,requested_at,request_reason,updated_at) VALUES (?, ?, ?, ?, NULL,NULL,NULL,NULL,?, ?, ?,NULL,0,NULL,NULL,NULL,?,?,NULL,NULL,?,?,NULL,?)').bind(`tenant_${crypto.randomUUID()}`,slug,name,name,'{}','pending',actor.id,actor.id,now,'partner',now,now).run();await auditSovereignty(env,request,actor.id,'tenant_main','partner_requested','tenant',slug,{});return responseJson({ok:true},202); }
async function approvePartner(request: Request, env: Env, id: string) { if(!sameOrigin(request))return responseJson({ok:false,error:'invalid_request'},403);const actor=await authUser(request,env);if(!actor||actor.role!=='super_admin')return responseJson({ok:false,error:'forbidden'},403);const input=record(await request.json().catch(()=>({})));if(!(await requireStepUpPin(env,actor,input.stepUpPin)))return responseJson({ok:false,error:'step_up_required'},401);const partner=await env.DB.prepare("SELECT owner_user_id FROM tenants WHERE id=? AND tenant_type='partner' AND status='pending'").bind(id).first<{owner_user_id:string|null}>();if(!partner)return responseJson({ok:false,error:'not_found'},404);await env.DB.batch([env.DB.prepare("UPDATE tenants SET status='active',approved_by=?,approved_at=?,updated_at=? WHERE id=?").bind(actor.id,Date.now(),Date.now(),id),partner.owner_user_id?env.DB.prepare("UPDATE users SET role='adheed' WHERE id=?").bind(partner.owner_user_id):env.DB.prepare('SELECT 1')]);await auditSovereignty(env,request,actor.id,id,'partner_approved','tenant',id,{});return responseJson({ok:true}); }

async function partnerOverview(request: Request, env: Env) { const actor=await authUser(request,env);if(!actor)return responseJson({ok:false,error:'unauthorized'},401);const tenant=await env.DB.prepare("SELECT id,slug,name_ar,logo_url,cover_url FROM tenants WHERE owner_user_id=? AND tenant_type='partner' AND status='active' LIMIT 1").bind(actor.id).first<{id:string;slug:string;name_ar:string;logo_url:string|null;cover_url:string|null}>();if(!tenant||!(await canManageTenant(env,actor,tenant.id)))return responseJson({ok:false,error:'forbidden'},403);const [users,reviews]=await Promise.all([env.DB.prepare('SELECT permanent_id,name,email,is_managed FROM users WHERE tenant_id=? ORDER BY created_at DESC LIMIT 100').bind(tenant.id).all<{permanent_id:string;name:string;email:string;is_managed:number}>(),env.DB.prepare("SELECT r.id,p.slug,u.name AS owner_name FROM publish_requests r JOIN profiles p ON p.id=r.profile_id JOIN users u ON u.id=r.user_id WHERE r.tenant_id=? AND r.status='pending' ORDER BY r.submitted_at").bind(tenant.id).all<{id:string;slug:string;owner_name:string}>()]);return responseJson({ok:true,overview:{tenant:{slug:tenant.slug,name:tenant.name_ar,logoUrl:tenant.logo_url??undefined,coverUrl:tenant.cover_url??undefined},users:(users.results??[]).map(u=>({permanentId:u.permanent_id,name:u.name,email:u.email,isManaged:Boolean(u.is_managed)})),reviews:(reviews.results??[]).map(r=>({id:r.id,slug:r.slug,ownerName:r.owner_name}))}}); }
async function partnerManaged(request: Request, env: Env) { if(!sameOrigin(request))return responseJson({ok:false,error:'invalid_request'},403);const actor=await authUser(request,env);if(!actor)return responseJson({ok:false,error:'unauthorized'},401);const tenant=await env.DB.prepare("SELECT id FROM tenants WHERE owner_user_id=? AND tenant_type='partner' AND status='active' LIMIT 1").bind(actor.id).first<{id:string}>();if(!tenant)return responseJson({ok:false,error:'forbidden'},403);const input=record(await request.json().catch(()=>({})));if(!(await requireStepUpPin(env,actor,input.stepUpPin)))return responseJson({ok:false,error:'step_up_required'},401);const result=await managedAccount(env,request,actor,tenant.id,input.name,input.email,input.slug,'user');if(!result)return responseJson({ok:false,error:'creation_failed'},409);return issueCustody(request,env,actor,'user',result.id,tenant.id,result.email,localeOf(input.locale)); }

async function me(request: Request, env: Env) { const user = await authUser(request, env); return responseJson({ ok: true, authenticated: Boolean(user), user: user ? userView(user) : null }); }
async function logout(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, error: 'invalid_request' }, 403); const token = cookie(request, 'vipdid_session'); if (token) await env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE token_hash = ? AND revoked_at IS NULL').bind(Date.now(), await hashed(token)).run(); return withCookies(responseJson({ ok: true }), [clearCookie('vipdid_session'), clearCookie('vipdid_device')]); }
async function unlock(request: Request, env: Env) { if (!sameOrigin(request)) return responseJson({ ok: false, reason: 'invalid_request' }, 403); const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown'; const rateKey = `lock:${toBase64Url(await digest(ip)).slice(0, 24)}`; const current = Number(await env.RATE_LIMIT.get(rateKey) ?? '0'); if (current >= 5) return responseJson({ ok: false, reason: 'limited' }, 429); const body = await request.json<{ password?: string }>().catch(() => ({} as { password?: string })); const [enabled, expectedHash, salt] = await Promise.all([setting(env, 'site_lock_enabled'), setting(env, 'site_lock_password_hash'), setting(env, 'site_lock_password_salt')]); if (enabled !== '1') return responseJson({ ok: true, locked: false }); const verified = Boolean(body.password && expectedHash && salt && equal(await deriveSecretHash(body.password, salt), fromBase64(expectedHash))); if (!verified) { await env.RATE_LIMIT.put(rateKey, String(current + 1), { expirationTtl: 900 }); return responseJson({ ok: false, reason: 'invalid' }, 401); } await env.RATE_LIMIT.delete(rateKey); const payload = toBase64Url(encoder.encode(JSON.stringify({ expiresAt: Date.now() + 43200000 }))); const token = `${payload}.${await sign(payload, env.SESSION_SIGNING_KEY)}`; return responseJson({ ok: true, locked: false }, 200, { 'set-cookie': `vipdid_access=${token}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=None` }); }
function staticAsset(pathname: string) { const key = pathname === '/' ? 'index.html' : pathname.slice(1); const asset = STATIC_ASSETS[key]; if (!asset) return null; return new Response(fromBase64(asset.body), { headers: { 'content-type': asset.type, 'cache-control': asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff' } }); }

function routeSlug(pathname: string) { const value = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, '')); return slugOf(value); }

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname === '/api/health') return responseJson({ ok: true, service: 'vipdid' });
    if (url.pathname === '/api/platform/context' && request.method === 'GET') return platformContext(request, env);
    if (url.pathname === '/api/lock/status' && request.method === 'GET') return responseJson({ locked: await locked(request, env) });
    if (url.pathname === '/api/lock/unlock' && request.method === 'POST') return unlock(request, env);
    if (url.pathname === '/api/custody/accept' && request.method === 'POST') return custodyAccept(request, env);
    if (url.pathname === '/api/public/search' && request.method === 'GET') return publicSearch(request, env);
    if (url.pathname.startsWith('/api/public/profile/') && request.method === 'GET') { const slug = slugOf(decodeURIComponent(url.pathname.slice('/api/public/profile/'.length))); return slug ? publicProfile(request, env, slug) : responseJson({ ok: false, error: 'not_found' }, 404); }
    if (url.pathname.startsWith('/api/media/') && request.method === 'GET') { const id = decodeURIComponent(url.pathname.slice('/api/media/'.length)); return /^media_[a-z0-9-]{36}$/.test(id) ? mediaAsset(request, env, id) : new Response('Not Found', { status: 404, headers: securityHeaders }); }
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
    if (url.pathname === '/api/account/publication' && request.method === 'POST') return submitPublication(request, env);
    if (url.pathname === '/api/account/notifications' && request.method === 'GET') return accountNotifications(request, env);
    if (url.pathname === '/api/account/gifts' && request.method === 'POST') return confirmGift(request, env);
    if (url.pathname === '/api/account/partners/request' && request.method === 'POST') return requestPartner(request, env);
    if (url.pathname === '/api/account/wallet' && request.method === 'GET') return accountWallet(request, env);
    if (url.pathname === '/api/account/wallet/transfer' && request.method === 'POST') return walletTransfer(request, env);
    if (url.pathname === '/api/account/wallet/redeem-days' && request.method === 'POST') return walletRedeemDays(request, env);
    if (url.pathname === '/api/account/wallet/grant-requests' && request.method === 'POST') return requestPointGrant(request, env);
    if (url.pathname === '/api/admin/wallet/overview' && request.method === 'GET') return adminWalletOverview(request, env);
    if (url.pathname === '/api/admin/wallet/grants' && request.method === 'POST') return adminDirectGrant(request, env);
    if (url.pathname.startsWith('/api/admin/wallet/grant-requests/') && url.pathname.endsWith('/decision') && request.method === 'POST') return decidePointGrant(request, env, decodeURIComponent(url.pathname.slice('/api/admin/wallet/grant-requests/'.length, -'/decision'.length)));
    if (url.pathname === '/api/admin/publish-requests' && request.method === 'GET') return adminPublishRequests(request, env);
    if (url.pathname.startsWith('/api/admin/publish-requests/') && request.method === 'DELETE') return deletePublicationRequest(request, env, decodeURIComponent(url.pathname.slice('/api/admin/publish-requests/'.length)));
    if (url.pathname.startsWith('/api/admin/publish-requests/') && url.pathname.endsWith('/decision') && request.method === 'POST') return decidePublication(request, env, decodeURIComponent(url.pathname.slice('/api/admin/publish-requests/'.length, -'/decision'.length)));
    if (url.pathname === '/api/admin/sovereign/overview' && request.method === 'GET') return sovereignOverview(request, env);
    if (url.pathname === '/api/admin/sovereign/lock' && request.method === 'POST') return sovereignLock(request, env);
    if (url.pathname === '/api/admin/sovereign/supervisors' && request.method === 'POST') return sovereignCreate(request, env, 'supervisor');
    if (url.pathname === '/api/admin/sovereign/managed-users' && request.method === 'POST') return sovereignCreate(request, env, 'managed');
    if (url.pathname === '/api/admin/sovereign/partners' && request.method === 'POST') return sovereignCreate(request, env, 'partner');
    if (url.pathname.startsWith('/api/admin/sovereign/partners/') && url.pathname.endsWith('/approve') && request.method === 'POST') return approvePartner(request, env, decodeURIComponent(url.pathname.slice('/api/admin/sovereign/partners/'.length, -'/approve'.length)));
    if (url.pathname === '/api/partner/overview' && request.method === 'GET') return partnerOverview(request, env);
    if (url.pathname === '/api/partner/managed-users' && request.method === 'POST') return partnerManaged(request, env);
    const asset = staticAsset(url.pathname);
    if (asset) return secure(asset);
    const profile = request.method === 'GET' ? routeSlug(url.pathname) : null;
    if (request.method === 'GET' && (['/', '/dashboard', '/sovereign', '/partner', '/accept-custody', '/features', '/privacy', '/terms'].includes(url.pathname) || profile)) return secure(staticAsset('/')!);
    return new Response('Not Found', { status: 404, headers: securityHeaders });
  }
};
