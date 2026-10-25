import sharp from 'sharp';
import { createHash } from 'node:crypto';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
export const UPLOAD_PATH = /^\/uploads\/([a-f0-9]{64}\.webp)$/;

export class UploadError extends Error {
  constructor(message, status = 400) { super(message); this.status = status; }
}

export function readUpload(request) {
  if (Number(request.headers['content-length']) > MAX_UPLOAD_BYTES) {
    request.resume();
    return Promise.reject(new UploadError('사진은 최대 10MB까지 업로드할 수 있습니다.', 413));
  }
  return new Promise((resolveBody, reject) => {
    const parts = [];
    let size = 0;
    function cleanup() {
      request.off('data', onData);
      request.off('end', onEnd);
      request.off('error', onError);
      request.off('aborted', onAborted);
    }
    function onData(part) {
      size += part.length;
      if (size > MAX_UPLOAD_BYTES) {
        cleanup();
        request.resume();
        reject(new UploadError('사진은 최대 10MB까지 업로드할 수 있습니다.', 413));
      } else parts.push(part);
    }
    function onEnd() { cleanup(); resolveBody(Buffer.concat(parts)); }
    function onError() { cleanup(); reject(new UploadError('사진 전송이 중단됐습니다. 다시 선택해 주세요.')); }
    function onAborted() {
      cleanup();
      request.once('error', () => {});
      reject(new UploadError('사진 전송이 중단됐습니다. 다시 선택해 주세요.'));
    }
    request.on('data', onData);
    request.once('end', onEnd);
    request.once('error', onError);
    request.once('aborted', onAborted);
  });
}

export async function savePhoto(input, dataDir) {
  if (!input.length) throw new UploadError('업로드할 사진 파일을 선택해 주세요.');
  if (input.length > MAX_UPLOAD_BYTES) throw new UploadError('사진은 최대 10MB까지 업로드할 수 있습니다.', 413);
  let output;
  try {
    const image = sharp(input, { limitInputPixels: 60000000, failOn: 'warning' });
    const metadata = await image.metadata();
    if (!['jpeg', 'png', 'webp'].includes(metadata.format)) throw new UploadError('JPEG·PNG·WebP 사진만 업로드할 수 있습니다.', 415);
    // Re-encode rather than publishing original bytes: normalize rotation and remove EXIF/GPS.
    output = await image.rotate().resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true }).webp({ quality: 82 }).toBuffer({ resolveWithObject: true });
  } catch (error) {
    if (error instanceof UploadError) throw error;
    throw new UploadError('사진을 읽을 수 없습니다. 정상적인 JPEG·PNG·WebP 파일인지, 해상도가 너무 크지 않은지 확인해 주세요.');
  }
  const name = createHash('sha256').update(output.data).digest('hex') + '.webp';
  const directory = resolve(dataDir, 'uploads');
  await mkdir(directory, { recursive: true, mode: 0o700 });
  try { await writeFile(resolve(directory, name), output.data, { flag: 'wx', mode: 0o600 }); }
  catch (error) { if (error.code !== 'EEXIST') throw error; }
  return { image: '/uploads/' + name, width: output.info.width, height: output.info.height };
}
