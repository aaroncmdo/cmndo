import { SITE_URL } from './jsonld'

/**
 * IndexNow — instant URL submission to Bing / Yandex / Seznam (+ partners).
 *
 * The key is PUBLIC by design: it proves host ownership via the key file at
 * `${SITE_URL}/${INDEXNOW_KEY}.txt`, served INLINE by src/proxy.ts (a static
 * public/ file gets 307 -> /login'd by the auth proxy). If you rotate the key,
 * update it in BOTH this constant AND src/proxy.ts.
 *
 * Abuse-safe: only same-host (claimondo.de) URLs are ever submitted, so the
 * submit route does not need an auth guard — a caller can at worst re-ping our
 * own URLs, which the engines dedupe/rate-limit.
 */
export const INDEXNOW_KEY = '2bba1d07e7beb574db729e9f050a6022'

const HOST = new URL(SITE_URL).host
const KEY_LOCATION = `${SITE_URL}/${INDEXNOW_KEY}.txt`
const ENDPOINT = 'https://api.indexnow.org/indexnow'

export type IndexNowResult = {
  ok: boolean
  submitted: number
  status?: number
  error?: string
}

/** Normalize a path or absolute URL to an absolute same-host URL, or null if foreign/invalid. */
function toSameHostUrl(input: string): string | null {
  try {
    const abs = input.startsWith('http') ? input : `${SITE_URL}/${input.replace(/^\/+/, '')}`
    const url = new URL(abs)
    return url.host === HOST ? url.toString() : null
  } catch {
    return null
  }
}

/**
 * Submit URLs to IndexNow. Foreign-host URLs are dropped. Never throws —
 * returns a Result object (a failed search-engine ping must not break a caller).
 */
export async function submitToIndexNow(urls: string[]): Promise<IndexNowResult> {
  const urlList = Array.from(
    new Set(urls.map(toSameHostUrl).filter((u): u is string => u !== null)),
  )
  if (urlList.length === 0) {
    return { ok: false, submitted: 0, error: 'no valid same-host URLs' }
  }
  try {
    const res = await fetch(ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json; charset=utf-8' },
      body: JSON.stringify({ host: HOST, key: INDEXNOW_KEY, keyLocation: KEY_LOCATION, urlList }),
    })
    // IndexNow returns 200 (accepted) or 202 (accepted, pending validation).
    if (!res.ok) {
      return { ok: false, submitted: 0, status: res.status, error: `IndexNow responded ${res.status}` }
    }
    return { ok: true, submitted: urlList.length, status: res.status }
  } catch (err) {
    return { ok: false, submitted: 0, error: err instanceof Error ? err.message : 'IndexNow request failed' }
  }
}
