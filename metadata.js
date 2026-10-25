import { load } from 'cheerio';

const allowedHosts = ['coupang.com', 'toss.im', 'toss.me', 'tossshopping.com', 'threads.com', 'threads.net'];
const labels = { title: '상품명', summary: '설명', image: '썸네일' };

export function validUrl(value) {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password && (!url.port || url.port === '443')
      && allowedHosts.some(host => url.hostname === host || url.hostname.endsWith('.' + host));
  } catch { return false; }
}

export class MetadataError extends Error {
  constructor(code, message, status = 422, upstreamStatus) {
    super(message);
    this.name = 'MetadataError';
    this.code = code;
    this.status = status;
    if (upstreamStatus) this.upstreamStatus = upstreamStatus;
  }
}

function plainText(value, limit) {
  if (typeof value !== 'string') return '';
  const $ = load(value);
  $('script,style').remove();
  return $.root().text().replace(/\s+/g, ' ').trim().slice(0, limit);
}

function httpsImage(value, base) {
  if (Array.isArray(value)) {
    for (const item of value) { const image = httpsImage(item, base); if (image) return image; }
    return '';
  }
  if (value && typeof value === 'object') return httpsImage(value.url || value.contentUrl, base);
  if (typeof value !== 'string' || !value.trim()) return '';
  try {
    const url = new URL(value.trim(), base);
    return url.protocol === 'https:' && !url.username && !url.password ? url.href : '';
  } catch { return ''; }
}

