import puppeteer from 'puppeteer';

const LIST_URL = 'https://web.dev/blog?hl=en';

// 記事カードは <devsite-dynamic-content> が JS で描画する。素の HTML では中身が空なので
// fetch では取得できず、ブラウザで JS を実行させる必要がある。
const CARD_LINK = 'devsite-dynamic-content a[href*="/blog/"]';

/**
 * 一覧ページの href を正規化する。記事以外のリンクは null を返す。
 * 1記事につき画像リンクと見出しリンクの2本が同じ URL を指すため、呼び出し側で重複排除する。
 */
function normalize(href) {
  let u;
  try {
    u = new URL(href);
  } catch {
    return null;
  }
  if (u.hostname !== 'web.dev') return null;

  const m = u.pathname.match(/^\/blog\/([a-z0-9][a-z0-9-]*)\/?$/);
  if (!m) return null;

  const slug = m[1];
  if (slug === 'feed') return null;

  return `https://web.dev/blog/${slug}`;
}

/**
 * 記事 URL を一覧の掲載順（recency 順 = 新しい順）で返す。
 * @returns {Promise<{url: string, listIndex: number}[]>}
 */
export async function listPosts() {
  const browser = await puppeteer.launch({
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });

  let hrefs;
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1280, height: 1600 });
    await page.goto(LIST_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    await page.waitForSelector(CARD_LINK, { timeout: 30000 });
    hrefs = await page.$$eval(CARD_LINK, (els) => els.map((el) => el.href));
  } finally {
    await browser.close();
  }

  const seen = new Map();
  for (const href of hrefs) {
    const url = normalize(href);
    if (url && !seen.has(url)) seen.set(url, seen.size);
  }

  const posts = [...seen].map(([url, listIndex]) => ({ url, listIndex }));

  // DOM 構造が変わって取得できなくなった場合、既存フィードを壊さないよう異常終了させる。
  if (posts.length === 0) {
    throw new Error(`no posts found on ${LIST_URL} (selector: ${CARD_LINK})`);
  }

  return posts;
}
