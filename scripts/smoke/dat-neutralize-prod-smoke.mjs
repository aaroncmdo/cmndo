#!/usr/bin/env node
// Regel-4 Prod-Smoke fuer die DAT-Marketing-Neutralisierung (PR #4595 + dat.de-Follow-up).
// Prueft nutzersichtbaren SSR-HTML pro Marketing-Domain (kein node_modules noetig, global fetch).
// Nutzung nach Deploy:  node scripts/smoke/dat-neutralize-prod-smoke.mjs
// Exit 0 = PASS (DAT-Marken-Framing live entfernt, Seiten rendern), Exit 1 = FAIL/noch nicht deployed.
//
// PASS-Kriterien pro Seite:
//   cm (claimondo.de): dat.de=0, "DAT Expert"(space)=0, DAT-Verzeichnis=0, DAT-Sachverst.-Netzwerk=0,
//                      DAT-Gutachter=0, DAT-Standard=0, BVSK>0 (Render-Marker), HTTP 200.
//   zero (autounfall.io + 5 Cluster-Domains): brand-DAT gesamt=0, HTTP 200 (Regression).
// KEEP (kein Fail): "DAT-Expert" (Bindestrich) darf ueberall bleiben = sanktionierte SV-Recruiting-
//   Qualifikation ("DAT-Experten willkommen", "DAT-Expert-Nr.", "DAT-Expert · BVSK · IHK · oebuv").
//   Nur das Beziehungs-/Netzwerk-Framing ("DAT Expert" mit Space, dat.de-URLs, DAT-Verzeichnis) faellt.
// app.claimondo.de bewusst NICHT im Scope (Aaron 19.07.: rauslassen).
const TARGETS = [
  { url: 'https://claimondo.de/', kind: 'cm' },
  { url: 'https://claimondo.de/de/ueber-uns', kind: 'cm' },
  { url: 'https://claimondo.de/de/gutachter-finden', kind: 'cm' },
  { url: 'https://claimondo.de/de/kfz-gutachter', kind: 'cm' },
  { url: 'https://claimondo.de/de/wie-es-funktioniert', kind: 'cm' },
  { url: 'https://claimondo.de/de/vorteile', kind: 'cm' },
  { url: 'https://claimondo.de/de/gutachter-partner', kind: 'cm' },
  { url: 'https://autounfall.io/', kind: 'zero' },
  { url: 'https://kfz-unfallgutachter-aachen.de/', kind: 'zero' },
  { url: 'https://kfz-unfallgutachter-bonn.de/', kind: 'zero' },
  { url: 'https://kfz-unfallgutachter-duesseldorf.de/', kind: 'zero' },
  { url: 'https://kfz-unfallgutachter-koeln.de/', kind: 'zero' },
  { url: 'https://kfz-unfallgutachter-wuppertal.de/', kind: 'zero' },
]
const cnt = (h, re) => (h.match(re) || []).length
async function fetchOne(t) {
  try {
    const res = await fetch(t.url, { redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'claimondo-dat-smoke/2' } })
    const h = await res.text()
    return { ...t, http: res.status,
      datde: cnt(h, /dat\.de/gi), datExpSpace: cnt(h, /DAT Expert/g), datExpHyphen: cnt(h, /DAT-Expert/g),
      datVerz: cnt(h, /DAT-Verzeichnis/g), datNetz: cnt(h, /DAT-Sachverst[a-z]*-Netzwerk/gi),
      datGut: cnt(h, /DAT-Gutacht/g), datStd: cnt(h, /DAT-Standard/g), bvsk: cnt(h, /BVSK/g) }
  } catch (e) { return { ...t, http: 0, err: String(e).slice(0, 60) } }
}
function evaluate(r) {
  if (r.http === 0) return { pass: false, why: 'FETCH-FAIL ' + (r.err || '') }
  const fails = []
  if (r.kind === 'zero') {
    const brand = r.datExpSpace + r.datExpHyphen + r.datVerz + r.datNetz + r.datGut + r.datStd + r.datde
    if (r.http !== 200) fails.push('http=' + r.http)
    if (brand > 0) fails.push('brand-DAT=' + brand)
    return { pass: fails.length === 0, why: fails.join(',') || 'clean (0 DAT)' }
  }
  // cm — nur Marken-/Netzwerk-Framing faellt; "DAT-Expert" (Bindestrich) = KEEP.
  if (r.http !== 200) fails.push('http=' + r.http)
  if (r.datde > 0) fails.push('dat.de=' + r.datde)
  if (r.datExpSpace > 0) fails.push('"DAT Expert"=' + r.datExpSpace)
  if (r.datVerz > 0) fails.push('DAT-Verzeichnis=' + r.datVerz)
  if (r.datNetz > 0) fails.push('DAT-Netzwerk=' + r.datNetz)
  if (r.datGut > 0) fails.push('DAT-Gutachter=' + r.datGut)
  if (r.datStd > 0) fails.push('DAT-Standard=' + r.datStd)
  if (r.bvsk === 0) fails.push('BVSK-Marker fehlt (Render?)')
  const keep = r.datExpHyphen > 0 ? ` (DAT-Expert=${r.datExpHyphen} KEEP-ok)` : ''
  return { pass: fails.length === 0, why: (fails.join(',') || 'clean') + keep }
}
const rows = await Promise.all(TARGETS.map(fetchOne))
let allPass = true
console.log('URL'.padEnd(50), 'HTTP', 'VERDICT')
for (const r of rows) { const e = evaluate(r); if (!e.pass) allPass = false; console.log((e.pass ? 'PASS' : 'FAIL') + ' ' + r.url.padEnd(46), String(r.http).padEnd(4), e.why) }
console.log('\n' + (allPass ? 'SMOKE PASS — DAT-Framing live entfernt, alle Seiten rendern' : 'SMOKE FAIL / noch nicht deployed'))
process.exit(allPass ? 0 : 1)
