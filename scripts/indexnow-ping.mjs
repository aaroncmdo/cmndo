#!/usr/bin/env node
// IndexNow-Ping fuer claimondo.de — Post-Deploy-Schritt. Liest die Live-
// sitemap.xml, extrahiert die indexierbaren claimondo.de-URLs und meldet sie
// an IndexNow (Bing/Yandex/Seznam → u. a. ChatGPT/Copilot-Discovery).
// Fehler-tolerant (nie non-zero wegen IndexNow — der Key muss erst live sein:
// erst deployen, dann pingen).
//
//   node scripts/indexnow-ping.mjs                       # default https://claimondo.de
//   node scripts/indexnow-ping.mjs https://claimondo.de  # explizite Base
//   node scripts/indexnow-ping.mjs https://… url1 url2   # nur diese URLs pingen
//
// Key: process.env.INDEXNOW_KEY (gleiche Quelle wie die geplanten GEO-Cron-
// Routes /api/cron/refresh-* aus docs/geo/*), Fallback = der Key, dessen
// Ownership-File unter public/<key>.txt committed ist. Bei Key-Wechsel BEIDE
// Stellen (public/<key>.txt + diesen Fallback) anpassen.
const KEY = process.env.INDEXNOW_KEY || 'd8cb707dec8f9389e0d476604fecd4b4'
const ENDPOINT = 'https://api.indexnow.org/indexnow'

const args = process.argv.slice(2)
const base = (args[0]?.startsWith('http') ? args.shift() : 'https://claimondo.de').replace(/\/+$/, '')
const host = new URL(base).host

async function urlsFromSitemap() {
  const res = await fetch(`${base}/sitemap.xml`, { headers: { 'user-agent': 'claimondo-indexnow/1.0' } })
  if (!res.ok) throw new Error(`sitemap.xml HTTP ${res.status}`)
  const xml = await res.text()
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim())
}

async function main() {
  let urls = args.filter((a) => a.startsWith('http'))
  if (urls.length === 0) {
    console.log(`Lese URLs aus ${base}/sitemap.xml …`)
    urls = await urlsFromSitemap()
  }
  // Nur URLs derselben Host-Domain — IndexNow akzeptiert pro Submit nur einen
  // Host, dessen keyLocation erreichbar ist. Die Subdomain-URLs in der Sitemap
  // (gutachter./makler.claimondo.de) fallen damit bewusst raus.
  urls = urls.filter((u) => {
    try { return new URL(u).host === host } catch { return false }
  })
  console.log(`Pinge ${urls.length} URLs an IndexNow (host=${host}) …`)
  if (urls.length === 0) { console.log('Keine URLs — nichts zu tun.'); return }

  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({ host, key: KEY, keyLocation: `${base}/${KEY}.txt`, urlList: urls }),
  })
  console.log(`IndexNow → HTTP ${res.status} ${res.status === 200 || res.status === 202 ? '(OK)' : '(siehe Doku)'}`)
  // 200=akzeptiert, 202=angenommen. Andere Codes loggen, aber nicht hart failen.
}

main().catch((e) => { console.error('IndexNow-Ping-Fehler (toleriert):', e.message); process.exit(0) })
