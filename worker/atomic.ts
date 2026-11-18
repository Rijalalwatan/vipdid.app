export type SqlValue = string | number | null;
export type DatabaseEnv = { DB: D1Database };
const encoder = new TextEncoder();
export async function fingerprint(value: unknown) {
  const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(value))));
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}
/** A failed condition aborts and rolls back the entire D1 batch. Never OR IGNORE a CHECK. */
export function claimStatement(db: D1Database, key: string, actor: string | null, hash: string, condition = '1', values: SqlValue[] = []) {
  return db.prepare(`INSERT INTO atomic_operations (key, nonce, fingerprint, valid, actor_id, created_at)
    VALUES (?, ?, ?, CASE WHEN (${condition}) THEN 1 ELSE 0 END, ?, ?)`).bind(key, crypto.randomUUID(), hash, ...values, actor, Date.now());
}
export async function recordedOperation(db: D1Database, key: string, actor: string | null, hash: string) {
  const row = await db.prepare('SELECT fingerprint, actor_id FROM atomic_operations WHERE key = ?').bind(key).first<{ fingerprint: string; actor_id: string | null }>();
  return row ? row.fingerprint === hash && row.actor_id === actor ? 'same' : 'conflict' : 'new';
}
/** Counts are serialized in D1, not eventually-consistent KV. */
export async function reserveAttempt(db: D1Database, key: string, maximum: number, durationMs: number) {
  const now = Date.now();
  const row = await db.prepare(`INSERT INTO security_counters (key, attempts, expires_at) VALUES (?, 1, ?)
    ON CONFLICT(key) DO UPDATE SET attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
    expires_at = CASE WHEN expires_at <= ? THEN excluded.expires_at ELSE expires_at END
    WHERE expires_at <= ? OR attempts < ? RETURNING attempts`).bind(key, now + durationMs, now, now, now, maximum).first<{ attempts: number }>();
  return Boolean(row);
}
export async function releaseSuccessfulAttempt(db: D1Database, key: string) {
  await db.prepare('UPDATE security_counters SET attempts = MAX(0, attempts - 1) WHERE key = ?').bind(key).run();
}
export async function secretBox(value: string, keyMaterial: string) {
  if (!keyMaterial || keyMaterial.length < 32) throw new Error('encryption_unavailable');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`vipdid:encryption:v1:${keyMaterial}`));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['encrypt']);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, encoder.encode(value)));
  return JSON.stringify({ v: 1, iv: Array.from(iv), data: Array.from(ciphertext) });
}
export async function openBox(value: string, keyMaterial: string) {
  if (!keyMaterial || keyMaterial.length < 32) throw new Error('encryption_unavailable');
  const data = JSON.parse(value) as { v: number; iv: number[]; data: number[] };
  if (data.v !== 1) throw new Error('invalid_encryption_version');
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(`vipdid:encryption:v1:${keyMaterial}`));
  const key = await crypto.subtle.importKey('raw', digest, 'AES-GCM', false, ['decrypt']);
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: new Uint8Array(data.iv) }, key, new Uint8Array(data.data));
  return new TextDecoder().decode(plain);
}
