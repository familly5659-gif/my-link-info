import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { once } from 'node:events';

test('an existing database migrates in place and remains editable after repeated startup', async () => {
 const dir=mkdtempSync(join(tmpdir(),'moa-legacy-'));
 const db=new DatabaseSync(join(dir,'links.sqlite'));
 db.exec('CREATE TABLE links (id INTEGER PRIMARY KEY, title TEXT NOT NULL, summary TEXT NOT NULL, url TEXT NOT NULL, image TEXT NOT NULL, category TEXT NOT NULL, platform TEXT NOT NULL, created_at TEXT DEFAULT CURRENT_TIMESTAMP)');
 const url='https://link.coupang.com/a/legacy?affiliate=unchanged';
 db.prepare('INSERT INTO links (id,title,summary,url,image,category,platform) VALUES (?,?,?,?,?,?,?)').run(42,'기존 상품','기존 추천 글',url,'','살림·주방','쿠팡');
 db.close();
 let child;
 try {
  for(let run=0;run<2;run++) {
   child=spawn(process.execPath,['--use-env-proxy','server.js'],{env:{...process.env,PORT:'0',DATA_DIR:dir,ADMIN_KEY:'migration-test-key'},stdio:['ignore','pipe','pipe']});
   const [out]=await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Migration startup timed out')),5000).unref())]);
   const base=`http://127.0.0.1:${String(out).match(/port (\d+)/)[1]}`;
   const [record]=await(await fetch(base+'/api/links')).json();
   assert.equal(record.id,42);assert.equal(record.title,'기존 상품');assert.equal(record.summary,'기존 추천 글');assert.equal(record.url,url);
   assert.equal(record.category,'주방');assert.equal(record.subcategory,run===0?'기타':'수세미');
   if(run===0) {
    const response=await fetch(base+'/api/links/42',{method:'PUT',headers:{'Content-Type':'application/json',Authorization:'Bearer migration-test-key'},body:JSON.stringify({...record,subcategory:'수세미'})});
    assert.equal(response.status,200);
   }
   child.kill();await once(child,'exit');
  }
 } finally {
  if(child&&child.exitCode===null&&child.signalCode===null) {child.kill();await once(child,'exit');}
  rmSync(dir,{recursive:true,force:true});
 }
});
