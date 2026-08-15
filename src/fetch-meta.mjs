// 記事ページは SSR 済みなので、ブラウザを使わず fetch だけでメタ情報が取れる。

const UA =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 ' +
  '(KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function decodeEntities(s) {
  return s
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&#x27;/gi, "'")
    .replace(/&amp;/g, '&'); // 二重デコードを避けるため最後に処理する
}

function ogContent(html, property) {
  // content と property の並び順はどちらもあり得るので両方試す。
  const patterns = [
    new RegExp(`<meta[^>]+property=["']${property}["'][^>]*content=["']([^"']*)["']`, 'i'),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*property=["']${property}["']`, 'i'),
  ];
  for (const re of patterns) {
    const m = html.match(re);
    if (m) return decodeEntities(m[1]).trim();
  }
  return '';
}

function cleanTitle(raw) {
  return raw
    .replace(/\s*\|\s*Blog\s*\|\s*web\.dev\s*$/i, '')
    .replace(/\s*\|\s*web\.dev\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * <p class="wd-pubdates">Published: August 10, 2026</p> から公開日を取る。
 * 見つからなければ null（呼び出し側で一覧順から補完する）。
 */
function publishedAt(html) {
  const scoped = html.match(
    /class=["']wd-pubdates["'][\s\S]{0,600}?Published:\s*([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/,
  );
  const loose = scoped ?? html.match(/Published:\s*([A-Z][a-z]+\s+\d{1,2},\s*\d{4})/);
  if (!loose) return null;

  const date = new Date(`${loose[1].replace(/\s+/g, ' ')} 00:00:00 GMT`);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function fetchMeta(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, 'accept-language': 'en-US,en;q=0.9' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);

  const html = await res.text();
  const title = cleanTitle(ogContent(html, 'og:title'));
  if (!title) throw new Error(`no og:title for ${url}`);

  return {
    url,
    title,
    description: ogContent(html, 'og:description'),
    image: ogContent(html, 'og:image'),
    pubDate: publishedAt(html),
  };
}
