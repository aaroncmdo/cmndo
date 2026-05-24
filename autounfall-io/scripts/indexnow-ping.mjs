#!/usr/bin/env node
// IndexNow-Ping (WP-1b) — Post-Deploy-Schritt. Liest die Live-sitemap.xml,
// extrahiert die indexierbaren URLs und meldet sie an IndexNow (Bing/Yandex/
// Seznam → u. a. ChatGPT/Copilot-Discovery). Fehler-tolerant (nie non-zero
// wegen IndexNow — der Key muss erst live sein: erst deployen, dann pingen).
//
//   node scripts/indexnow-ping.mjs [baseUrl]          # default https://autounfall.io
//   node scripts/indexnow-ping.mjs https://… url1 url2 # nur diese URLs pingen
//
// Key + Endpoint gespiegelt aus lib/indexnow.ts (dieses Script ist dep-frei/
// standalone, daher die Konstante hier dupliziert — bei Key-Wechsel BEIDE).
const KEY = 'e176e64fe6c22b9afcb9085eba2aa354'
const ENDPOINT = 'https://api.indexnow.org/indexnow'

const args = process.argv.slice(2)
const base = (args[0]?.startsWith('http') ? args.shift() : 'https://autounfall.io').replace(/\/+$/, '')
const host = new URL(base).host

async function urlsFromSitemap() {
  const res = await fetch(`${base}/sitemap.xml`, { headers: { 'user-agent': 'au-indexnow/1.0' } })
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
