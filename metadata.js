import { load } from 'cheerio';

export function parseMetadata(html, url) {
  const $ = load(html);
  const meta = name => $(`meta[property="og:${name}"]`).attr('content') || $(`meta[name="twitter:${name}"]`).attr('content') || '';
  const rawImage = meta('image');
  let image = ''; try { const u = new URL(rawImage, url); if (rawImage && u.protocol === 'https:') image = u.href; } catch {}
  return { title: (meta('title') || $('title').text()).trim().slice(0, 160), summary: (meta('description') || $('meta[name="description"]').attr('content') || '').trim().slice(0, 1000), image };
}
