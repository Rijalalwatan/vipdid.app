import { claimStatement, fingerprint, openBox, reserveAttempt, secretBox, releaseSuccessfulAttempt } from './atomic';
type Env = { DB: D1Database; DATA_ENCRYPTION_KEY: string };
type MfaRow = { secret_cipher: string | null; pending_cipher: string | null; pending_expires_at: number | null; version: number; last_step: number; enrolled_at: number | null };
const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
export function base32(bytes: Uint8Array) {
  let bits = 0, value = 0, output = '';
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += alphabet[(value << (5 - bits)) & 31]; return output;
}
function unbase32(value: string) {
  let bits = 0, acc = 0; const bytes: number[] = [];
  for (const c of value.toUpperCase().replace(/=+$/, '')) { const n = alphabet.indexOf(c); if (n < 0) throw new Error('invalid_secret'); acc = (acc << 5) | n; bits += 5; if (bits >= 8) { bytes.push((acc >>> (bits - 8)) & 255); bits -= 8; } }
  return new Uint8Array(bytes);
}
export async function totp(secret: string, step: number, digits = 6) {
  const bytes = new Uint8Array(8); new DataView(bytes.buffer).setBigUint64(0, BigInt(step));
  const key = await crypto.subtle.importKey('raw', unbase32(secret), { name: 'HMAC', hash: 'SHA-1' }, false, ['sign']);
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', key, bytes)); const offset = mac[19] & 15;
  const number = ((mac[offset] & 127) << 24) | (mac[offset+1] << 16) | (mac[offset+2] << 8) | mac[offset+3];
  return String(number % (10 ** digits)).padStart(digits, '0');
}
async function matchedStep(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return null;
  const current = Math.floor(Date.now() / 30000);
  for (const step of [current, current - 1, current + 1]) if (await totp(secret, step) === code) return step;
  return null;
}
function sessionHash(request: Request) {
  const value = request.headers.get('cookie')?.match(/(?:^|;\s*)vipdid_session=([^;]+)/)?.[1];
  return value ?? null;
}
async function hashed(value: string) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)));
  let binary = ''; for (const b of bytes) binary += String.fromCharCode(b); return btoa(binary);
}
export async function adminMfaVerified(request: Request, env: Env, userId: string) {
  const token = sessionHash(request); if (!token) return false;
  return Boolean(await env.DB.prepare(`SELECT 1 FROM auth_sessions s JOIN admin_mfa m ON m.user_id = s.user_id
    WHERE s.token_hash = ? AND s.user_id = ? AND s.revoked_at IS NULL AND s.expires_at > ?
    AND s.mfa_verified_at > ? AND s.mfa_version = m.version AND m.enrolled_at IS NOT NULL`).bind(await hashed(token), userId, Date.now(), Date.now() - 15 * 60 * 1000).first());
}
export async function adminSecurity(request: Request, env: Env, userId: string, verifyPin: (value: unknown) => Promise<boolean>) {
  const path = new URL(request.url).pathname; const row = await env.DB.prepare('SELECT secret_cipher,pending_cipher,pending_expires_at,version,last_step,enrolled_at FROM admin_mfa WHERE user_id = ?').bind(userId).first<MfaRow>();
  if (request.method === 'GET' && path.endsWith('/status')) {const token=sessionHash(request);const current=token?await env.DB.prepare('SELECT mfa_verified_at FROM auth_sessions WHERE token_hash=? AND user_id=?').bind(await hashed(token),userId).first<{mfa_verified_at:number|null}>():null;return {ok:true,enrolled:Boolean(row?.enrolled_at),verified:await adminMfaVerified(request,env,userId),verifiedUntil:(current?.mfa_verified_at??0)+15*60*1000};}
  if (request.method !== 'POST' || request.headers.get('origin') !== new URL(request.url).origin) return { ok: false, error: 'invalid_request' };
  const input = await request.json().catch(() => ({})) as Record<string, unknown>;
  if (path.endsWith('/setup')) {
    if (row?.enrolled_at && !(await adminMfaVerified(request, env, userId))) return { ok: false, error: 'mfa_required' };
    if (!(await verifyPin(input.pin))) return { ok: false, error: 'step_up_required' };
    const secret = base32(crypto.getRandomValues(new Uint8Array(20))); const pending = await secretBox(secret, env.DATA_ENCRYPTION_KEY); const now = Date.now();
    await env.DB.prepare(`INSERT INTO admin_mfa(user_id,pending_cipher,pending_expires_at,updated_at) VALUES (?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET pending_cipher = excluded.pending_cipher,pending_expires_at = excluded.pending_expires_at,updated_at = excluded.updated_at`).bind(userId,pending,now+10*60*1000,now).run();
    return { ok: true, secret, uri: `otpauth://totp/${encodeURIComponent('VIP Digital ID:'+userId)}?secret=${secret}&issuer=VIP%20Digital%20ID&algorithm=SHA1&digits=6&period=30` };
  }
  const key = `mfa:${userId}`;
  if (!(await reserveAttempt(env.DB,key,5,15*60*1000))) return { ok:false,error:'limited' };
  const code = typeof input.code === 'string' ? input.code.trim() : '';
  const now = Date.now(); const token = sessionHash(request); if (!token) return {ok:false,error:'unauthorized'};
  const tokenHash = await hashed(token);
  if (path.endsWith('/activate')) {
    if (!row?.pending_cipher || !row.pending_expires_at || row.pending_expires_at <= now) return {ok:false,error:'setup_expired'};
    if (row.enrolled_at && !(await adminMfaVerified(request, env, userId))) return {ok:false,error:'mfa_required'};
    const secret = await openBox(row.pending_cipher,env.DATA_ENCRYPTION_KEY); const step = await matchedStep(secret,code);
    if (step === null) return {ok:false,error:'invalid_code'};
    const recovery = Array.from({length:8},()=>Array.from(crypto.getRandomValues(new Uint8Array(12)),b=>b.toString(16).padStart(2,'0')).join(''));
    const commands = [claimStatement(env.DB,`mfa-enroll:${userId}:${await fingerprint(row.pending_cipher)}`,userId,userId,
      'EXISTS(SELECT 1 FROM admin_mfa WHERE user_id = ? AND pending_cipher = ? AND pending_expires_at > ?)',[userId,row.pending_cipher,now]),
      env.DB.prepare('UPDATE admin_mfa SET secret_cipher = ?,pending_cipher = NULL,pending_expires_at = NULL,version = version + 1,last_step = ?,enrolled_at = ?,updated_at = ? WHERE user_id = ?').bind(row.pending_cipher,step,now,now,userId),
      env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id = ?').bind(userId),
      env.DB.prepare('UPDATE auth_sessions SET revoked_at = ? WHERE user_id = ? AND token_hash != ? AND revoked_at IS NULL').bind(now,userId,tokenHash),
      env.DB.prepare('UPDATE auth_sessions SET mfa_verified_at = ?,mfa_version = ? WHERE token_hash = ? AND user_id = ?').bind(now,row.version+1,tokenHash,userId),
      env.DB.prepare("INSERT INTO audit_logs(id,actor_id,action,target_type,target_id,created_at) VALUES (?,?, 'admin_mfa_enrolled','user',?,?)").bind(crypto.randomUUID(),userId,userId,now)];
    for (const item of recovery) commands.push(env.DB.prepare('INSERT INTO mfa_recovery_codes(user_id,code_hash) VALUES (?,?)').bind(userId,await fingerprint([userId,item])));
    await env.DB.batch(commands); await releaseSuccessfulAttempt(env.DB,key); return {ok:true,recoveryCodes:recovery};
  }
  if (!path.endsWith('/verify') || !row?.secret_cipher || !row.enrolled_at) return {ok:false,error:'mfa_required'};
  const secret = await openBox(row.secret_cipher,env.DATA_ENCRYPTION_KEY); const step = await matchedStep(secret,code);
  let claim: D1PreparedStatement; let consume: D1PreparedStatement;
  if (step !== null) {
    claim=claimStatement(env.DB,`mfa:${userId}:${row.version}:${step}`,userId,userId,'EXISTS(SELECT 1 FROM admin_mfa WHERE user_id = ? AND version = ? AND last_step < ?)',[userId,row.version,step]);
    consume=env.DB.prepare('UPDATE admin_mfa SET last_step = ? WHERE user_id = ? AND version = ?').bind(step,userId,row.version);
  } else if (/^[a-f0-9]{24}$/.test(code)) {
    const codeHash=await fingerprint([userId,code]);
    claim=claimStatement(env.DB,`mfa-recovery:${userId}:${codeHash}`,userId,userId,'EXISTS(SELECT 1 FROM mfa_recovery_codes WHERE user_id = ? AND code_hash = ? AND consumed_at IS NULL)',[userId,codeHash]);
    consume=env.DB.prepare('UPDATE mfa_recovery_codes SET consumed_at = ? WHERE user_id = ? AND code_hash = ?').bind(now,userId,codeHash);
  } else return {ok:false,error:'invalid_code'};
  try {
    await env.DB.batch([claim,consume,env.DB.prepare('UPDATE auth_sessions SET mfa_verified_at = ?,mfa_version = ? WHERE token_hash = ? AND user_id = ? AND revoked_at IS NULL').bind(now,row.version,tokenHash,userId)]);
    await releaseSuccessfulAttempt(env.DB,key); return {ok:true};
  } catch { return {ok:false,error:'invalid_code'}; }
}
