import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { fetchMeta } from './fetch-meta.mjs';
import { listPosts } from './list-posts.mjs';
import { MAX_ITEMS, buildFeed, parseFeed, sortItems } from './feed.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FEED_PATH = path.join(ROOT, 'docs', 'feed.xml');
const REQUEST_DELAY_MS = 200;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function readExistingFeed() {
  try {
    return await readFile(FEED_PATH, 'utf8');
  } catch (err) {
    if (err.code === 'ENOENT') return '';
    throw err;
  }
}

/**
 * 公開日が読み取れなかった記事を、一覧上で直前にある記事の日付で補完する。
 * 一覧は recency 順なので、この補完でも並び順は崩れない。
 */
function fillMissingDates(items) {
  let previous = new Date();
  for (const item of items) {
    if (item.pubDate) {
      previous = item.pubDate;
    } else {
      console.warn(`  ! no published date, inheriting ${previous.toUTCString()}: ${item.url}`);
      item.pubDate = previous;
    }
  }
}

async function main() {
  const existingXml = await readExistingFeed();
  const existing = parseFeed(existingXml);
  console.log(`existing feed: ${existing.length} item(s)`);

  const posts = await listPosts();
  console.log(`listing: ${posts.length} post(s)`);

  const known = new Map(existing.map((item) => [item.url, item]));
  const listIndexOf = new Map(posts.map((p) => [p.url, p.listIndex]));

  // 一覧順に走査し、未取得の記事だけ本文ページを叩く。
  const fetched = [];
  for (const post of posts) {
    const cached = known.get(post.url);
    if (cached) {
      fetched.push({ ...cached, listIndex: post.listIndex });
      continue;
    }

    try {
      const meta = await fetchMeta(post.url);
      console.log(`  + ${meta.title} (${meta.pubDate?.toDateString() ?? 'no date'})`);
      fetched.push({ ...meta, listIndex: post.listIndex });
    } catch (err) {
      console.warn(`  ! skipped ${post.url}: ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  fillMissingDates(fetched);

  // 一覧から溢れた過去記事は既存フィードから引き継ぐ。
  const seen = new Set(fetched.map((item) => item.url));
  const carried = existing
    .filter((item) => !seen.has(item.url) && item.pubDate)
    .map((item) => ({ ...item, listIndex: listIndexOf.get(item.url) }));

  const items = sortItems([...fetched, ...carried]).slice(0, MAX_ITEMS);
  if (items.length === 0) throw new Error('refusing to write an empty feed');

  const newest = Math.max(...items.map((item) => item.pubDate.getTime()));
  if (items[0].pubDate.getTime() !== newest) {
    throw new Error('sort failed: the first item is not the newest');
  }

  // lastBuildDate は毎回変わるので、それ以外が同じなら書き換えない（無意味なコミットを防ぐ）。
  const nextXml = buildFeed(items);
  const withoutBuildDate = (xml) => xml.replace(/<lastBuildDate>[^<]*<\/lastBuildDate>/, '');
  if (existingXml && withoutBuildDate(existingXml) === withoutBuildDate(nextXml)) {
    console.log('no new posts, feed left unchanged');
    return;
  }

  await mkdir(path.dirname(FEED_PATH), { recursive: true });
  await writeFile(FEED_PATH, nextXml, 'utf8');

  const added = items.length - existing.length;
  console.log(
    `wrote ${path.relative(ROOT, FEED_PATH)}: ${items.length} item(s)` +
      `${added > 0 ? `, ${added} new` : ''}`,
  );
  console.log(`newest: ${items[0].title} — ${items[0].pubDate.toUTCString()}`);
}

main().catch((err) => {
  console.error(`failed: ${err.message}`);
  process.exitCode = 1;
});
