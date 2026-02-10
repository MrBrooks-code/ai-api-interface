/**
 * @fileoverview Zero-dependency web search and page reading via DuckDuckGo's
 * public HTML endpoint. Uses Node's built-in `http`/`https` modules to POST
 * queries and fetch pages, then regex-parses the results.
 */

import http from 'node:http';
import https from 'node:https';

/** A single search result extracted from DuckDuckGo HTML. */
export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

/**
 * Searches the web via DuckDuckGo and returns parsed results.
 * Network or parse errors are caught and returned as a formatted error string
 * so the calling model always receives useful feedback.
 *
 * @param query The search query string.
 * @param count Maximum number of results to return (1-10, default 5).
 * @returns Formatted string of search results suitable for model consumption.
 */
export async function searchWeb(query: string, count = 5): Promise<string> {
  const safeCount = Math.max(1, Math.min(10, count));

  try {
    const html = await fetchDuckDuckGo(query);
    const results = parseResults(html, safeCount);

    if (results.length === 0) {
      return `No search results found for: "${query}"`;
    }

    return formatResults(query, results);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return `Web search failed for "${query}": ${message}`;
  }
}

/** POSTs to DuckDuckGo's HTML-only endpoint and returns the raw HTML body. */
function fetchDuckDuckGo(query: string): Promise<string> {
  const body = `q=${encodeURIComponent(query)}`;

  return new Promise((resolve, reject) => {
    const req = https.request(
      {
        hostname: 'html.duckduckgo.com',
        path: '/html/',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.setTimeout(10_000, () => {
      req.destroy(new Error('Search request timed out'));
    });
    req.write(body);
    req.end();
  });
}

/**
 * Extracts search results from DuckDuckGo's HTML response.
 * The HTML-only endpoint uses a stable structure with `.result__a` links
 * and `.result__snippet` elements that we can reliably regex-match.
 */
function parseResults(html: string, maxResults: number): SearchResult[] {
  const results: SearchResult[] = [];

  // Each result lives inside a <div class="result ... "> block.
  // We extract the link (title + URL) and snippet from each block.
  const resultBlocks = html.split(/class="result\s/);

  for (let i = 1; i < resultBlocks.length && results.length < maxResults; i++) {
    const block = resultBlocks[i];

    // Title & URL from <a class="result__a" href="...">Title</a>
    const linkMatch = block.match(
      /class="result__a"[^>]*href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/,
    );
    if (!linkMatch) continue;

    const rawUrl = linkMatch[1];
    const title = stripHtml(linkMatch[2]).trim();

    // Snippet from <a class="result__snippet" ...>text</a>
    const snippetMatch = block.match(
      /class="result__snippet"[^>]*>([\s\S]*?)<\/a>/,
    );
    const snippet = snippetMatch ? stripHtml(snippetMatch[1]).trim() : '';

    // DuckDuckGo wraps outbound URLs in a redirect; try to extract the real URL.
    const url = extractRealUrl(rawUrl);

    if (title && url) {
      results.push({ title, url, snippet });
    }
  }

  return results;
}

/** Resolves DuckDuckGo's redirect wrapper to the actual destination URL. */
function extractRealUrl(ddgUrl: string): string {
  // DDG redirect format: //duckduckgo.com/l/?uddg=<encoded_url>&...
  const uddgMatch = ddgUrl.match(/[?&]uddg=([^&]+)/);
  if (uddgMatch) {
    return decodeURIComponent(uddgMatch[1]);
  }
  // Already a direct URL
  if (ddgUrl.startsWith('http')) {
    return ddgUrl;
  }
  // Protocol-relative
  if (ddgUrl.startsWith('//')) {
    return `https:${ddgUrl}`;
  }
  return ddgUrl;
}

/** Strips HTML tags and decodes common HTML entities. */
function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ');
}

/** Formats parsed results into a readable string for model consumption. */
function formatResults(query: string, results: SearchResult[]): string {
  const lines = [`Web search results for "${query}":\n`];

  for (let i = 0; i < results.length; i++) {
    const r = results[i];
    lines.push(`${i + 1}. ${r.title}`);
    lines.push(`   URL: ${r.url}`);
    if (r.snippet) {
      lines.push(`   ${r.snippet}`);
    }
    lines.push('');
  }

  return lines.join('\n').trimEnd();
}

// ---------------------------------------------------------------------------
// Webpage reader
// ---------------------------------------------------------------------------

/** Maximum characters of page text to return to the model. */
const MAX_PAGE_TEXT_LENGTH = 8000;

/** Maximum number of HTTP redirects to follow. */
const MAX_REDIRECTS = 5;

/**
 * Fetches a webpage and returns its text content stripped of HTML.
 * Follows redirects, strips scripts/styles/nav, and truncates to a
 * reasonable length so the model gets useful content without overflowing.
 *
 * @param url The URL to fetch.
 * @returns Readable text extracted from the page.
 */
export async function readWebpage(url: string): Promise<string> {
  try {
    const html = await fetchUrl(url, MAX_REDIRECTS);
    const text = extractPageText(html);

    if (!text) {
      return `The page at ${url} returned no readable text content.`;
    }

    const truncated =
      text.length > MAX_PAGE_TEXT_LENGTH
        ? text.slice(0, MAX_PAGE_TEXT_LENGTH) + '\n\n[Content truncated]'
        : text;

    return `Content from ${url}:\n\n${truncated}`;
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return `Failed to read webpage ${url}: ${message}`;
  }
}

/**
 * Fetches a URL, following redirects up to {@link maxRedirects} times.
 * Supports both HTTP and HTTPS.
 */
function fetchUrl(url: string, maxRedirects: number): Promise<string> {
  return new Promise((resolve, reject) => {
    const client = url.startsWith('https') ? https : http;

    const req = client.get(
      url,
      {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,*/*',
        },
      },
      (res) => {
        // Follow redirects
        if (
          res.statusCode &&
          res.statusCode >= 300 &&
          res.statusCode < 400 &&
          res.headers.location
        ) {
          if (maxRedirects <= 0) {
            reject(new Error('Too many redirects'));
            return;
          }
          const redirectUrl = new URL(res.headers.location, url).href;
          fetchUrl(redirectUrl, maxRedirects - 1).then(resolve, reject);
          res.resume(); // Drain the response
          return;
        }

        if (res.statusCode && res.statusCode >= 400) {
          res.resume();
          reject(new Error(`HTTP ${res.statusCode}`));
          return;
        }

        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve(Buffer.concat(chunks).toString('utf-8')));
        res.on('error', reject);
      },
    );

    req.on('error', reject);
    req.setTimeout(15_000, () => {
      req.destroy(new Error('Page request timed out'));
    });
  });
}

/**
 * Extracts readable text from raw HTML by stripping scripts, styles,
 * and markup, then normalizing whitespace.
 */
function extractPageText(html: string): string {
  return (
    html
      // Remove script and style blocks entirely
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      // Replace block-level elements with newlines for readability
      .replace(/<\/?(p|div|br|h[1-6]|li|tr|blockquote|section|article|header|footer|nav|main|aside)[^>]*>/gi, '\n')
      // Strip all remaining tags
      .replace(/<[^>]*>/g, '')
      // Decode common HTML entities
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#x27;/g, "'")
      .replace(/&#39;/g, "'")
      .replace(/&nbsp;/g, ' ')
      // Collapse whitespace
      .replace(/[ \t]+/g, ' ')
      .replace(/\n[ \t]+/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  );
}
