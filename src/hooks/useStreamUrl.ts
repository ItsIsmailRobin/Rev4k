import { useEffect, useState } from 'react';

/**
 * Built-in fallback URL used when /stream.txt cannot be fetched (CORS,
 * 404, network error, etc.) so the app never gets stuck on a spinner.
 *
 * Note: this URL IS shipped in the JS bundle. It is a graceful fallback
 * so the app keeps working even when the indirect fetch fails. If you
 * care about keeping the URL fully out of view-source, you can empty
 * this string and the app will surface a clear "Stream Fetch Failed"
 * status instead.
 */
const FALLBACK_URL = 'https://inproviszon.st/tsn4k.m3u8';

/**
 * Resolves the HLS manifest URL.
 *
 * Two input modes are supported:
 *
 *   1. **Direct m3u8 URL** — if `source` looks like an http(s) URL pointing
 *      at a .m3u8 / .m3u manifest, it is used directly without any
 *      fetch. The player starts immediately on the very first render.
 *
 *   2. **Indirect via /stream.txt** — if `source` looks like a path
 *      (anything that doesn't start with http:// or https://, e.g.
 *      `/stream.txt`), it is `fetch()`-ed at runtime and the first
 *      non-empty line is used as the manifest URL. If the fetch fails
 *      (404, CORS, etc.) we transparently fall back to FALLBACK_URL so
 *      the player never gets stuck.
 *
 * Defaults to `/stream.txt`.
 */
export function useStreamUrl(source: string = '/stream.txt') {
  // Direct .m3u8 URL? Use it immediately, no fetch.
  const isDirectUrl = /^https?:\/\/.*\.(m3u8|m3u)(\?|$)/i.test(source);

  const [url, setUrl] = useState<string | null>(
    isDirectUrl ? source : FALLBACK_URL
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Direct URL — nothing to fetch.
    if (isDirectUrl) {
      setUrl(source);
      setLoading(false);
      return;
    }

    // Path -> fetch and read.
    let cancelled = false;
    setLoading(true);
    setError(null);

    fetch(source, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.text();
      })
      .then((text) => {
        if (cancelled) return;
        const line = text
          .split(/\r?\n/)
          .map((l) => l.trim())
          .find((l) => l.length > 0);
        if (!line) {
          throw new Error(`${source} is empty`);
        }
        if (!/^https?:\/\//i.test(line)) {
          throw new Error(`${source} does not contain a valid URL`);
        }
        setUrl(line);
        setLoading(false);
      })
      .catch((err) => {
        if (cancelled) return;
        // Don't get stuck on a failed indirect fetch — fall back to the
        // built-in URL so the player keeps working.
        console.warn(
          `[useStreamUrl] ${source} fetch failed (${err?.message || err}); using fallback`
        );
        setUrl(FALLBACK_URL);
        setError(String(err?.message || err));
        setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [source, isDirectUrl]);

  return { url, loading, error };
}
