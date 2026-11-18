import { claimStatement, fingerprint, openBox, secretBox } from './atomic';
import { pointStatements, TREASURY_ACCOUNT } from './midpoint';
export type PrivacyEnv = { DB: D1Database; MEDIA: R2Bucket; BACKUPS?: R2Bucket; DATA_ENCRYPTION_KEY: string };
export type PrivacyUser = { id: string; role: string; name: string };
const day=24*60*60*1000;
const clean=(v:unknown,max=1000)=>typeof v==='string'?v.trim().slice(0,max):'';
const encode=(bytes:Uint8Array)=>{let out='';for(const b of bytes)out+=String.fromCharCode(b);return btoa(out);};
export async function privacyOverview(env:PrivacyEnv,userId:string){
 const user=await env.DB.prepare('SELECT name,email,phone,whatsapp FROM users WHERE id=?').bind(userId).first();
 const requests=await env.DB.prepare('SELECT id,kind,status,details,response_note,requested_at,due_at,completed_at FROM privacy_requests WHERE user_id=? ORDER BY requested_at DESC LIMIT 20').bind(userId).all();
 const profile=await env.DB.prepare('SELECT privacy_hidden FROM profiles WHERE user_id=?').bind(userId).first<{privacy_hidden:number}>();
 return {ok:true,contact:user,hidden:Boolean(profile?.privacy_hidden),requests:requests.results??[]};
}
export async function exportOwnData(env:PrivacyEnv,userId:string){
 const user=await env.DB.prepare('SELECT permanent_id,name,email,phone,whatsapp,created_at,email_verified_at,terms_accepted_at,privacy_accepted_at,eligibility_acknowledged_at,wallet_balance,referred_by_permanent_id FROM users WHERE id=?').bind(userId).first();
 const profiles=await env.DB.prepare('SELECT slug,draft_slug,is_published,draft_json,published_json,updated_at,created_at FROM profiles WHERE user_id=?').bind(userId).all();
 const requests=await env.DB.prepare('SELECT status,submitted_payload_json,submitted_slug,review_note,submitted_at,reviewed_at FROM publish_requests WHERE user_id=?').bind(userId).all();
 const consents=await env.DB.prepare('SELECT kind,policy_version,created_at FROM consent_events WHERE user_id=?').bind(userId).all();
 const ledger=await env.DB.prepare('SELECT amount,tx_type,created_at,from_account,to_account FROM ledger_entries WHERE from_account=? OR to_account=? ORDER BY created_at').bind(userId,userId).all();
 const grants=await env.DB.prepare('SELECT status,request_reason,awarded_amount,reviewer_reason,requested_at,reviewed_at FROM point_grant_requests WHERE user_id=?').bind(userId).all();
 const entitlements=await env.DB.prepare('SELECT active_days,updated_at FROM point_entitlements WHERE user_id=?').bind(userId).first();
 const sessions=await env.DB.prepare('SELECT created_at,expires_at,last_seen_at,revoked_at FROM auth_sessions WHERE user_id=?').bind(userId).all();
 const devices=await env.DB.prepare('SELECT created_at,expires_at,last_used_at,revoked_at FROM trusted_devices WHERE user_id=?').bind(userId).all();
 const privacy=await env.DB.prepare('SELECT kind,status,details,response_note,requested_at,due_at,completed_at FROM privacy_requests WHERE user_id=?').bind(userId).all();
 const media=await env.DB.prepare('SELECT id,category,r2_key,size_bytes,created_at FROM media_assets WHERE user_id=?').bind(userId).all<{id:string;category:string;r2_key:string;size_bytes:number;created_at:number}>();
 const images=[];for(const m of media.results??[]){const object=await env.MEDIA.get(m.r2_key);images.push({category:m.category,createdAt:m.created_at,sizeBytes:m.size_bytes,contentType:'image/webp',base64:object?encode(new Uint8Array(await object.arrayBuffer())):null});}
 // Tokens, credential hashes, third-party personal identities, and operational secrets are never exported.
 const entries=(ledger.results??[]).map(v=>{const r=v as Record<string,unknown>;return{amount:r.amount,type:r.tx_type,createdAt:r.created_at,direction:r.to_account===userId?'incoming':'outgoing'};});
 return {format:'vipdid-personal-data-v1',generatedAt:new Date().toISOString(),account:user,profiles:profiles.results,publicationRequests:requests.results,consents:consents.results,points:{entries,grants:grants.results,entitlements},sessions:sessions.results,devices:devices.results,privacyRequests:privacy.results,images};
}
export async function privacyRequest(env:PrivacyEnv,user:PrivacyUser,input:Record<string,unknown>){
 const kind=clean(input.kind);const details=clean(input.details,1000);const key=clean(input.idempotencyKey,120);
 if(!['copy','correction','withdrawal','deletion'].includes(kind)||!/^privacy_[a-z0-9-]{36}$/.test(key))return {ok:false,error:'invalid_input'};
 const actor=await env.DB.prepare('SELECT tenant_id FROM users WHERE id=?').bind(user.id).first<{tenant_id:string}>();if(!actor)return{ok:false,error:'unauthorized'};
 const id=`privacy_${crypto.randomUUID()}`;const now=Date.now();const hash=await fingerprint([user.id,kind,details]);
 const old=await env.DB.prepare('SELECT fingerprint,actor_id FROM atomic_operations WHERE key=?').bind(key).first<{fingerprint:string;actor_id:string}>();
 if(old&& (old.actor_id!==user.id||old.fingerprint!==hash))return{ok:false,error:'idempotency_conflict'};
 if(!old){const completed=kind==='copy'||kind==='withdrawal';const commands=[claimStatement(env.DB,key,user.id,hash),
   env.DB.prepare('INSERT INTO privacy_requests(id,user_id,tenant_id,kind,status,details,requested_at,due_at,completed_at,response_note) VALUES (?,?,?,?,?,?,?,?,?,?)').bind(id,user.id,actor.tenant_id,kind,completed?'completed':'pending',details,now,now+30*day,completed?now:null,kind==='withdrawal'?(input.locale==='en'?'Public-profile visibility consent withdrawn':'سُحبت الموافقة على عرض الملف العام'):null),
   env.DB.prepare("INSERT INTO audit_logs(id,tenant_id,actor_id,action,target_type,target_id,created_at) VALUES (?,?,?,'privacy_request_created','privacy_request',?,?)").bind(crypto.randomUUID(),actor.tenant_id,user.id,id,now)];
   if(kind==='withdrawal'||kind==='deletion')commands.push(env.DB.prepare('UPDATE profiles SET privacy_hidden=1,updated_at=? WHERE user_id=?').bind(now,user.id));
   if(kind==='withdrawal')commands.push(env.DB.prepare('INSERT INTO consent_events(id,user_id,actor_id,kind,policy_version,created_at) VALUES (?,?,?,?,?,?)').bind(crypto.randomUUID(),user.id,user.id,'public_visibility_withdrawal','2026-11-18',now));
   try{await env.DB.batch(commands);}catch{return{ok:false,error:'request_unavailable'};}
 }
 return {ok:true,...(kind==='copy'?{export:await exportOwnData(env,user.id)}:{})};
}
export async function reviewPrivacyRequests(env:PrivacyEnv){
 const rows=await env.DB.prepare("SELECT r.id,r.kind,r.status,r.details,r.requested_at,r.due_at,r.response_note,u.name,u.permanent_id FROM privacy_requests r JOIN users u ON u.id=r.user_id WHERE r.status IN ('pending','processing','extended') ORDER BY r.due_at LIMIT 50").all();return{ok:true,requests:rows.results??[]};
}
export async function decidePrivacyRequest(env:PrivacyEnv,actor:PrivacyUser,id:string,input:Record<string,unknown>){
 const row=await env.DB.prepare('SELECT id,user_id,tenant_id,kind,status,due_at,extended_at FROM privacy_requests WHERE id=?').bind(id).first<{id:string;user_id:string;tenant_id:string;kind:string;status:string;due_at:number;extended_at:number|null}>();
 if(!row)return{ok:false,error:'not_found'};if(row.status==='processing')return{ok:false,error:'erasure_in_progress'};if(!['pending','extended'].includes(row.status))return{ok:false,error:'decision_recorded'};
 const decision=clean(input.decision);const note=clean(input.note,1000);const hold=clean(input.retentionReason,800);const now=Date.now();
 if(!note||!['complete','extend','reject'].includes(decision))return{ok:false,error:'reason_required'};
 if(decision==='extend'&&(row.extended_at||now>=row.due_at))return{ok:false,error:'extension_not_allowed'};
 if(decision==='complete'&&row.kind==='deletion'){
  const target=await env.DB.prepare('SELECT role,wallet_balance FROM users WHERE id=?').bind(row.user_id).first<{role:string;wallet_balance:number}>();
  if(!target||target.role==='super_admin'||await env.DB.prepare("SELECT 1 FROM tenants WHERE owner_user_id=? AND tenant_type='partner' AND status='active'").bind(row.user_id).first())return{ok:false,error:'owner_transfer_required'};
  const hasLedger=await env.DB.prepare('SELECT 1 FROM ledger_entries WHERE from_account=? OR to_account=? LIMIT 1').bind(row.user_id,row.user_id).first();if(hasLedger&&!hold)return{ok:false,error:'retention_reason_required'};
  const media=await env.DB.prepare('SELECT r2_key FROM media_assets WHERE user_id=?').bind(row.user_id).all<{r2_key:string}>();const keys=(media.results??[]).map(v=>v.r2_key);
  const erasureId=await fingerprint(['erasure',row.user_id]);const erasurePayload={state:'prepared',decisionId:id,userId:row.user_id,mediaKeys:keys,deletedAt:now,closureKey:`closure:${id}`,retainedReason:hold||null};const manifest=await secretBox(JSON.stringify(erasurePayload),env.DATA_ENCRYPTION_KEY);
  if(!env.BACKUPS)return{ok:false,error:'backup_protection_unavailable'};
  // Write the independent erasure manifest BEFORE deleting live data. Restore must apply it.
  await env.BACKUPS.put(`erasures/${erasureId}.enc`,manifest,{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private,no-store'}});
  const commands=[claimStatement(env.DB,`privacy-decision:${id}`,actor.id,await fingerprint([actor.id,decision,note,hold]),"EXISTS(SELECT 1 FROM privacy_requests WHERE id=? AND status IN ('pending','extended'))",[id])];
  if(target.wallet_balance>0)commands.push(...await pointStatements(env,{from:row.user_id,to:TREASURY_ACCOUNT,amount:target.wallet_balance,type:'account_closure',key:`closure:${id}`,actor:row.user_id,metadata:{requestId:id}}));
  commands.push(env.DB.prepare('INSERT INTO deletion_tombstones(subject_hash,user_id,approved_by,retained_reason,deleted_at) VALUES (?,?,?,?,?) ON CONFLICT(subject_hash) DO NOTHING').bind(erasureId,row.user_id,actor.id,hold||null,now),
   env.DB.prepare("UPDATE users SET name='Deleted account',email=?,phone='',whatsapp='',pin_hash=NULL,pin_salt=NULL,role='user',status='suspended',email_verified_at=NULL,pin_set_at=NULL,is_managed=0,managed_by_user_id=NULL,custody_transfer_email=NULL,custody_token_hash=NULL,custody_token_expires=NULL,referred_by_permanent_id=NULL,terms_accepted_at=0,privacy_accepted_at=NULL,eligibility_acknowledged_at=NULL WHERE id=?").bind(`deleted-${crypto.randomUUID()}@deleted.invalid`,row.user_id),
   env.DB.prepare("UPDATE profiles SET is_published=0,privacy_hidden=1,draft_json='{}',published_json=NULL,published_contact_json=NULL,published_version_id=NULL,storage_used_bytes=0,images_count=0,updated_at=? WHERE user_id=?").bind(now,row.user_id),
   env.DB.prepare("UPDATE publish_requests SET submitted_payload_json='{}',submitted_contact_json=NULL,review_note=NULL,status=CASE WHEN status='pending' THEN 'rejected' ELSE status END WHERE user_id=?").bind(row.user_id),
   env.DB.prepare('DELETE FROM notifications WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM media_assets WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM contact_changes WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM auth_challenges WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM auth_sessions WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM trusted_devices WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM admin_mfa WHERE user_id=?').bind(row.user_id),env.DB.prepare('DELETE FROM mfa_recovery_codes WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM moderator_assignments WHERE user_id=?').bind(row.user_id),
   env.DB.prepare('DELETE FROM delivery_outbox WHERE user_id=?').bind(row.user_id),
   env.DB.prepare("UPDATE custody_invitations SET recipient_email='deleted@deleted.invalid',status='revoked' WHERE subject_user_id=?").bind(row.user_id),
   env.DB.prepare("UPDATE point_grant_requests SET request_reason='',reviewer_reason=NULL,status=CASE WHEN status='pending' THEN 'rejected' ELSE status END WHERE user_id=?").bind(row.user_id),
   env.DB.prepare("UPDATE audit_logs SET details_json=NULL,ip_hash=NULL WHERE actor_id=? OR target_id=?").bind(row.user_id,row.user_id),
   env.DB.prepare("UPDATE privacy_requests SET status='processing',details='',response_note=?,reviewer_id=?,legal_hold_reason=? WHERE id=?").bind(note,actor.id,hold||null,id));
  try{await env.DB.batch(commands);}catch{return{ok:false,error:'erasure_unavailable'};}
  let deleted=true;try{await env.BACKUPS.put(`erasures/${erasureId}.enc`,await secretBox(JSON.stringify({...erasurePayload,state:'committed'}),env.DATA_ENCRYPTION_KEY),{httpMetadata:{contentType:'application/octet-stream',cacheControl:'private,no-store'}});if(keys.length)await env.MEDIA.delete(keys);}catch{deleted=false;}
  if(deleted)await env.DB.prepare("UPDATE privacy_requests SET status='completed',completed_at=? WHERE id=?").bind(Date.now(),id).run();
  return{ok:true,pendingErasure:!deleted};
 }
 const status=decision==='extend'?'extended':decision==='reject'?'rejected':'completed';
 try{await env.DB.batch([claimStatement(env.DB,`privacy-decision:${id}:${decision}`,actor.id,await fingerprint([decision,note]),"EXISTS(SELECT 1 FROM privacy_requests WHERE id=? AND status IN ('pending','extended'))",[id]),
  env.DB.prepare('UPDATE privacy_requests SET status=?,response_note=?,reviewer_id=?,due_at=?,extended_at=?,completed_at=? WHERE id=?').bind(status,note,actor.id,decision==='extend'?row.due_at+30*day:row.due_at,decision==='extend'?now:row.extended_at,decision==='extend'?null:now,id)]);return{ok:true};}catch{return{ok:false,error:'decision_unavailable'};}
}
export async function retryErasure(env:PrivacyEnv){
 if(!env.BACKUPS)return;
 const rows=await env.DB.prepare("SELECT id,user_id FROM privacy_requests WHERE kind='deletion' AND status='processing' LIMIT 10").all<{id:string;user_id:string}>();
 for(const r of rows.results??[]){try{const object=await env.BACKUPS.get(`erasures/${await fingerprint(['erasure',r.user_id])}.enc`);if(!object)continue;const manifest=JSON.parse(await openBox(await object.text(),env.DATA_ENCRYPTION_KEY));const approved=await env.DB.prepare('SELECT deleted_at FROM deletion_tombstones WHERE user_id=?').bind(r.user_id).first<{deleted_at:number}>();if(!approved||approved.deleted_at!==manifest.deletedAt)continue;if(manifest.state!=='committed')await env.BACKUPS.put(object.key,await secretBox(JSON.stringify({...manifest,state:'committed'}),env.DATA_ENCRYPTION_KEY));if(manifest.mediaKeys?.length)await env.MEDIA.delete(manifest.mediaKeys);await env.DB.prepare("UPDATE privacy_requests SET status='completed',completed_at=? WHERE id=? AND status='processing'").bind(Date.now(),r.id).run();}catch{/* durable processing status retains the retry */}}
}
