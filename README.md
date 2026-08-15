# web-dev-rss

An unofficial RSS feed for the [web.dev blog](https://web.dev/blog?hl=en).

Because the official feed `https://web.dev/static/blog/feed.xml` **stopped updating on May 29, 2026**, this tool crawls the article list daily to rebuild the feed.

## Subscription URL

```
https://ouka-lab.github.io/web-dev-rss/feed.xml
```

## How It Works

1. `src/list-posts.mjs` — Uses Puppeteer to open `https://web.dev/blog?hl=en` and gathers article URLs in the order they appear in the list.
2. `src/fetch-meta.mjs` — Fetches only unretrieved articles to extract `og:title`, `og:description`, `og:image`, and `Published: ...`.
3. `src/feed.mjs` — Merges with the existing feed to generate RSS 2.0.
4. `.github/workflows/update-feed.yml` — Runs daily at 07:00 JST and commits `docs/feed.xml` if there are any changes.

### Why a Browser Is Needed

Article cards on the list page are rendered via JS using `<devsite-dynamic-content query="docType:Blog" template="card">`. In the raw HTML obtainable via `curl`, the content inside this tag is empty, and not a single article link is included. Therefore, JavaScript execution is required just to retrieve the list.

On the other hand, individual article pages are pre-rendered with SSR, so a browser is not needed to fetch meta information (plain `fetch` is sufficient).

### Ordering

Since `Published: August 10, 2026` does not include a time and articles published on the same day can occur, ordering is finalized by using **the display order in the list (recency order)** as a secondary key in addition to descending `pubDate`. We verify that the first item is the newest before writing out the feed.

## Running Locally

```sh
npm ci
node src/index.mjs
```

This updates `docs/feed.xml`. If retrieving the list fails, it exits with an error and leaves the existing feed untouched.

## Maintenance

If the DOM on the web.dev side changes and the selectors stop working, the workflow is designed to **fail so you notice** (rather than quietly outputting an empty feed). In that case, review `CARD_LINK` in `src/list-posts.mjs`.
