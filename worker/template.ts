interface Env {
  DB: D1Database;
  MEDIA: R2Bucket;
  RATE_LIMIT: KVNamespace;
  SESSION_SIGNING_KEY: string;
  RESEND_API_KEY?: string;
}

type StaticAsset = { body: string; type: string; immutable: boolean };
declare const __STATIC_ASSETS__: Record<string, StaticAsset>;
const STATIC_ASSETS: Record<string, StaticAsset> = __STATIC_ASSETS__;
const encoder = new TextEncoder();
const decoder = new TextDecoder();

function responseJson(data: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...headers } });
}

function fromBase64(value: string) {
  const binary = atob(value.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function toBase64Url(bytes: Uint8Array) {
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function digest(value: string) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

function equal(left: Uint8Array, right: Uint8Array) {
  if (left.byteLength !== right.byteLength) return false;
  let comparison = 0;
  for (let index = 0; index < left.byteLength; index += 1) comparison |= left[index] ^ right[index];
  return comparison === 0;
}

async function derivePasswordHash(password: string, salt: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: fromBase64(salt), iterations: 210000 }, key, 256);
  return new Uint8Array(bits);
}

async function sign(value: string, secret: string) {
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(value))));
}

async function hasAccess(request: Request, env: Env) {
  const value = request.headers.get('cookie')?.match(/(?:^|;\s*)vipdid_access=([^;]+)/)?.[1];
  if (!value) return false;
  const [payload, signature] = value.split('.');
  if (!payload || !signature || !equal(encoder.encode(await sign(payload, env.SESSION_SIGNING_KEY)), encoder.encode(signature))) return false;
  try {
    const decoded = JSON.parse(decoder.decode(fromBase64(payload))) as { expiresAt?: number };
    return typeof decoded.expiresAt === 'number' && decoded.expiresAt > Date.now();
  } catch {
    return false;
  }
}

async function setting(env: Env, key: string) {
  const result = await env.DB.prepare('SELECT value FROM system_settings WHERE key = ?').bind(key).first<{ value: string }>();
  return result?.value ?? null;
}

async function locked(request: Request, env: Env) {
  const enabled = await setting(env, 'site_lock_enabled');
  return enabled === '1' && !(await hasAccess(request, env));
}

async function rateLimitKey(request: Request) {
  const ip = request.headers.get('CF-Connecting-IP') ?? 'unknown';
  return `lock:${toBase64Url(await digest(ip)).slice(0, 24)}`;
}

async function unlock(request: Request, env: Env) {
  const rateKey = await rateLimitKey(request);
  const current = Number(await env.RATE_LIMIT.get(rateKey) ?? '0');
  if (current >= 5) return responseJson({ ok: false, reason: 'limited' }, 429);
  const body = await request.json<{ password?: string }>().catch(() => ({} as { password?: string }));
  const [enabled, expectedHash, salt] = await Promise.all([
    setting(env, 'site_lock_enabled'),
    setting(env, 'site_lock_password_hash'),
    setting(env, 'site_lock_password_salt')
  ]);
  if (enabled !== '1') return responseJson({ ok: true, locked: false });
  const verified = Boolean(body.password && expectedHash && salt && equal(await derivePasswordHash(body.password, salt), fromBase64(expectedHash)));
  if (!verified) {
    await env.RATE_LIMIT.put(rateKey, String(current + 1), { expirationTtl: 900 });
    return responseJson({ ok: false, reason: 'invalid' }, 401);
  }
  await env.RATE_LIMIT.delete(rateKey);
  const payload = toBase64Url(encoder.encode(JSON.stringify({ expiresAt: Date.now() + 43200000 })));
  const token = `${payload}.${await sign(payload, env.SESSION_SIGNING_KEY)}`;
  return responseJson({ ok: true, locked: false }, 200, { 'set-cookie': `vipdid_access=${token}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax` });
}

function staticAsset(pathname: string) {
  const key = pathname === '/' ? 'index.html' : pathname.slice(1);
  const asset = STATIC_ASSETS[key];
  if (!asset) return null;
  const bytes = fromBase64(asset.body);
  return new Response(bytes, { headers: { 'content-type': asset.type, 'cache-control': asset.immutable ? 'public, max-age=31536000, immutable' : 'no-cache', 'x-content-type-options': 'nosniff' } });
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const securityHeaders = {
      'strict-transport-security': 'max-age=31536000; includeSubDomains; preload',
      'referrer-policy': 'strict-origin-when-cross-origin',
      'x-content-type-options': 'nosniff',
      'x-frame-options': 'SAMEORIGIN',
      'permissions-policy': 'camera=(), microphone=(), geolocation=()'
    };
    if (url.pathname === '/api/health') return responseJson({ ok: true, service: 'vipdid' }, 200, securityHeaders);
    if (url.pathname === '/api/lock/status' && request.method === 'GET') return responseJson({ locked: await locked(request, env) }, 200, securityHeaders);
    if (url.pathname === '/api/lock/unlock' && request.method === 'POST') return unlock(request, env);
    const asset = staticAsset(url.pathname);
    if (asset) {
      Object.entries(securityHeaders).forEach(([key, value]) => asset.headers.set(key, value));
      return asset;
    }
    return new Response('Not Found', { status: 404, headers: securityHeaders });
  }
};
