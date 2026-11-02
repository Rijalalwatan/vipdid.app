export type MidpointEnv = { DB: D1Database };
export type MidpointUser = { id: string; permanent_id: string; wallet_balance: number };
export type MidpointOutcome = { ok: true; idempotent: boolean } | { ok: false; error: 'recipient_not_found' | 'insufficient_balance' | 'treasury_unavailable' | 'self_transfer' | 'ledger_failed' };

export const TREASURY_ACCOUNT = 'treasury';
export const REGISTRATION_REWARD = 100;
export const FIRST_PUBLICATION_REWARD = 1000;
export const DAY_REDEMPTION_COST = 100;

export function permanentIdOf(value: unknown) {
  const id = typeof value === 'string' ? value.trim().toUpperCase() : '';
  return /^C[1-9]\d{0,17}$/.test(id) ? id : null;
}

export function pointAmountOf(value: unknown, maximum = 100000000) {
  const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN;
  return Number.isSafeInteger(amount) && amount > 0 && amount <= maximum ? amount : null;
}

export function idempotencyOf(value: unknown, prefix: string) {
  return typeof value === 'string' && new RegExp(`^${prefix}_[a-z0-9-]{36}$`).test(value) ? value : null;
}

export function grantCategoryOf(value: unknown): 'seasonal' | 'exceptional' | 'activity' | null {
  return value === 'seasonal' || value === 'exceptional' || value === 'activity' ? value : null;
}

async function ledgerExists(env: MidpointEnv, key: string) {
  return Boolean(await env.DB.prepare('SELECT id FROM ledger_entries WHERE idempotency_key = ?').bind(key).first<{ id: string }>());
}

export async function activeUserById(env: MidpointEnv, userId: string) {
  return env.DB.prepare("SELECT id, permanent_id, wallet_balance FROM users WHERE id = ? AND status = 'active'").bind(userId).first<MidpointUser>();
}

export async function activeUserByPermanentId(env: MidpointEnv, permanentId: string) {
  return env.DB.prepare("SELECT id, permanent_id, wallet_balance FROM users WHERE permanent_id = ? AND status = 'active'").bind(permanentId).first<MidpointUser>();
}

export async function awardFromTreasury(env: MidpointEnv, recipientId: string, amount: number, txType: string, idempotencyKey: string, actorId: string | null, metadata: Record<string, unknown>): Promise<MidpointOutcome> {
  if (await ledgerExists(env, idempotencyKey)) return { ok: true, idempotent: true };
  if (!(await activeUserById(env, recipientId))) return { ok: false, error: 'recipient_not_found' };
  const now = Date.now();
  try {
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE system_settings SET value = CAST(value AS INTEGER) - ?, updated_at = ? WHERE key = 'treasury_balance' AND CAST(value AS INTEGER) >= ?").bind(amount, now, amount),
      env.DB.prepare('INSERT INTO ledger_entries (id, idempotency_key, from_account, to_account, amount, tx_type, metadata_json, actor_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1').bind(`ledger_${crypto.randomUUID()}`, idempotencyKey, TREASURY_ACCOUNT, recipientId, amount, txType, JSON.stringify(metadata), actorId, now),
      env.DB.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM ledger_entries WHERE idempotency_key = ?)').bind(amount, recipientId, idempotencyKey)
    ]);
    return result[0].meta.changes ? { ok: true, idempotent: false } : { ok: false, error: 'treasury_unavailable' };
  } catch {
    return (await ledgerExists(env, idempotencyKey)) ? { ok: true, idempotent: true } : { ok: false, error: 'ledger_failed' };
  }
}

