// Near-Duplicate der claimondo.de-STADTSEITEN — die Flaeche, die tatsaechlich
// gecrawlt wird (170 von 173 in 14 Tagen, gegen 18 von 50 bei den Cluster-LPs).
//
// Stichprobe statt Vollpruefung: 173 Seiten waeren 14.878 Paare. Die Auswahl ist
// bewusst geschichtet — Hubs mit voller Ortstiefe, heute befuellte Cluster-Orte,
// und "normale" Staedte mit 2-3 FAQs. Nur so sieht man, ob die Ortstiefe wirkt.
import { setTimeout as warte } from 'node:timers/promises'

const GRUPPEN = {
  'Hub (13-14 FAQs)': ['koeln', 'duesseldorf', 'wuppertal', 'bonn'],
  'Cluster (6-7, heute)': ['frechen', 'schwelm', 'huerth', 'mettmann', 'erftstadt', 'velbert'],
  'normal (2-3 FAQs)': ['bocholt', 'ahlen', 'soest', 'kleve', 'minden', 'herford', 'unna', 'wesel'],
}
const ALLE = Object.values(GRUPPEN).flat()

function text(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<head[\s\S]*?<\/head>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;|&#\d+;/gi, ' ')
    .replace(/\s+/g, ' ')
}
function gramme(t, namen) {
  let b = t.toLowerCase()
  for (const n of namen) {
    if (n.length < 3) continue
    b = b.replace(new RegExp(`\\b${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\w*`, 'g'), ' ')
  }
  const w = b.replace(/[^\p{L}\p{N}\s]/gu, ' ').split(/\s+/).filter(Boolean)
  const s = new Set()
  for (let i = 0; i + 4 <= w.length; i++) s.add(w.slice(i, i + 4).join(' '))
  return s
}
const ueber = (a, b) => {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const g of a) if (b.has(g)) n++
  return (100 * n) / (a.size + b.size - n)
}

const namen = ALLE.map((s) => s.replace(/-/g, ' '))
const seiten = new Map()
for (const s of ALLE) {
  try {
    const r = await fetch(`https://claimondo.de/kfz-gutachter/${s}`)
    if (r.ok) {
      const t = text(await r.text())
      seiten.set(s, { g: gramme(t, namen), w: t.split(/\s+/).length })
    } else console.log(`  ⚠ ${s}: HTTP ${r.status}`)
  } catch {
    console.log(`  ⚠ ${s}: nicht abrufbar`)
  }
  await warte(120)
}

console.log(`\nNEAR-DUPLICATE der claimondo.de-STADTSEITEN  ·  ${seiten.size} Seiten\n`)
console.log('Gruppe                    Seiten  Ø Woerter   Ø intern   max intern')
console.log('-'.repeat(72))
for (const [name, slugs] of Object.entries(GRUPPEN)) {
  const da = slugs.filter((s) => seiten.has(s))
  if (da.length < 2) continue
  let sum = 0, n = 0, max = 0, worst = ''
  for (let i = 0; i < da.length; i++)
    for (let j = i + 1; j < da.length; j++) {
      const v = ueber(seiten.get(da[i]).g, seiten.get(da[j]).g)
      sum += v; n++
      if (v > max) { max = v; worst = `${da[i]}↔${da[j]}` }
    }
  const w = Math.round(da.reduce((a, s) => a + seiten.get(s).w, 0) / da.length)
  console.log(
    `${name.padEnd(26)}${String(da.length).padStart(4)}${String(w).padStart(11)}` +
      `${(sum / n).toFixed(1).padStart(11)} %${max.toFixed(1).padStart(9)} %  (${worst})`,
  )
}

// Gesamtbild + wie viele Paare ueber 40 %
const slugs = [...seiten.keys()]
let ueber40 = 0, paare = 0, sum = 0, max = 0, worst = ''
for (let i = 0; i < slugs.length; i++)
  for (let j = i + 1; j < slugs.length; j++) {
    const v = ueber(seiten.get(slugs[i]).g, seiten.get(slugs[j]).g)
    paare++; sum += v
    if (v >= 40) ueber40++
    if (v > max) { max = v; worst = `${slugs[i]}↔${slugs[j]}` }
  }
console.log('-'.repeat(72))
console.log(`GESAMT  Ø ${(sum / paare).toFixed(1)} %  ·  max ${max.toFixed(1)} % (${worst})`)
console.log(`        ${ueber40} von ${paare} Paaren ueber 40 %`)
