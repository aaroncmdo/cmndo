// Misst die Near-Duplicate-Lage der Cluster-Domains (kfz-unfallgutachter-*.de).
//
// WOFUER: Die LP-Seiten dieser Domains sind einander zu 57-73 % aehnlich. Die
// Spec des Programms setzt die Grenze bei 40 % — darueber indexiert Google nur
// einen Repraesentanten, und genau das ist der Grund fuer „enorm wenig
// indexiert". Der ortsspezifische Anteil (`SEO_BODY` in lib/cluster.ts) ist der
// einzige Hebel; alles andere auf der Seite ist Template.
//
// ZWEI MODI, bewusst getrennt:
//   (Standard)  liest SEO_BODY aus den Repo-Dateien — schnell, kein Netz,
//               taugt zum Iterieren waehrend des Schreibens
//   --live      craulet die echten LP-Seiten — der einzige Beweis, denn nur
//               dort steht das Verhaeltnis von Ortstext zu Template
//
// ⚠ Die Repo-Messung ist OPTIMISTISCH: Sie vergleicht nur den Ortstext gegen
// den Ortstext. Auf der echten Seite verduennt das Template die Unterschiede,
// die Live-Zahl liegt also hoeher. Nie die Repo-Zahl als Erfolg melden.
//
// ⚠ Ordnername != Domain: `kfz-gutachter-koeln/` -> kfz-unfallgutachter-koeln.de
//
// Run: node scripts/pruefe-cluster-duplicate.mjs [--live] [--grenze 40]
import { existsSync, readFileSync, readdirSync } from 'node:fs'

const GRENZE = (() => {
  const i = process.argv.indexOf('--grenze')
  return i > -1 ? Number(process.argv[i + 1]) : 40
})()
const LIVE = process.argv.includes('--live')

/** 4-Gramme eines Textes, OHNE die Ortsnamen — sonst sehen Baukastentexte
 *  kuenstlich verschieden aus, nur weil der Ort ausgetauscht wurde. */
function viergramme(text, orte) {
  let b = String(text).toLowerCase()
  for (const o of orte) {
    if (!o || o.length < 3) continue
    b = b.replace(new RegExp(`\\b${o.toLowerCase().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'g'), ' ')
  }
  const w = b.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const s = new Set()
  for (let i = 0; i + 4 <= w.length; i++) s.add(w.slice(i, i + 4).join(' '))
  return s
}

function ueberlappung(a, b) {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const g of a) if (b.has(g)) n++
  return (100 * n) / (a.size + b.size - n)
}

/** Liest SEO_BODY je Ort aus einer cluster.ts — ohne die Datei auszufuehren. */
function seoBodyAusRepo(pfad) {
  const src = readFileSync(pfad, 'utf8')
  const start = src.indexOf('SEO_BODY')
  if (start < 0) return new Map()
  const teil = src.slice(start)
  const orte = new Map()
  // Ein Ort-Block beginnt bei 2 Leerzeichen Einrueckung + slug + ': ['
  const re = /^ {2}'?([a-z][a-z-]*)'?:\s*\[/gm
  const treffer = [...teil.matchAll(re)]
  for (let i = 0; i < treffer.length; i++) {
    const von = treffer[i].index
    const bis = i + 1 < treffer.length ? treffer[i + 1].index : teil.length
    const block = teil.slice(von, bis)
    // Alle Textwerte (text:, h3:, liste-Eintraege) zusammen
    const texte = [...block.matchAll(/(?:text|h3):\s*(['"`])([\s\S]*?)\1/g)].map((m) => m[2])
    orte.set(treffer[i][1], texte.join(' '))
  }
  return orte
}

const ORDNER = readdirSync('.').filter((d) => /^kfz-gutachter-[a-z]+$/.test(d) && existsSync(`${d}/lib/cluster.ts`))
if (ORDNER.length === 0) {
  console.error('🔴 Keine Cluster-Ordner gefunden — im Repo-Root ausfuehren.')
  process.exit(1)
}

console.log(`\nCLUSTER-DUPLICATE  ·  Grenze ${GRENZE} %  ·  Quelle: ${LIVE ? 'LIVE-Seiten' : 'SEO_BODY im Repo'}\n`)
if (!LIVE) console.log('⚠ Repo-Messung ist optimistisch — auf der Seite verduennt das Template. Fuer den Beweis: --live\n')

let gesamtUeber = 0
let gesamtPaare = 0

for (const ordner of ORDNER) {
  const stadt = ordner.replace('kfz-gutachter-', '')
  const domain = `kfz-unfallgutachter-${stadt}.de`
  let inhalte = new Map()

  if (LIVE) {
    const orte = [...seoBodyAusRepo(`${ordner}/lib/cluster.ts`).keys()]
    for (const o of orte) {
      const url = o === stadt ? `https://${domain}/` : `https://${domain}/lp/${o}`
      try {
        // ⚠ ZWEI Abrufe: ISR liefert beim ersten den alten Stand und loest erst
        // dann die Revalidierung aus. Wer einmal abruft, misst von gestern.
        await fetch(url).catch(() => null)
        const r = await fetch(url)
        const html = await r.text()
        inhalte.set(
          o,
          html
            .replace(/<script[\s\S]*?<\/script>/gi, ' ')
            .replace(/<style[\s\S]*?<\/style>/gi, ' ')
            .replace(/<[^>]+>/g, ' '),
        )
      } catch {
        console.log(`  ⚠ ${o}: nicht abrufbar`)
      }
    }
  } else {
    inhalte = seoBodyAusRepo(`${ordner}/lib/cluster.ts`)
  }

  const orte = [...inhalte.keys()]
  const alleNamen = orte.map((o) => o.replace(/-/g, ' '))
  const gramme = new Map(orte.map((o) => [o, viergramme(inhalte.get(o), [...alleNamen, stadt])]))
  const woerter = orte.map((o) => inhalte.get(o).split(/\s+/).filter(Boolean).length)

  let max = 0
  let worst = ''
  let summe = 0
  let paare = 0
  let ueber = 0
  for (let i = 0; i < orte.length; i++) {
    for (let j = i + 1; j < orte.length; j++) {
      const v = ueberlappung(gramme.get(orte[i]), gramme.get(orte[j]))
      summe += v
      paare++
      if (v >= GRENZE) ueber++
      if (v > max) {
        max = v
        worst = `${orte[i]} ↔ ${orte[j]}`
      }
    }
  }
  gesamtUeber += ueber
  gesamtPaare += paare

  const med = [...woerter].sort((a, b) => a - b)[Math.floor(woerter.length / 2)]
  console.log(
    `${domain.padEnd(36)} ${String(orte.length).padStart(2)} Orte · Median ${String(med).padStart(5)} W · ` +
      `Ø ${summe / Math.max(1, paare) < 10 ? ' ' : ''}${(summe / Math.max(1, paare)).toFixed(1)} % · ` +
      `max ${max.toFixed(1)} % ${max >= GRENZE ? '🔴' : '✓'} (${worst})`,
  )
  if (ueber > 0) console.log(`${''.padEnd(36)} ${ueber} von ${paare} Paaren ueber der Grenze`)
}

console.log(`\nGESAMT: ${gesamtUeber} von ${gesamtPaare} Paaren ueber ${GRENZE} %`)
if (gesamtUeber === 0) console.log('✓ alle Paare unter der Grenze')
process.exitCode = gesamtUeber > 0 ? 1 : 0
