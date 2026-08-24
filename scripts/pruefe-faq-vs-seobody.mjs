// Faengt Dubletten ZWISCHEN den beiden Textquellen derselben Seite.
//
// WOFUER: Auf einer Cluster-LP rendern `SEO_BODY` (aus lib/cluster.ts) und
// `lokale_faqs` (aus der DB) NEBENEINANDER. Wer die FAQs schreibt, nachdem er den
// SEO_BODY geschrieben hat, greift auf dieselben Themen zurueck — und produziert
// Dubletten auf EINER Seite.
//
// ⭐ `pruefe-charge.mjs` kann das nicht sehen: Es prueft die Chargendatei gegen das
// Gate und gegen die zwoelf Basis-Themen, kennt den SEO_BODY der LP aber nicht.
// Der Wuppertal-Agent fand so zwei WORTGLEICHE Fragen und acht ueber 30 %; bei
// zwei Orten waren ALLE VIER neuen FAQs Dubletten.
//
// Run: node pruefe-faq-vs-seobody.mjs   (im Repo-Root, braucht .env.local)
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

const GRENZE = Number(process.argv[2] ?? 30)

function env(k) {
  for (const p of ['.env.local', 'C:/Users/Aaron Sprafke/stampit-app/stampit-app/claimondo-v2/.env.local']) {
    if (!existsSync(p)) continue
    const z = readFileSync(p, 'utf8').split(/\r?\n/).find((x) => x.startsWith(`${k}=`))
    if (z) return z.slice(k.length + 1).trim().replace(/^["']|["']$/g, '')
  }
  throw new Error(`${k} fehlt`)
}

function gramme(text) {
  const w = String(text).toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const s = new Set()
  for (let i = 0; i + 4 <= w.length; i++) s.add(w.slice(i, i + 4).join(' '))
  return s
}
function ueber(a, b) {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const g of a) if (b.has(g)) n++
  return (100 * n) / (a.size + b.size - n)
}

/** Die einzelnen SEO_BODY-Absaetze je Ort (h3 + text getrennt greifbar). */
function seoAbsaetze(pfad) {
  const src = readFileSync(pfad, 'utf8')
  const t = src.slice(src.indexOf('SEO_BODY'))
  const m = [...t.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm)]
  const orte = new Map()
  for (let i = 0; i < m.length; i++) {
    const blk = t.slice(m[i].index, i + 1 < m.length ? m[i + 1].index : t.length)
    const stuecke = []
    for (const e of blk.matchAll(/(?:h3|text):\s*(['"`])([\s\S]*?)\1/g)) stuecke.push(e[2])
    orte.set(m[i][1], stuecke)
  }
  return orte
}

const SLUG_DB = { monheim: 'monheim-am-rhein', stolberg: 'stolberg-rheinland' }

const db = createClient(env('NEXT_PUBLIC_SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), {
  auth: { persistSession: false },
})

const ordner = readdirSync('.').filter((d) => /^kfz-gutachter-[a-z]+$/.test(d) && existsSync(`${d}/lib/cluster.ts`))

console.log(`\nFAQ ↔ SEO_BODY — Dubletten auf DERSELBEN Seite  ·  Grenze ${GRENZE} %\n`)
let treffer = 0
let geprueft = 0

for (const o of ordner) {
  const domain = `kfz-unfallgutachter-${o.replace('kfz-gutachter-', '')}.de`
  const absaetze = seoAbsaetze(`${o}/lib/cluster.ts`)
  const slugs = [...absaetze.keys()]
  const dbSlugs = slugs.map((s) => SLUG_DB[s] ?? s)

  const { data, error } = await db
    .from('stadt_lokalinhalte')
    .select('stadt_slug, lokale_faqs')
    .eq('status', 'veroeffentlicht')
    .in('stadt_slug', dbSlugs)
  if (error) {
    console.log(`${domain}: 🔴 ${error.message}`)
    continue
  }
  const faqsVon = new Map((data ?? []).map((z) => [z.stadt_slug, z.lokale_faqs ?? []]))

  const zeilen = []
  for (const slug of slugs) {
    const faqs = faqsVon.get(SLUG_DB[slug] ?? slug) ?? []
    if (!faqs.length) continue
    const seo = (absaetze.get(slug) ?? []).map((x) => ({ text: x, g: gramme(x) }))
    for (const f of faqs) {
      geprueft++
      const fg = gramme(`${f?.frage ?? ''} ${f?.antwort ?? ''}`)
      let max = 0
      let gegen = ''
      for (const s of seo) {
        const v = ueber(fg, s.g)
        if (v > max) { max = v; gegen = s.text.slice(0, 52) }
      }
      // FAQ gegen FAQ derselben Stadt
      for (const g of faqs) {
        if (g === f) continue
        const v = ueber(fg, gramme(`${g?.frage ?? ''} ${g?.antwort ?? ''}`))
        if (v > max) { max = v; gegen = `[FAQ] ${String(g?.frage).slice(0, 45)}` }
      }
      if (max >= GRENZE) {
        treffer++
        zeilen.push(`   ${max.toFixed(1).padStart(5)} %  ${slug.padEnd(20)} „${String(f?.frage).slice(0, 44)}"`)
        zeilen.push(`            gegen: ${gegen}`)
      }
    }
  }
  console.log(`${domain.padEnd(36)} ${zeilen.length ? `🔴 ${zeilen.length / 2} Dubletten` : '✓ sauber'}`)
  for (const z of zeilen) console.log(z)
}

console.log(`\n${geprueft} FAQs geprueft · ${treffer} ab ${GRENZE} %`)
process.exitCode = treffer > 0 ? 1 : 0
