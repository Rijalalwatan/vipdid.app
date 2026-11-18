import { fingerprint } from './atomic';
export type MidpointEnv = { DB: D1Database };
export type MidpointUser = { id: string; permanent_id: string; wallet_balance: number };
export type MidpointOutcome = { ok: true; idempotent: boolean } | { ok: false; error: 'recipient_not_found' | 'insufficient_balance' | 'treasury_unavailable' | 'self_transfer' | 'ledger_failed' | 'idempotency_conflict' };
export const TREASURY_ACCOUNT = 'treasury';
export const REGISTRATION_REWARD = 100;
export const FIRST_PUBLICATION_REWARD = 1000;
export const DAY_REDEMPTION_COST = 100;
export function permanentIdOf(value: unknown) { const id = typeof value === 'string' ? value.trim().toUpperCase() : ''; return /^C[1-9]\d{0,17}$/.test(id) ? id : null; }
export function pointAmountOf(value: unknown, maximum = 100000000) { const amount = typeof value === 'number' ? value : typeof value === 'string' ? Number(value) : NaN; return Number.isSafeInteger(amount) && amount > 0 && amount <= maximum ? amount : null; }
export function idempotencyOf(value: unknown, prefix: string) { return typeof value === 'string' && new RegExp(`^${prefix}_[a-z0-9-]{36}$`).test(value) ? value : null; }
export function grantCategoryOf(value: unknown): 'seasonal' | 'exceptional' | 'activity' | null { return value === 'seasonal' || value === 'exceptional' || value === 'activity' ? value : null; }
export async function activeUserById(env: MidpointEnv, userId: string) { return env.DB.prepare("SELECT id, permanent_id, wallet_balance FROM users WHERE id = ? AND status = 'active'").bind(userId).first<MidpointUser>(); }
export async function activeUserByPermanentId(env: MidpointEnv, permanentId: string) { return env.DB.prepare("SELECT id, permanent_id, wallet_balance FROM users WHERE permanent_id = ? AND status = 'active'").bind(permanentId).first<MidpointUser>(); }

type PointMovement = { from: string; to: string; amount: number; type: string; key: string; actor: string | null; metadata: Record<string, unknown>; days?: number };
type LedgerRow = { from_account: string; to_account: string; amount: number; tx_type: string; actor_id: string | null; metadata_json: string | null };
async function existingMovement(env: MidpointEnv, movement: PointMovement) {
  const row = await env.DB.prepare('SELECT from_account, to_account, amount, tx_type, actor_id, metadata_json FROM ledger_entries WHERE idempotency_key = ?').bind(movement.key).first<LedgerRow>();
  if (!row) return 'new';
  let metadata: unknown; try { metadata = JSON.parse(row.metadata_json ?? '{}'); } catch { return 'conflict'; }
  const current = await fingerprint([row.from_account, row.to_account, row.amount, row.tx_type, row.actor_id, metadata]);
  const requested = await fingerprint([movement.from, movement.to, movement.amount, movement.type, movement.actor, movement.metadata]);
  return current === requested ? 'same' : 'conflict';
}
/** Each effect is guarded by THIS transaction's random nonce, never by an old ledger key.
 * The CHECK aborts the whole batch on insufficient funds or an invalid recipient.
 * Can be joined into the registration, publication or grant decision transaction. */
