import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { mkdtemp, readFile, rm, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { savePhoto, MAX_UPLOAD_BYTES } from '../uploads.js';

test('uploaded camera JPEG is rotated, resized, and stripped of EXIF metadata', async () => {
 const dir=await mkdtemp(join(tmpdir(),'eco-photo-'));
 try {
  const jpeg=await sharp({create:{width:2400,height:1200,channels:3,background:'#48a879'}}).jpeg().withMetadata({orientation:6}).toBuffer();
  assert.ok((await sharp(jpeg).metadata()).exif);
  const photo=await savePhoto(jpeg,dir);
  assert.match(photo.image,/^\/uploads\/[a-f0-9]{64}\.webp$/);
  assert.equal(photo.width,600);assert.equal(photo.height,1200);
  const metadata=await sharp(await readFile(join(dir,photo.image.slice(1)))).metadata();
  assert.equal(metadata.format,'webp');assert.equal(metadata.exif,undefined);assert.equal(metadata.orientation,undefined);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('PNG and WebP are accepted and repeated uploads do not duplicate stored photos',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'eco-photo-'));
 try {
  for(const format of ['png','webp']) {
   const input=await sharp({create:{width:10,height:15,channels:3,background:format==='png'?'#dd8888':'#8888dd'}})[format]().toBuffer();
   const first=await savePhoto(input,dir);const second=await savePhoto(input,dir);
   assert.equal(first.image,second.image);assert.equal(first.width,10);assert.equal(first.height,15);
  }
  assert.equal((await readdir(join(dir,'uploads'))).length,2);
 } finally {await rm(dir,{recursive:true,force:true});}
});
test('empty files, forged JPEG contents, SVG and oversized files are rejected',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'eco-photo-'));
 try {
  for(const input of [Buffer.alloc(0),Buffer.from('not a JPEG file'),Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>')]) {
   await assert.rejects(savePhoto(input,dir));
  }
  await assert.rejects(savePhoto(Buffer.alloc(MAX_UPLOAD_BYTES+1),dir),{status:413});
  assert.deepEqual(await readdir(dir),[]);
 } finally {await rm(dir,{recursive:true,force:true});}
});
