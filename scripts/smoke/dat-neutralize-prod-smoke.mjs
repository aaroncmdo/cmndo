#!/usr/bin/env node
// Regel-4 Prod-Smoke fuer PR #4595 (DAT-Marketing-Neutralisierung).
// Prueft nutzersichtbaren SSR-HTML pro Marketing-Domain (kein node_modules noetig, global fetch).
// Nutzung nach Deploy:  node scripts/smoke/dat-neutralize-prod-smoke.mjs
// Exit 0 = PASS (DAT-Framing live entfernt, alle Seiten rendern), Exit 1 = FAIL/noch nicht deployed.
//
// Baseline (vor Deploy, 19.07.): claimondo.de (7 Seiten) + app.claimondo.de FAIL (dat.de live);
// autounfall.io + 5 Cluster-Domains bereits PASS (auf main schon DAT-frei).
// KEEP-Ausnahme: /gutachter-partner darf "DAT-Expert" (Feld/Qualifikation) behalten; nur dat.de/Framing muss weg.
const TARGETS = [
  { url: 'https://claimondo.de/', kind: 'cm' },
  { url: 'https://claimondo.de/de/ueber-uns', kind: 'cm' },
  { url: 'https://claimondo.de/de/gutachter-finden', kind: 'cm' },
  { url: 'https://claimondo.de/de/kfz-gutachter', kind: 'cm' },
  { url: 'https://claimondo.de/de/wie-es-funktioniert', kind: 'cm' },
  { url: 'https://claimondo.de/de/vorteile', kind: 'cm' },
  { url: 'https://claimondo.de/de/gutachter-partner', kind: 'cm-partner' },
  { url: 'https://app.claimondo.de/', kind: 'app' },
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
    const res = await fetch(t.url, { redirect: 'follow', signal: AbortSignal.timeout(25000), headers: { 'user-agent': 'claimondo-dat-smoke/1' } })
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
  if (r.kind === 'app') {
    if (!(r.http === 200 || (r.http >= 300 && r.http < 400))) fails.push('http=' + r.http)
    if (r.datde > 0) fails.push('dat.de=' + r.datde)
    return { pass: fails.length === 0, why: fails.join(',') || 'ok' }
  }
  if (r.http !== 200) fails.push('http=' + r.http)
  if (r.datde > 0) fails.push('dat.de=' + r.datde)
  if (r.datExpSpace > 0) fails.push('"DAT Expert"=' + r.datExpSpace)
  if (r.datVerz > 0) fails.push('DAT-Verzeichnis=' + r.datVerz)
  if (r.datNetz > 0) fails.push('DAT-Netzwerk=' + r.datNetz)
  if (r.datGut > 0) fails.push('DAT-Gutachter=' + r.datGut)
  if (r.datStd > 0) fails.push('DAT-Standard=' + r.datStd)
  if (r.kind === 'cm' && r.datExpHyphen > 0) fails.push('DAT-Expert=' + r.datExpHyphen)
  if (r.bvsk === 0) fails.push('BVSK-Marker fehlt (Render?)')
  const note = r.kind === 'cm-partner' && r.datExpHyphen > 0 ? ` (DAT-Expert=${r.datExpHyphen} KEEP-ok)` : ''
  return { pass: fails.length === 0, why: (fails.join(',') || 'clean') + note }
}
const rows = await Promise.all(TARGETS.map(fetchOne))
let allPass = true
console.log('URL'.padEnd(50), 'HTTP', 'VERDICT')
for (const r of rows) { const e = evaluate(r); if (!e.pass) allPass = false; console.log((e.pass ? 'PASS' : 'FAIL') + ' ' + r.url.padEnd(46), String(r.http).padEnd(4), e.why) }
console.log('\n' + (allPass ? 'SMOKE PASS — DAT-Framing live entfernt, alle Seiten rendern' : 'SMOKE FAIL / noch nicht deployed'))
process.exit(allPass ? 0 : 1)