export async function debitToTreasury(env: MidpointEnv, userId: string, amount: number, txType: string, idempotencyKey: string, metadata: Record<string, unknown>): Promise<MidpointOutcome> {
  if (await ledgerExists(env, idempotencyKey)) return { ok: true, idempotent: true };
  const now = Date.now();
  try {
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND status = 'active' AND wallet_balance >= ?").bind(amount, userId, amount),
      env.DB.prepare('INSERT INTO ledger_entries (id, idempotency_key, from_account, to_account, amount, tx_type, metadata_json, actor_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1').bind(`ledger_${crypto.randomUUID()}`, idempotencyKey, userId, TREASURY_ACCOUNT, amount, txType, JSON.stringify(metadata), userId, now),
      env.DB.prepare("UPDATE system_settings SET value = CAST(value AS INTEGER) + ?, updated_at = ? WHERE key = 'treasury_balance' AND EXISTS (SELECT 1 FROM ledger_entries WHERE idempotency_key = ?)").bind(amount, now, idempotencyKey)
    ]);
    return result[0].meta.changes ? { ok: true, idempotent: false } : { ok: false, error: 'insufficient_balance' };
  } catch {
    return (await ledgerExists(env, idempotencyKey)) ? { ok: true, idempotent: true } : { ok: false, error: 'ledger_failed' };
  }
}

export async function transferPoints(env: MidpointEnv, senderId: string, recipientId: string, amount: number, idempotencyKey: string): Promise<MidpointOutcome> {
  if (senderId === recipientId) return { ok: false, error: 'self_transfer' };
  if (await ledgerExists(env, idempotencyKey)) return { ok: true, idempotent: true };
  if (!(await activeUserById(env, recipientId))) return { ok: false, error: 'recipient_not_found' };
  const now = Date.now();
  try {
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND status = 'active' AND wallet_balance >= ?").bind(amount, senderId, amount),
      env.DB.prepare('INSERT INTO ledger_entries (id, idempotency_key, from_account, to_account, amount, tx_type, metadata_json, actor_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1').bind(`ledger_${crypto.randomUUID()}`, idempotencyKey, senderId, recipientId, amount, 'points_transfer', JSON.stringify({}), senderId, now),
      env.DB.prepare('UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? AND EXISTS (SELECT 1 FROM ledger_entries WHERE idempotency_key = ?)').bind(amount, recipientId, idempotencyKey)
    ]);
    return result[0].meta.changes ? { ok: true, idempotent: false } : { ok: false, error: 'insufficient_balance' };
  } catch {
    return (await ledgerExists(env, idempotencyKey)) ? { ok: true, idempotent: true } : { ok: false, error: 'ledger_failed' };
  }
}

export async function redeemDays(env: MidpointEnv, userId: string, days: number, idempotencyKey: string): Promise<MidpointOutcome> {
  const amount = days * DAY_REDEMPTION_COST;
  if (await ledgerExists(env, idempotencyKey)) return { ok: true, idempotent: true };
  const now = Date.now();
  try {
    const result = await env.DB.batch([
      env.DB.prepare("UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND status = 'active' AND wallet_balance >= ?").bind(amount, userId, amount),
      env.DB.prepare('INSERT INTO ledger_entries (id, idempotency_key, from_account, to_account, amount, tx_type, metadata_json, actor_id, created_at) SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE changes() = 1').bind(`ledger_${crypto.randomUUID()}`, idempotencyKey, userId, TREASURY_ACCOUNT, amount, 'day_redemption', JSON.stringify({ days }), userId, now),
      env.DB.prepare("UPDATE system_settings SET value = CAST(value AS INTEGER) + ?, updated_at = ? WHERE key = 'treasury_balance' AND EXISTS (SELECT 1 FROM ledger_entries WHERE idempotency_key = ?)").bind(amount, now, idempotencyKey),
      env.DB.prepare('INSERT INTO point_entitlements (user_id, active_days, updated_at) SELECT ?, ?, ? WHERE EXISTS (SELECT 1 FROM ledger_entries WHERE idempotency_key = ?) ON CONFLICT(user_id) DO UPDATE SET active_days = active_days + excluded.active_days, updated_at = excluded.updated_at').bind(userId, days, now, idempotencyKey)
    ]);
    return result[0].meta.changes ? { ok: true, idempotent: false } : { ok: false, error: 'insufficient_balance' };
  } catch {
    return (await ledgerExists(env, idempotencyKey)) ? { ok: true, idempotent: true } : { ok: false, error: 'ledger_failed' };
  }
}
