import { SITE } from '@/lib/site'

// IndexNow (WP-1b) — Crawl-/Index-Beschleunigung, v. a. Bing → ChatGPT/Copilot.
// Key liegt als public/<key>.txt (Inhalt = der Key), damit api.indexnow.org die
// Ownership verifizieren kann. Aaron hinterlegt den Key zusaetzlich in Bing WMT.
//
// Fehler werden toleriert (try/catch) — ein IndexNow-Ausfall darf nie einen
// Build/Deploy oder eine Server-Action brechen (rein additiv, best-effort).

export const INDEXNOW_KEY = 'e176e64fe6c22b9afcb9085eba2aa354'

const HOST = new URL(SITE.url).host // autounfall.io
const ENDPOINT = 'https://api.indexnow.org/indexnow'

/**
 * Meldet geaenderte/neue URLs an IndexNow (Bing/Yandex/Seznam teilen sich den
 * Endpoint). `urls` muss absolute https-URLs derselben Host-Domain sein.
 * Liefert ein Result-Object (nie throw); bei >10000 URLs wird gechunkt.
 */
export async function pingIndexNow(
  urls: string[],
): Promise<{ ok: boolean; status?: number; count: number; error?: string }> {
  const list = urls.filter((u) => {
    try {
      return new URL(u).host === HOST
    } catch {
      return false
    }
  })
  if (list.length === 0) return { ok: true, count: 0 }
  try {
    let lastStatus = 0
    for (let i = 0; i < list.length; i += 10000) {
      const batch = list.slice(i, i + 10000)
      const res = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'content-type': 'application/json; charset=utf-8' },
        body: JSON.stringify({
          host: HOST,
          key: INDEXNOW_KEY,
          keyLocation: `${SITE.url}/${INDEXNOW_KEY}.txt`,
          urlList: batch,
        }),
      })
      lastStatus = res.status
      // 200 = akzeptiert, 202 = angenommen (verifiziert async). Beides ok.
      if (res.status !== 200 && res.status !== 202) {
        return { ok: false, status: res.status, count: 0, error: `HTTP ${res.status}` }
      }
    }
    return { ok: true, status: lastStatus, count: list.length }
  } catch (e) {
    return { ok: false, count: 0, error: (e as Error).message }
  }
}
