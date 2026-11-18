import { fingerprint,secretBox } from './atomic';
import { retryErasure } from './privacy';
type Env={DB:D1Database;MEDIA:R2Bucket;BACKUPS?:R2Bucket;DATA_ENCRYPTION_KEY:string;ENVIRONMENT?:string};
const day=24*60*60*1000;
export async function runMaintenance(env:Env,deliver:(id:string)=>Promise<boolean>){
 if(env.ENVIRONMENT==='staging')return {skipped:true};
 const now=Date.now();
 // Remove expired credentials/challenges before sessions; preserve referenced device rows until unreferenced.
 await env.DB.batch([
  env.DB.prepare('DELETE FROM contact_changes WHERE expires_at<?').bind(now-day),
  env.DB.prepare('DELETE FROM auth_challenges WHERE expires_at<? AND id NOT IN (SELECT challenge_id FROM contact_changes)').bind(now-day),
  env.DB.prepare('DELETE FROM auth_sessions WHERE expires_at<? OR (revoked_at IS NOT NULL AND revoked_at<?)').bind(now-30*day,now-30*day),
  env.DB.prepare('DELETE FROM trusted_devices WHERE (expires_at<? OR (revoked_at IS NOT NULL AND revoked_at<?)) AND id NOT IN (SELECT trusted_device_id FROM auth_sessions WHERE trusted_device_id IS NOT NULL)').bind(now-30*day,now-30*day),
  env.DB.prepare('DELETE FROM security_counters WHERE expires_at<?').bind(now-day),
  env.DB.prepare("DELETE FROM custody_invitations WHERE status IN ('revoked','expired') AND expires_at<?").bind(now-90*day),
  env.DB.prepare("UPDATE custody_invitations SET status='expired' WHERE status='pending' AND expires_at<?").bind(now),
  env.DB.prepare("DELETE FROM delivery_outbox WHERE status='sent' AND sent_at<?").bind(now-30*day),
  env.DB.prepare("UPDATE delivery_outbox SET status='failed',last_error='retry_window_expired' WHERE status IN ('pending','sending') AND created_at<?").bind(now-23*60*60*1000),
  env.DB.prepare('UPDATE audit_logs SET ip_hash=NULL WHERE ip_hash IS NOT NULL AND created_at<?').bind(now-90*day),
  env.DB.prepare('DELETE FROM audit_logs WHERE created_at<? AND target_type NOT IN (\'privacy_request\',\'ledger_entry\',\'publish_request\')').bind(now-365*day)
 ]);
 await retryErasure(env);
 const rows=await env.DB.prepare("SELECT id FROM delivery_outbox WHERE (status='pending' OR (status='sending' AND lease_until<?)) AND next_attempt_at<=? AND attempts<8 ORDER BY created_at LIMIT 10").bind(now,now).all<{id:string}>();
 let delivered=0;for(const row of rows.results??[])if(await deliver(row.id))delivered++;
 const overdue=(await env.DB.prepare("SELECT COUNT(*) n FROM privacy_requests WHERE status IN ('pending','processing','extended') AND due_at<?").bind(now).first<{n:number}>())?.n??0;
 const failures=(await env.DB.prepare("SELECT COUNT(*) n FROM delivery_outbox WHERE status='failed'").first<{n:number}>())?.n??0;
 const backup=(await env.DB.prepare("SELECT completed_at FROM backup_runs WHERE status='completed' ORDER BY completed_at DESC LIMIT 1").first<{completed_at:number}>())?.completed_at??0;
 const conditions=[...(overdue?[{kind:'privacy_overdue',summary:`${overdue} personal-data request(s) exceeded the recorded deadline`}]:[]),...(failures?[{kind:'mail_delivery',summary:`${failures} notification(s) need delivery follow-up`}]:[]),...(backup&&backup<now-26*60*60*1000?[{kind:'backup_stale',summary:'A completed backup is older than 26 hours'}]:[])];
 for(const item of conditions){const id=crypto.randomUUID();const result=await env.DB.prepare("INSERT INTO operational_incidents(id,category,status,detected_at,summary) SELECT ?,?,'open',?,? WHERE NOT EXISTS(SELECT 1 FROM operational_incidents WHERE category=? AND status='open')").bind(id,item.kind,now,item.summary,item.kind).run();if(result.meta.changes){const body={to:'rijalalwatan.com@gmail.com',subject:'تنبيه تشغيلي — الهوية الرقمية',text:'توجد حالة تشغيلية تحتاج المتابعة في لوحة الإدارة. يرجى مراجعة سجل التنبيهات دون مشاركة بيانات الحسابات.'};await env.DB.prepare("INSERT INTO delivery_outbox(id,kind,payload_cipher,status,next_attempt_at,created_at) VALUES (?,'incident',?,'pending',?,?)").bind(`incident:${id}`,await secretBox(JSON.stringify(body),env.DATA_ENCRYPTION_KEY),now,now).run();await deliver(`incident:${id}`);}}
 return{delivered,overdue,failures,checkedAt:now};
}
export async function acknowledgeIncident(env:Env,userId:string,id:string,note:string){
 if(!note.trim())return{ok:false,error:'reason_required'};const now=Date.now();const changed=await env.DB.prepare("UPDATE operational_incidents SET status='acknowledged',controller_aware_at=COALESCE(controller_aware_at,?),acknowledged_by=?,actions=? WHERE id=? AND status='open'").bind(now,userId,note.slice(0,1000),id).run();return{ok:Boolean(changed.meta.changes)};
}
