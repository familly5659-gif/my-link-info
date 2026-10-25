import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
const dir=mkdtempSync(join(tmpdir(),'moa-test-'));
let child, base, key;
before(async()=>{
 child=spawn(process.execPath,['--use-env-proxy','server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'0',ADMIN_KEY:''},stdio:['ignore','pipe','pipe']});
 const output=await Promise.race([once(child.stdout,'data'),new Promise((_,reject)=>setTimeout(()=>reject(new Error('Server did not start')),5000).unref())]);
 base=`http://127.0.0.1:${String(output[0]).match(/port (\d+)/)[1]}`;
 key=readFileSync(join(dir,'admin-key'),'utf8').trim();
});
after(async()=>{if(child.exitCode===null){child.kill();await once(child,'exit')}rmSync(dir,{recursive:true,force:true})});
const request=(path,method='GET',value,auth=key)=>fetch(base+path,{method,headers:{Authorization:`Bearer ${auth}`,'Content-Type':'application/json'},body:value?JSON.stringify(value):undefined});
const item={title:'테스트 머그컵',summary:'매일 쓰기 좋은 컵',url:'https://link.coupang.com/a/example?affiliate=keep',image:'',category:'살림·주방'};
test('public page and empty persistent collection',async()=>{
 const page=await request('/');assert.equal(page.status,200);assert.match(await page.text(),/aria-label="상품 검색"/);
 assert.deepEqual(await(await request('/api/links')).json(),[]);
});
test('mutation requires administrator authentication',async()=>{
 assert.equal((await request('/api/links','POST',item,'wrong')).status,401);
 assert.equal((await request('/api/auth','POST',{},key)).status,200);
});
test('create, update, preserve affiliate URL, and delete',async()=>{
 assert.equal((await request('/api/links','POST',item)).status,200);
 let records=await(await request('/api/links')).json();assert.equal(records.length,1);assert.equal(records[0].url,item.url);assert.equal(records[0].platform,'쿠팡');
 const id=records[0].id;
 assert.equal((await request(`/api/links/${id}`,'PUT',{...item,title:'수정한 상품'})).status,200);
 records=await(await request('/api/links')).json();assert.equal(records[0].title,'수정한 상품');
 assert.equal((await request(`/api/links/${id}`,'DELETE')).status,200);
 assert.deepEqual(await(await request('/api/links')).json(),[]);
});
test('reject unsafe URLs, unsupported hosts, invalid categories and large inputs',async()=>{
 for(const url of ['http://link.coupang.com/a','https://coupang.com.evil.test','https://127.0.0.1','javascript:alert(1)','https://user:pw@coupang.com','https://coupang.com:444/'])assert.equal((await request('/api/links','POST',{...item,url})).status,400);
 assert.equal((await request('/api/links','POST',{...item,category:'oops'})).status,400);
 assert.equal((await request('/api/links','POST',{...item,image:'javascript:alert(1)'})).status,400);
 assert.equal((await request('/api/links','POST',{...item,summary:'x'.repeat(21000)})).status,400);
});
test('metadata endpoint refuses private-network destinations before fetching',async()=>{
 const res=await request('/api/metadata','POST',{url:'https://127.0.0.1/secret'});assert.equal(res.status,400);assert.match((await res.json()).error,/지원하는/);
});
test('unknown routes and missing update target report 404',async()=>{
 assert.equal((await request('/no-such-file')).status,404);
 assert.equal((await request('/api/links/99999','PUT',item)).status,404);
});

test('saved products survive a server restart',async()=>{
 await request('/api/links','POST',item);
 child.kill();await once(child,'exit');
 child=spawn(process.execPath,['--use-env-proxy','server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'0',ADMIN_KEY:''},stdio:['ignore','pipe','pipe']});
 const [output]=await once(child.stdout,'data');base=`http://127.0.0.1:${String(output).match(/port (\d+)/)[1]}`;
 const records=await(await request('/api/links')).json();assert.equal(records.length,1);assert.equal(records[0].url,item.url);
 assert.equal((await request('/api/auth','POST',{},key)).status,200);
});

test('thumbnail route serves a retained image and refuses untrusted proxy hosts',async()=>{
 const image='https://scontent-ber1-1.cdninstagram.com/test-image.png';
 const cache=join(dir,'thumbnails');mkdirSync(cache,{recursive:true});
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jR9sAAAAASUVORK5CYII=','base64');
 writeFileSync(join(cache,createHash('sha256').update(image).digest('hex')),png);
 await request('/api/links','POST',{...item,image});
 const [saved]=await(await request('/api/links')).json();
 const result=await request(`/thumbnail/${saved.id}`);assert.equal(result.status,200);assert.equal(result.headers.get('content-type'),'image/png');assert.deepEqual(Buffer.from(await result.arrayBuffer()),png);
 await request(`/api/links/${saved.id}`,'PUT',{...item,image:'https://127.0.0.1/image.jpg'});
 assert.equal((await request(`/thumbnail/${saved.id}`)).status,400);
});

test('two-level categories validate pairs and can be edited without changing the affiliate URL', async () => {
 const product={...item,title:'분류 테스트 수세미',category:'주방',subcategory:'수세미'};
 assert.equal((await request('/api/links','POST',product)).status,200);
 const record=(await(await request('/api/links')).json()).find(link=>link.title===product.title);
 assert.equal(record.category,'주방');assert.equal(record.subcategory,'수세미');
 assert.equal((await request(`/api/links/${record.id}`,'PUT',{...product,category:'청소',subcategory:'청소용품'})).status,200);
 const updated=(await(await request('/api/links')).json()).find(link=>link.id===record.id);
 assert.equal(updated.category,'청소');assert.equal(updated.subcategory,'청소용품');assert.equal(updated.url,product.url);
 const before=(await(await request('/api/links')).json()).length;
 for(const classification of [{category:'청소',subcategory:'수세미'},{category:'주방',subcategory:'없는분류'},{category:'constructor',subcategory:'기타'}]) {
  assert.equal((await request('/api/links','POST',{...item,...classification})).status,400);
 }
 assert.equal((await(await request('/api/links')).json()).length,before);
 const module=await request('/app.js');assert.equal(module.status,200);assert.match(await module.text(),/수세미/);
});

test('bulk deletion is authenticated, rejects invalid selection, and leaves unselected products intact', async () => {
 const ids=[];
 for(const title of ['일괄 삭제 A','일괄 삭제 B','유지할 상품']) {
  await request('/api/links','POST',{...item,title,category:'청소',subcategory:'청소용품'});
  ids.push((await(await request('/api/links')).json()).find(link=>link.title===title).id);
 }
 assert.equal((await request('/api/links/bulk-delete','POST',{ids:ids.slice(0,2)},'wrong')).status,401);
 const before=await(await request('/api/links')).json();
 for(const value of [{},{ids:[]},{ids:[ids[0],-1]},{ids:[String(ids[0])]},{ids:[1.2]},null]) {
  assert.equal((await request('/api/links/bulk-delete','POST',value)).status,400);
 }
 assert.deepEqual(await(await request('/api/links')).json(),before);
 const response=await request('/api/links/bulk-delete','POST',{ids:[ids[0],ids[0],ids[1]]});
 assert.equal(response.status,200);assert.equal((await response.json()).deleted,2);
 const remaining=await(await request('/api/links')).json();
 assert.deepEqual(remaining,before.filter(link=>!ids.slice(0,2).includes(link.id)));
 assert.ok(remaining.some(link=>link.id===ids[2]));
});

test('browser startup needs no additional module route and exposes a matching server version', async () => {
 const entry=await request('/app.js');assert.equal(entry.status,200);
 assert.match(entry.headers.get('content-type'),/javascript/);assert.equal(entry.headers.get('cache-control'),'no-store');
 // Loading from a data URL also fails if a relative module dependency is introduced.
 const code=await entry.text();
 const module=await import(`data:text/javascript;base64,${Buffer.from(code).toString('base64')}`);
 assert.ok(module.categories['주방'].includes('수세미'));
 const response=await request('/api/status','GET',undefined,'');assert.equal(response.status,200);
 assert.deepEqual(await response.json(),{version:module.APP_VERSION});
 const page=await request('/');assert.equal(page.headers.get('cache-control'),'no-store');
});

test('photo uploads require authentication and integrate with editable product thumbnails', async () => {
 const sharp=(await import('sharp')).default;
 const photo=await sharp({create:{width:30,height:20,channels:3,background:'#ddaa66'}}).jpeg().toBuffer();
 const upload=auth=>fetch(base+'/api/uploads',{method:'POST',headers:{Authorization:`Bearer ${auth}`,'Content-Type':'image/jpeg'},body:photo});
 assert.equal((await upload('wrong')).status,401);
 const response=await upload(key);assert.equal(response.status,201);
 const result=await response.json();assert.match(result.image,/^\/uploads\/[a-f0-9]{64}\.webp$/);
 const image=await fetch(base+result.image);assert.equal(image.status,200);assert.equal(image.headers.get('content-type'),'image/webp');
 assert.equal((await sharp(Buffer.from(await image.arrayBuffer())).metadata()).format,'webp');
 const product={...item,title:'직접 찍은 사진 상품',image:result.image,category:'주방',subcategory:'수세미'};
 assert.equal((await request('/api/links','POST',product)).status,200);
 const record=(await(await request('/api/links')).json()).find(link=>link.title===product.title);
 assert.equal(record.image,result.image);
 assert.equal((await request(`/api/links/${record.id}`,'PUT',{...product,summary:'사진은 그대로 유지'})).status,200);
 assert.equal((await request('/api/links','POST',{...product,image:'/uploads/'+ '0'.repeat(64)+'.webp'})).status,400);
 assert.equal((await request('/api/links','POST',{...product,image:'/uploads/../../.data/admin-key'})).status,400);
 assert.equal((await fetch(base+'/uploads/'+ '0'.repeat(64)+'.webp')).status,404);
 child.kill();await once(child,'exit');
 child=spawn(process.execPath,['--use-env-proxy','server.js'],{env:{...process.env,DATA_DIR:dir,PORT:'0',ADMIN_KEY:''},stdio:['ignore','pipe','pipe']});
 const [output]=await once(child.stdout,'data');base=`http://127.0.0.1:${String(output).match(/port (\d+)/)[1]}`;
 assert.equal((await fetch(base+result.image)).status,200);
 const restarted=(await(await request('/api/links')).json()).find(link=>link.id===record.id);assert.equal(restarted.image,result.image);
});

test('upload endpoint rejects invalid image bytes and an oversized body',async()=>{
 const sendPhoto=body=>fetch(base+'/api/uploads',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'image/jpeg'},body});
 assert.equal((await sendPhoto(Buffer.from('this is not a JPEG'))).status,400);
 assert.equal((await sendPhoto(Buffer.alloc(10*1024*1024+1))).status,413);
});

test('cancelled or oversized chunked uploads do not stop the server', async () => {
 const {request:httpRequest}=await import('node:http');
 await new Promise(resolve=>{
  const upload=httpRequest(base+'/api/uploads',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'image/jpeg'}});
  upload.on('error',()=>{});upload.on('close',resolve);upload.write(Buffer.alloc(100));setTimeout(()=>upload.destroy(),10);
 });
 const stream=new ReadableStream({start(controller){controller.enqueue(new Uint8Array(10*1024*1024+1));controller.close()}});
 const response=await fetch(base+'/api/uploads',{method:'POST',headers:{Authorization:`Bearer ${key}`,'Content-Type':'image/jpeg'},body:stream,duplex:'half'});
 assert.equal(response.status,413);
 assert.equal((await request('/api/status')).status,200);
});
