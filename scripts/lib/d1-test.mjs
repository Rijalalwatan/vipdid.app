import { DatabaseSync } from 'node:sqlite';
export class TestD1 {
  constructor(filename = ':memory:') { this.sqlite = new DatabaseSync(filename); this.sqlite.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;'); this.failure = null; }
  prepare(sql) {
    const db = this; let values = [];
    const execute = mode => {
      if (db.failure && sql.includes(db.failure)) { db.failure = null; throw new Error('injected_transaction_failure'); }
      if (values.some(v => typeof v === 'boolean' || v === undefined)) throw new Error('unsupported_D1_binding');
      const statement = db.sqlite.prepare(sql);
      if (mode === 'first') return statement.get(...values) ?? null;
      if (mode === 'all') return { success:true,results:statement.all(...values),meta:{changes:0} };
      const result=statement.run(...values);return {success:true,results:[],meta:{changes:Number(result.changes),last_row_id:Number(result.lastInsertRowid)}};
    };
    return { sql, bind(...args) {values=args;return this;}, async first(column){const row=execute('first');return column?row?.[column]??null:row;},async all(){return execute('all');},async run(){return execute('run');}, _execute(){return execute(/^\s*(SELECT|PRAGMA)/i.test(sql)?'all':'run');} };
  }
  async batch(statements) { this.sqlite.exec('BEGIN IMMEDIATE');try{const output=statements.map(s=>s._execute());this.sqlite.exec('COMMIT');return output;}catch(e){this.sqlite.exec('ROLLBACK');throw e;} }
  async exec(sql){this.sqlite.exec(sql);return {count:1,duration:0};}
}
export class TestR2 {
 constructor(){this.objects=new Map();}
 async put(key,value,options={}){const bytes=typeof value==='string'?new TextEncoder().encode(value):value instanceof ArrayBuffer?new Uint8Array(value):value;this.objects.set(key,{bytes:new Uint8Array(bytes),options});return {key};}
 async get(key){const item=this.objects.get(key);return item?{key,size:item.bytes.length,body:item.bytes,httpMetadata:item.options.httpMetadata??{},arrayBuffer:async()=>item.bytes.buffer,text:async()=>new TextDecoder().decode(item.bytes)}:null;}
 async head(key){return this.get(key);}
 async delete(keys){for(const key of Array.isArray(keys)?keys:[keys])this.objects.delete(key);}
 async list({prefix='',cursor}={}){return {objects:[...this.objects].filter(([k])=>k.startsWith(prefix)).map(([key,item])=>({key,size:item.bytes.length})),truncated:false,cursor};}
}
