import fs from 'node:fs/promises';
import path from 'node:path';
export function deploymentMetadata(config,live={}){
 const desired=[
  ...(config.d1_databases??[]).map(b=>({name:b.binding,type:'d1',id:b.database_id})),
  ...(config.r2_buckets??[]).map(b=>({name:b.binding,type:'r2_bucket',bucket_name:b.bucket_name})),
  ...(config.kv_namespaces??[]).map(b=>({name:b.binding,type:'kv_namespace',namespace_id:b.id})),
  ...(config.services??[]).map(b=>({name:b.binding,type:'service',service:b.service,...(b.entrypoint?{entrypoint:b.entrypoint}:{})})),
  ...(config.send_email??[]).map(b=>({name:b.name,type:'send_email',...(b.allowed_destination_addresses?{allowed_destination_addresses:b.allowed_destination_addresses}:{})})),
  ...Object.entries(config.vars??{}).map(([name,value])=>({name,type:typeof value==='string'?'plain_text':'json',...(typeof value==='string'?{text:value}:{json:value})}))
 ];
 const names=new Set(desired.map(b=>b.name));const secretTypes=new Set(['secret_text','secret_key']);
 const preserved=(live.bindings??[]).filter(b=>!secretTypes.has(b.type)&&!names.has(b.name));
 const bindings=[...preserved,...desired];for(const b of bindings)if(!b.name||!b.type)throw new Error('invalid_binding');
 return{main_module:path.basename(config.main),compatibility_date:config.compatibility_date,compatibility_flags:config.compatibility_flags??[],bindings,keep_bindings:['secret_text','secret_key'],...(config.observability?{observability:config.observability}:{}),...(live.limits?{limits:live.limits}:{})};
}
export async function publishWorker(configPath){
 const token=process.env.CLOUDFLARE_DEPLOY_TOKEN;if(!token)throw new Error('deploy_token_unavailable');const config=JSON.parse(await fs.readFile(configPath,'utf8'));
 const base=`https://api.cloudflare.com/client/v4/accounts/${config.account_id}/workers/scripts/${config.name}`;const headers={authorization:`Bearer ${token}`};
 const settings=await fetch(base+'/settings',{headers});let live={};if(settings.status!==404){const data=await settings.json();if(!settings.ok||!data.success)throw new Error('settings_read_failed');live=data.result;}
 const metadata=deploymentMetadata(config,live);const entry=await fs.readFile(config.main);const form=new FormData();form.set('metadata',new Blob([JSON.stringify(metadata)],{type:'application/json'}));form.set(path.basename(config.main),new Blob([entry],{type:'application/javascript+module'}),path.basename(config.main));
 const result=await fetch(base,{method:'PUT',headers,body:form,signal:AbortSignal.timeout(360000)});const payload=await result.json();if(!result.ok||!payload.success)throw new Error('worker_publish_failed:'+JSON.stringify((payload.errors??[]).map(e=>({code:e.code,message:e.message}))));
 const after=await fetch(base+'/settings',{headers});const current=await after.json();if(!after.ok||!current.success)throw new Error('settings_verify_failed');
 const actual=new Map(current.result.bindings.map(b=>[b.name,b.type]));for(const b of [...(live.bindings??[]),...metadata.bindings])if(actual.get(b.name)!==b.type)throw new Error('binding_preservation_failed:'+b.name);
 console.log(JSON.stringify({cloudflare_worker_publish:'success',worker:config.name,version:payload.result?.id??null,bindings:current.result.bindings.map(b=>({name:b.name,type:b.type}))}));
 return payload.result;
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))publishWorker(process.argv[2]??'wrangler.jsonc').catch(e=>{console.error(e.message);process.exitCode=1;});