function findProducts(value) {
  const pending = [value], products = [];
  for (let cursor = 0; cursor < pending.length && cursor < 10000; cursor++) {
    const node = pending[cursor];
    if (!node || typeof node !== 'object') continue;
    const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
    if (types.some(type => typeof type === 'string' && /(^|[/#])Product$/.test(type))) products.push(node);
    for (const child of Array.isArray(node) ? node : Object.values(node)) {
      if (child && typeof child === 'object' && pending.length < 10000) pending.push(child);
    }
  }
  return products;
}

function inspectHtml(html, url) {
  const $ = load(html);
  const meta = name => $(`meta[property="og:${name}"]`).attr('content') || $(`meta[name="twitter:${name}"],meta[property="twitter:${name}"]`).attr('content') || '';
  const pageTitle = plainText($('title').text(), 160);
  const blocked = /^(access denied|forbidden|403(?: forbidden)?|just a moment[.!…]*|attention required.*)$/i.test(pageTitle)
    || $('body').text().includes('요청하신 페이지의 사용권한이 없습니다');
  let products = [];
  $('script[type="application/ld+json"]').each((_, element) => {
    try { products.push(...findProducts(JSON.parse($(element).text()))); } catch { /* Invalid structured data does not hide valid meta tags. */ }
  });
  const product = products.find(item => {
    try { return new URL(item.url, url).pathname === new URL(url).pathname; } catch { return false; }
  }) || products[0];
  let title = plainText(product?.name, 160) || plainText(meta('title'), 160) || pageTitle
    || plainText($('.prod-buy-header__title').first().text() || $('h1').first().text(), 160);
  if (/^(쿠팡!?|coupang!?|로그인|access denied|forbidden|페이지를 찾을 수 없습니다[.!]?)$/i.test(title)) title = '';
  const metadata = {
    title,
    summary: plainText(product?.description, 1000) || plainText(meta('description') || $('meta[name="description"]').attr('content'), 1000),
    image: httpsImage(product?.image, url) || httpsImage(meta('image'), url),
  };
  return { metadata: blocked ? { title: '', summary: '', image: '' } : metadata, blocked };
}

export function parseMetadata(html, url) { return inspectHtml(html, url).metadata; }

function sourceName(url) {
  const host = new URL(url).hostname;
  return host.includes('coupang') ? '쿠팡' : host.includes('toss') ? '토스쇼핑' : 'Threads';
}

function responseError(status, url) {
  const source = sourceName(url);
  if (status === 401 || status === 403) return new MetadataError('SOURCE_BLOCKED', `${source}에서 자동 정보 가져오기 요청을 허용하지 않았습니다. 상품명·요약·썸네일 주소를 직접 입력해 주세요. 상품 링크는 그대로 저장할 수 있어요.`, 422, status);
  if (status === 429) return new MetadataError('SOURCE_RATE_LIMITED', `${source}에서 요청을 일시적으로 제한했습니다. 잠시 후 다시 시도하거나 상품 정보를 직접 입력해 주세요.`, 422, status);
  if (status === 404 || status === 410) return new MetadataError('SOURCE_NOT_FOUND', '상품 페이지를 찾을 수 없습니다. 링크가 정확한지 확인해 주세요.', 422, status);
  return new MetadataError('SOURCE_UNAVAILABLE', `${source} 페이지를 불러오지 못했습니다. 잠시 후 다시 시도하거나 상품 정보를 직접 입력해 주세요.`, 422, status);
}

// fetchImpl is injectable so response/redirect failures can be tested without external sites.
export async function fetchMetadata(input, { fetchImpl = fetch, timeoutMs = 10000, maxBytes = 1500000 } = {}) {
  let url = typeof input === 'string' ? input.trim() : input;
  const signal = AbortSignal.timeout(timeoutMs);
  try {
    for (let redirects = 0; redirects <= 5; redirects++) {
      if (!validUrl(url)) throw new MetadataError('INVALID_URL', '지원하는 쿠팡·토스쇼핑·Threads HTTPS 링크를 확인해 주세요.', 400);
      const response = await fetchImpl(url, { redirect: 'manual', signal, headers: { 'User-Agent': 'eco.log94/0.2 (public link preview)', Accept: 'text/html,application/xhtml+xml' } });
      if ([301, 302, 303, 307, 308].includes(response.status)) {
        const location = response.headers.get('location');
        await response.body?.cancel();
        if (!location) throw new MetadataError('INVALID_REDIRECT', '상품 페이지의 이동 주소를 확인할 수 없습니다. 상품 정보를 직접 입력해 주세요.');
        try { url = new URL(location, url).href; } catch { throw new MetadataError('INVALID_REDIRECT', '상품 페이지의 이동 주소가 올바르지 않습니다.'); }
        continue;
      }
      if (!response.ok) { await response.body?.cancel(); throw responseError(response.status, url); }
      if (!/\b(?:text\/html|application\/xhtml\+xml)\b/i.test(response.headers.get('content-type') || '')) {
        await response.body?.cancel();
        throw new MetadataError('UNSUPPORTED_CONTENT', '상품 정보를 읽을 수 있는 웹페이지가 아닙니다. 상품 상세 링크를 확인해 주세요.');
      }
      if (!response.body) throw new MetadataError('NO_METADATA', '공개된 상품 정보가 없습니다. 상품 정보를 직접 입력해 주세요.');
      const reader = response.body.getReader();
      let size = 0;
      const parts = [];
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.length;
          if (size > maxBytes) throw new MetadataError('PAGE_TOO_LARGE', '상품 페이지가 너무 커서 정보를 가져오지 못했습니다. 상품 정보를 직접 입력해 주세요.');
          parts.push(value);
        }
      } finally { await reader.cancel(); }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const part of parts) { bytes.set(part, offset); offset += part.length; }
      const { metadata, blocked } = inspectHtml(new TextDecoder().decode(bytes), url);
      if (blocked) throw responseError(403, url);
      if (!Object.values(metadata).some(Boolean)) throw new MetadataError('NO_METADATA', '공개된 상품 정보가 없거나 자동 수집이 제한된 페이지입니다. 상품 정보를 직접 입력해 주세요.');
      const missingFields = Object.keys(labels).filter(field => !metadata[field]);
      return { ...metadata, missingFields };
    }
    throw new MetadataError('TOO_MANY_REDIRECTS', '상품 페이지 이동이 너무 많습니다. 상품 상세 링크를 직접 입력해 주세요.');
  } catch (error) {
    if (error instanceof MetadataError) throw error;
    if (signal.aborted || error.name === 'TimeoutError' || error.name === 'AbortError') throw new MetadataError('SOURCE_TIMEOUT', '판매처의 응답이 늦어 가져오기를 중단했습니다. 다시 시도하거나 직접 입력해 주세요.');
    throw new MetadataError('SOURCE_CONNECTION_FAILED', '판매처 사이트에 연결하지 못했습니다. 잠시 후 다시 시도하거나 상품 정보를 직접 입력해 주세요.');
  }
}
