export const FEED_TITLE = 'web.dev Blog (unofficial)';
export const SITE_URL = 'https://web.dev/blog?hl=en';
export const SELF_URL = 'https://ouka-lab.github.io/web-dev-rss/feed.xml';
export const FEED_DESCRIPTION =
  "Unofficial feed for the web.dev blog, rebuilt daily because the official feed stopped updating.";
export const MAX_ITEMS = 50;

function cdata(value) {
  // CDATA を閉じてしまう ]]> を分割してエスケープする。
  return `<![CDATA[${String(value).replace(/\]\]>/g, ']]]]><![CDATA[>')}]]>`;
}

function xmlAttr(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function innerText(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, 'i'));
  if (!m) return '';
  return m[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, '$1').trim();
}

/**
 * 既存の feed.xml を読み戻す。フィード自体を状態ファイルとして使うため、
 * ここで得た URL 集合が「取得済み記事」になる。
 */
export function parseFeed(xml) {
  if (!xml) return [];

  const items = [];
  for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
    const block = match[1];
    const url = innerText(block, 'link');
    if (!url) continue;

    const raw = innerText(block, 'pubDate');
    const date = new Date(raw);
    const enclosure = block.match(/<enclosure[^>]+url="([^"]*)"/i);

    items.push({
      url,
      title: innerText(block, 'title'),
      description: innerText(block, 'description'),
      image: enclosure ? enclosure[1] : '',
      pubDate: Number.isNaN(date.getTime()) ? null : date,
    });
  }
  return items;
}

/**
 * 最新が先頭に来るよう並べる。
 * pubDate は日付までしか分からず同日公開が起こり得るので、一覧の掲載順（recency 順）を
 * 第2キーにして順序を確定させる。一覧に無い古い記事は同日タイの場合うしろに送る。
 */
export function sortItems(items) {
  return [...items].sort((a, b) => {
    const diff = (b.pubDate?.getTime() ?? 0) - (a.pubDate?.getTime() ?? 0);
    if (diff !== 0) return diff;
    return (a.listIndex ?? Number.MAX_SAFE_INTEGER) - (b.listIndex ?? Number.MAX_SAFE_INTEGER);
  });
}

function renderItem(item) {
  const lines = [
    '        <item>',
    `            <title>${cdata(item.title)}</title>`,
    `            <link>${xmlAttr(item.url)}</link>`,
    `            <guid isPermaLink="true">${xmlAttr(item.url)}</guid>`,
    `            <pubDate>${item.pubDate.toUTCString()}</pubDate>`,
  ];
  if (item.description) {
    lines.push(`            <description>${cdata(item.description)}</description>`);
  }
  if (item.image) {
    lines.push(`            <enclosure url="${xmlAttr(item.image)}" type="image/png" />`);
  }
  lines.push('        </item>');
  return lines.join('\n');
}

export function buildFeed(items, { buildDate = new Date() } = {}) {
  return `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>${cdata(FEED_TITLE)}</title>
        <link>${xmlAttr(SITE_URL)}</link>
        <atom:link href="${xmlAttr(SELF_URL)}" rel="self" type="application/rss+xml" />
        <description>${cdata(FEED_DESCRIPTION)}</description>
        <language>en-US</language>
        <lastBuildDate>${buildDate.toUTCString()}</lastBuildDate>
        <docs>https://validator.w3.org/feed/docs/rss2.html</docs>
        <generator>ouka-lab/web-dev-rss</generator>
${items.map(renderItem).join('\n')}
    </channel>
</rss>
`;
}
