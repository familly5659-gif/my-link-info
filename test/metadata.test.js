import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadata } from '../metadata.js';
test('extracts Open Graph thumbnail, title and description from HTML entities',()=>{
 assert.deepEqual(parseMetadata('<meta property="og:title" content="컵 &amp; 머그"><meta property="og:description" content="가벼운 머그컵"><meta property="og:image" content="/image.jpg">','https://www.coupang.com/product'),{title:'컵 & 머그',summary:'가벼운 머그컵',image:'https://www.coupang.com/image.jpg'});
});
test('falls back to title and description; refuses unsafe thumbnail scheme',()=>{
 assert.deepEqual(parseMetadata('<title>상품 제목</title><meta name="description" content="설명"><meta property="og:image" content="javascript:alert(1)">','https://toss.im/a'),{title:'상품 제목',summary:'설명',image:''});
});

import { fetchMetadata, MetadataError } from '../metadata.js';
const productUrl='https://www.coupang.com/vp/products/8245782232';
const htmlResponse=(html,init={})=>new Response(html,{...init,headers:{'content-type':'text/html; charset=utf-8',...init.headers}});

test('reads Product JSON-LD graphs, sanitizes descriptions, and resolves image objects',()=>{
 const structured={'@graph':[{'@type':'WebPage'},{'@type':['Thing','Product'],name:'주방 수세미',description:'<b>부드러운</b> 수세미<script>ignore()</script>',image:{url:'//image.coupangcdn.com/image/product.jpg'}}]};
 const html='<title>쿠팡!</title><script type="application/ld+json">'+JSON.stringify(structured).replace(/</g,'\\u003c')+'</script>';
 assert.deepEqual(parseMetadata(html,productUrl),{title:'주방 수세미',summary:'부드러운 수세미',image:'https://image.coupangcdn.com/image/product.jpg'});
});
test('matches a product URL instead of selecting the first recommended product',()=>{
 const html='<script type="application/ld+json">'+JSON.stringify([{ '@type':'Product',url:'/vp/products/1',name:'추천 상품'},{'@type':'Product',url:productUrl,name:'선택한 상품'}])+'</script>';
 assert.equal(parseMetadata(html,productUrl).title,'선택한 상품');
});
test('malformed JSON-LD and unsafe product images fall back to public meta tags',()=>{
 const html='<meta property="og:title" content="상품 이름"><meta property="og:image" content="/safe.jpg"><script type="application/ld+json">not-json</script><script type="application/ld+json">{"@type":"Product","image":"javascript:alert(1)"}</script>';
 assert.equal(parseMetadata(html,productUrl).title,'상품 이름');assert.equal(parseMetadata(html,productUrl).image,'https://www.coupang.com/safe.jpg');
});
test('distinguishes upstream access denial, rate limiting and missing pages',async()=>{
 for(const [status,code] of [[401,'SOURCE_BLOCKED'],[403,'SOURCE_BLOCKED'],[429,'SOURCE_RATE_LIMITED'],[404,'SOURCE_NOT_FOUND'],[503,'SOURCE_UNAVAILABLE']]) {
  await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>htmlResponse('upstream private error text',{status})}),error=>error instanceof MetadataError&&error.code===code&&error.upstreamStatus===status&&!error.message.includes('private error'));
 }
});
test('does not import a 200 response containing an access-denied page',async()=>{
 for(const html of ['<title>Access Denied</title><meta property="og:title" content="Fake product">','<title>쿠팡!</title><body>요청하신 페이지의 사용권한이 없습니다</body>']) {
  await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>htmlResponse(html)}),{code:'SOURCE_BLOCKED'});
 }
});
test('returns partial metadata accurately and rejects empty or generic pages',async()=>{
 const result=await fetchMetadata(productUrl,{fetchImpl:async()=>htmlResponse('<title>실제 상품 이름</title>')});
 assert.equal(result.title,'실제 상품 이름');assert.deepEqual(result.missingFields,['summary','image']);
 for(const html of ['<html></html>','<title>쿠팡!</title>'])await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>htmlResponse(html)}),{code:'NO_METADATA'});
});
test('validates every redirect before fetching and preserves the original input string',async()=>{
 const calls=[];const input='https://link.coupang.com/a/example?affiliate=unchanged';
 const result=await fetchMetadata(input,{fetchImpl:async url=>{calls.push(url);return calls.length===1?new Response(null,{status:302,headers:{location:productUrl}}):htmlResponse('<title>상품명</title>')}});
 assert.equal(result.title,'상품명');assert.deepEqual(calls,[input,productUrl]);assert.equal(input,'https://link.coupang.com/a/example?affiliate=unchanged');
 const forbidden=[];
 await assert.rejects(fetchMetadata(input,{fetchImpl:async url=>{forbidden.push(url);return new Response(null,{status:302,headers:{location:'https://127.0.0.1/private'}})}}),{code:'INVALID_URL'});
 assert.equal(forbidden.length,1);
});
test('bounds redirects and page size and refuses non-HTML responses',async()=>{
 let calls=0;
 await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>{calls++;return new Response(null,{status:302,headers:{location:productUrl}})}}),{code:'TOO_MANY_REDIRECTS'});assert.equal(calls,6);
 await assert.rejects(fetchMetadata(productUrl,{maxBytes:5,fetchImpl:async()=>htmlResponse('x'.repeat(10))}),{code:'PAGE_TOO_LARGE'});
 await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>new Response('{}',{headers:{'content-type':'application/json'}})}),{code:'UNSUPPORTED_CONTENT'});
 await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>new Response(null,{status:302})}),{code:'INVALID_REDIRECT'});
});
test('times out slow requests and reports connection failures separately',async()=>{
 await assert.rejects(fetchMetadata(productUrl,{timeoutMs:5,fetchImpl:(_url,{signal})=>new Promise((resolve,reject)=>{
  const timer=setTimeout(()=>resolve(htmlResponse('<title>상품명</title>')),100);
  signal.addEventListener('abort',()=>{clearTimeout(timer);reject(signal.reason)},{once:true});
 })}),{code:'SOURCE_TIMEOUT'});
 await assert.rejects(fetchMetadata(productUrl,{fetchImpl:async()=>{throw new TypeError('fetch failed')}}),{code:'SOURCE_CONNECTION_FAILED'});
});
