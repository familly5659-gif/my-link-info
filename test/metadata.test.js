import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMetadata } from '../metadata.js';
test('extracts Open Graph thumbnail, title and description from HTML entities',()=>{
 assert.deepEqual(parseMetadata('<meta property="og:title" content="컵 &amp; 머그"><meta property="og:description" content="가벼운 머그컵"><meta property="og:image" content="/image.jpg">','https://www.coupang.com/product'),{title:'컵 & 머그',summary:'가벼운 머그컵',image:'https://www.coupang.com/image.jpg'});
});
test('falls back to title and description; refuses unsafe thumbnail scheme',()=>{
 assert.deepEqual(parseMetadata('<title>상품 제목</title><meta name="description" content="설명"><meta property="og:image" content="javascript:alert(1)">','https://toss.im/a'),{title:'상품 제목',summary:'설명',image:''});
});
