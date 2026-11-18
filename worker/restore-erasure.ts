import { pointStatements,TREASURY_ACCOUNT } from './midpoint';
export async function applyRestoredErasure(db:D1Database,media:R2Bucket,m:{userId:string;mediaKeys:string[];deletedAt:number;retainedReason?:string;closureKey?:string}){
 const rows=await db.prepare("SELECT name FROM sqlite_schema WHERE type='table'").all<{name:string}>();const tables=new Set((rows.results??[]).map(v=>v.name));
 const columns=(await db.prepare('PRAGMA table_info(profiles)').all<{name:string}>()).results??[];const privacy=columns.some(c=>c.name==='privacy_hidden');
 const user=await db.prepare('SELECT wallet_balance,status FROM users WHERE id=?').bind(m.userId).first<{wallet_balance:number;status:string}>();
 if(!user)return;
 const commands:D1PreparedStatement[]=[];
 if(user.wallet_balance>0){if(tables.has('atomic_operations')&&user.status==='active')commands.push(...await pointStatements({DB:db},{from:m.userId,to:TREASURY_ACCOUNT,amount:user.wallet_balance,type:'restored_account_closure',key:m.closureKey??`restored-erasure:${m.userId}:${m.deletedAt}`,actor:m.userId,metadata:{erasureAppliedAt:m.deletedAt}}));else{commands.push(db.prepare("UPDATE system_settings SET value=CAST(value AS INTEGER)+? WHERE key='treasury_balance'").bind(user.wallet_balance),db.prepare('UPDATE users SET wallet_balance=0 WHERE id=?').bind(m.userId));}}
 commands.push(db.prepare("UPDATE users SET name='Deleted account',email=?,phone='',whatsapp='',pin_hash=NULL,pin_salt=NULL,role='user',status='suspended',email_verified_at=NULL,pin_set_at=NULL,is_managed=0,managed_by_user_id=NULL,custody_transfer_email=NULL,custody_token_hash=NULL,custody_token_expires=NULL,referred_by_permanent_id=NULL,terms_accepted_at=0,privacy_accepted_at=NULL,eligibility_acknowledged_at=NULL WHERE id=?").bind(`deleted-${crypto.randomUUID()}@deleted.invalid`,m.userId),
 db.prepare(`UPDATE profiles SET is_published=0,draft_json='{}',published_json=NULL,storage_used_bytes=0,images_count=0${privacy?',privacy_hidden=1,published_contact_json=NULL':''} WHERE user_id=?`).bind(m.userId),
 db.prepare(`UPDATE publish_requests SET submitted_payload_json='{}',review_note=NULL,status=CASE WHEN status='pending' THEN 'rejected' ELSE status END${privacy?',submitted_contact_json=NULL':''} WHERE user_id=?`).bind(m.userId));
 for(const table of ['contact_changes','notifications','auth_challenges','auth_sessions','trusted_devices','mfa_recovery_codes','admin_mfa','moderator_assignments','delivery_outbox'])if(tables.has(table))commands.push(db.prepare(`DELETE FROM ${table} WHERE user_id=?`).bind(m.userId));
 if(tables.has('media_assets'))commands.push(db.prepare('DELETE FROM media_assets WHERE user_id=?').bind(m.userId));
 if(tables.has('point_grant_requests'))commands.push(db.prepare("UPDATE point_grant_requests SET request_reason='',reviewer_reason=NULL,status=CASE WHEN status='pending' THEN 'rejected' ELSE status END WHERE user_id=?").bind(m.userId));
 if(tables.has('privacy_requests'))commands.push(db.prepare("UPDATE privacy_requests SET details='' WHERE user_id=?").bind(m.userId));
 if(tables.has('audit_logs'))commands.push(db.prepare('UPDATE audit_logs SET details_json=NULL,ip_hash=NULL WHERE actor_id=? OR target_id=? OR target_id IN (SELECT id FROM publish_requests WHERE user_id=?)').bind(m.userId,m.userId,m.userId));
 if(tables.has('custody_invitations'))commands.push(db.prepare("UPDATE custody_invitations SET recipient_email='deleted@deleted.invalid',status='revoked' WHERE subject_user_id=?").bind(m.userId));
 await db.batch(commands);if(m.mediaKeys?.length)await media.delete(m.mediaKeys);
}