export async function pointStatements(env: MidpointEnv, movement: PointMovement) {
  if (!Number.isSafeInteger(movement.amount) || movement.amount <= 0 || movement.from === movement.to) throw new Error('invalid_movement');
  const { from, to, amount, key, actor, type, metadata } = movement;
  const nonce = crypto.randomUUID(); const now = Date.now(); const operationKey = `point:${key}`;
  const hash = await fingerprint([from, to, amount, type, actor, metadata]);
  const sourceCondition = from === TREASURY_ACCOUNT
    ? "EXISTS(SELECT 1 FROM system_settings WHERE key = 'treasury_balance' AND CAST(value AS INTEGER) >= ?)"
    : "EXISTS(SELECT 1 FROM users WHERE id = ? AND status = 'active' AND wallet_balance >= ?)";
  const targetCondition = to === TREASURY_ACCOUNT
    ? "EXISTS(SELECT 1 FROM system_settings WHERE key = 'treasury_balance' AND CAST(value AS INTEGER) <= 9007199254740991 - ?)"
    : "EXISTS(SELECT 1 FROM users WHERE id = ? AND status = 'active' AND wallet_balance <= 9007199254740991 - ?)";
  const guard = 'EXISTS(SELECT 1 FROM atomic_operations WHERE key = ? AND nonce = ?)';
  const statements = [env.DB.prepare(`INSERT INTO atomic_operations(key, nonce, fingerprint, valid, actor_id, created_at)
    SELECT ?, ?, ?, CASE WHEN (${sourceCondition}) AND (${targetCondition}) THEN 1 ELSE 0 END, ?, ?
    WHERE NOT EXISTS(SELECT 1 FROM ledger_entries WHERE idempotency_key = ?)
    AND NOT EXISTS(SELECT 1 FROM atomic_operations WHERE key = ?)`).bind(operationKey, nonce, hash,
      ...(from === TREASURY_ACCOUNT ? [amount] : [from, amount]), ...(to === TREASURY_ACCOUNT ? [amount] : [to, amount]), actor, now, key, operationKey)];
  if (from === TREASURY_ACCOUNT) statements.push(env.DB.prepare(`UPDATE system_settings SET value = CAST(value AS INTEGER) - ?, updated_at = ? WHERE key = 'treasury_balance' AND ${guard}`).bind(amount, now, operationKey, nonce));
  else statements.push(env.DB.prepare(`UPDATE users SET wallet_balance = wallet_balance - ? WHERE id = ? AND ${guard}`).bind(amount, from, operationKey, nonce));
  statements.push(env.DB.prepare(`INSERT INTO ledger_entries(id, idempotency_key, from_account, to_account, amount, tx_type, metadata_json, actor_id, created_at)
    SELECT ?, ?, ?, ?, ?, ?, ?, ?, ? WHERE ${guard}`).bind(`ledger_${crypto.randomUUID()}`, key, from, to, amount, type, JSON.stringify(metadata), actor, now, operationKey, nonce));
  if (to === TREASURY_ACCOUNT) statements.push(env.DB.prepare(`UPDATE system_settings SET value = CAST(value AS INTEGER) + ?, updated_at = ? WHERE key = 'treasury_balance' AND ${guard}`).bind(amount, now, operationKey, nonce));
  else statements.push(env.DB.prepare(`UPDATE users SET wallet_balance = wallet_balance + ? WHERE id = ? AND ${guard}`).bind(amount, to, operationKey, nonce));
  if (movement.days) statements.push(env.DB.prepare(`INSERT INTO point_entitlements(user_id, active_days, updated_at)
    SELECT ?, ?, ? WHERE ${guard} ON CONFLICT(user_id) DO UPDATE SET active_days = active_days + excluded.active_days, updated_at = excluded.updated_at`).bind(from, movement.days, now, operationKey, nonce));
  return statements;
}
export async function awardStatements(env: MidpointEnv, recipient: string, amount: number, type: string, key: string, actor: string | null, metadata: Record<string, unknown>) {
  return pointStatements(env, { from: TREASURY_ACCOUNT, to: recipient, amount, type, key, actor, metadata });
}
async function applyMovement(env: MidpointEnv, movement: PointMovement): Promise<MidpointOutcome> {
  const old = await existingMovement(env, movement);
  if (old === 'same') return { ok: true, idempotent: true };
  if (old === 'conflict') return { ok: false, error: 'idempotency_conflict' };
  try {
    const results = await env.DB.batch(await pointStatements(env, movement));
    if (await existingMovement(env, movement) !== 'same') return { ok: false, error: 'idempotency_conflict' };
    return { ok: true, idempotent: !results[0].meta.changes };
  } catch {
    const after = await existingMovement(env, movement);
    if (after === 'same') return { ok: true, idempotent: true };
    if (after === 'conflict') return { ok: false, error: 'idempotency_conflict' };
    if (movement.to !== TREASURY_ACCOUNT && !(await activeUserById(env, movement.to))) return { ok: false, error: 'recipient_not_found' };
    return { ok: false, error: movement.from === TREASURY_ACCOUNT ? 'treasury_unavailable' : 'insufficient_balance' };
  }
}
export function awardFromTreasury(env: MidpointEnv, recipientId: string, amount: number, txType: string, idempotencyKey: string, actorId: string | null, metadata: Record<string, unknown>) {
  return applyMovement(env, { from: TREASURY_ACCOUNT, to: recipientId, amount, type: txType, key: idempotencyKey, actor: actorId, metadata });
}
export function debitToTreasury(env: MidpointEnv, userId: string, amount: number, txType: string, idempotencyKey: string, metadata: Record<string, unknown>) {
  return applyMovement(env, { from: userId, to: TREASURY_ACCOUNT, amount, type: txType, key: idempotencyKey, actor: userId, metadata });
}
export async function transferPoints(env: MidpointEnv, senderId: string, recipientId: string, amount: number, idempotencyKey: string): Promise<MidpointOutcome> {
  if (senderId === recipientId) return { ok: false, error: 'self_transfer' };
  return applyMovement(env, { from: senderId, to: recipientId, amount, type: 'points_transfer', key: idempotencyKey, actor: senderId, metadata: {} });
}
export function redeemDays(env: MidpointEnv, userId: string, days: number, idempotencyKey: string) {
  return applyMovement(env, { from: userId, to: TREASURY_ACCOUNT, amount: days * DAY_REDEMPTION_COST, type: 'day_redemption', key: idempotencyKey, actor: userId, metadata: { days }, days });
}
