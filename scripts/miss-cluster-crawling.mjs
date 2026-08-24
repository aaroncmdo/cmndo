// Misst, was Google auf den Cluster-Domains TATSAECHLICH tut — aus den
// nginx-Logs des VPS, nicht aus einer Schaetzung.
//
// WOFUER: Die Near-Duplicate-Quote ist ein INDIKATOR, kein Ergebnis. Aarons
// Ausgangsbeobachtung war „es wurde enorm wenig indexiert" — und die einzige
// Groesse, die dem nahekommt und uns zugaenglich ist, ist das Crawling.
// (Google Search Console laeuft ueber Ahrefs, dessen Tarif jeden Abruf abweist;
// siehe memory/COORDINATION-hyperlokal-geo-content-programm.md §Messblocker.)
//
// ⭐ WARUM DAS EINE BASELINE BRAUCHT: Ohne Vorher-Wert laesst sich spaeter nicht
// sagen, ob die Ortstiefe gewirkt hat. Dieselbe Lehre wie beim GEO-Fragensatz:
// die Messung muss VOR der Massnahme einmal gelaufen sein.
//
// Run:  node scripts/miss-cluster-crawling.mjs [--baseline]
//       --baseline schreibt scripts/cluster-crawl-baseline.json
//
// Braucht SSH-Zugang zum VPS (~/.ssh/claimondo_vps). Rein lesend.
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'

const BASELINE = 'scripts/cluster-crawl-baseline.json'
const SCHREIBEN = process.argv.includes('--baseline')
const KEY = `${homedir()}/.ssh/claimondo_vps`.replace(/\\/g, '/')

// ⚠ ZWEI MESSFALLEN, beide beim Selbsttest aufgefallen:
//
// 1. Der nginx-Log fuehrt KEINEN Host (Standard-combined, kein `$host`). Alle
//    Domains des VPS landen in derselben Datei. Fuer `/lp/<ort>` ist das
//    unschaedlich — den Pfad gibt es nur auf den Cluster-Domains, und kein Ort
//    liegt auf zwei. Eine GESAMTZAHL waere dagegen der ganze VPS: Ich hatte
//    "0,85 % des Budgets gehen auf /lp/" gemeldet — der Nenner enthielt
//    app.claimondo.de und claimondo.de mit. Die Zahl ist bedeutungslos und
//    wird deshalb nicht mehr als Anteil ausgewiesen.
//
// 2. `grep -i Googlebot` zaehlt GEFAELSCHTE User-Agents mit. Im Log stehen unter
//    diesem UA je ~33 Abrufe auf `/.env`, `/.env.backup`, `/.git/config` und
//    `/backend/.env` — Googlebot fragt so etwas nie ab, das sind Secret-Scans.
//    (Geprueft: alle liefern 404/307, nichts wird ausgeliefert.) Die
//    /lp/-Zahlen sind davon nicht betroffen — Scanner zielen nicht auf
//    Content-Pfade —, aber verifiziert wird jetzt trotzdem per Reverse-DNS.
const FERN = `
{ cat /var/log/nginx/access.log /var/log/nginx/access.log.1 2>/dev/null; zcat /var/log/nginx/access.log.*.gz 2>/dev/null; } > /tmp/.crawlmess
echo '###ORTE'
grep -i 'Googlebot' /tmp/.crawlmess | grep -oE 'GET /lp/[a-z-]+' | sed 's|GET /lp/||' | sort | uniq -c
echo '###TAGE'
grep -i 'Googlebot' /tmp/.crawlmess | grep '/lp/' | grep -oE '\\[[0-9]{2}/[A-Za-z]{3}/[0-9]{4}' | tr -d '[' | sort | uniq -c
echo '###IPS'
grep -i 'Googlebot' /tmp/.crawlmess | grep '/lp/' | awk '{print \$1}' | sort | uniq -c | sort -rn | head -8
echo '###ECHT'
for ip in \$(grep -i 'Googlebot' /tmp/.crawlmess | grep '/lp/' | awk '{print \$1}' | sort -u | head -12); do
  host \$ip 2>/dev/null | grep -qE '\\.(googlebot|google)\\.com' && echo "OK \$ip" || echo "FAKE \$ip"
done
echo '###ANDERE'
for b in bingbot GPTBot ClaudeBot PerplexityBot; do printf '%s ' \$b; grep -i \$b /tmp/.crawlmess | grep -c '/lp/'; done
echo '###SUMMEN'
grep -ci 'Googlebot' /tmp/.crawlmess
grep -i 'Googlebot' /tmp/.crawlmess | grep -c '/lp/'
rm -f /tmp/.crawlmess
`

if (!existsSync(KEY)) {
  console.error(`🔴 SSH-Key fehlt: ${KEY}`)
  process.exit(1)
}

let roh
try {
  roh = execFileSync(
    'ssh',
    ['-i', KEY, '-o', 'StrictHostKeyChecking=no', '-o', 'ConnectTimeout=20', 'root@212.132.119.110', FERN],
    { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  )
} catch (err) {
  console.error(`🔴 VPS nicht erreichbar: ${err.message.slice(0, 120)}`)
  process.exit(1)
}

const teil = (name) => (roh.split(`###${name}`)[1] ?? '').split('###')[0].trim()
const paare = (t) =>
  Object.fromEntries(
    t
      .split('\n')
      .map((z) => z.trim().match(/^(\d+)\s+(.+)$/))
      .filter(Boolean)
      .map((m) => [m[2], Number(m[1])]),
  )

const orte = paare(teil('ORTE'))
const tage = paare(teil('TAGE'))
const [gesamtVps, aufLp] = teil('SUMMEN').split('\n').map(Number)
const echt = teil('ECHT').split('\n').filter((z) => z.startsWith('OK ')).length
const fake = teil('ECHT').split('\n').filter((z) => z.startsWith('FAKE ')).length
const andere = Object.fromEntries(
  teil('ANDERE')
    .split('\n')
    .map((z) => z.trim().split(/\s+/))
    .filter((p) => p.length === 2),
)

// ⚠ Eine leere Menge ist erst ein Befund, wenn das Instrument lebt.
if (!gesamtVps) {
  console.error('🔴 0 Googlebot-Requests im gesamten Log — das ist ein Instrumentenfehler, kein Befund.')
  process.exit(1)
}

const gecrawlt = Object.keys(orte).length
console.log('\nCLUSTER-CRAWLING  ·  Googlebot auf /lp/, nginx-Log des VPS (14 Tage)\n')
console.log(`  /lp/-Abrufe                 ${aufLp}`)
console.log(`  verschiedene Orte           ${gecrawlt}`)
console.log(`  IP-Stichprobe verifiziert   ${echt} echt${fake ? `, 🔴 ${fake} gefaelscht` : ''} (Reverse-DNS auf googlebot.com)`)
console.log(`\n  ⚠ Nicht als Anteil lesen: der Log fuehrt keinen Host, die ${gesamtVps} Googlebot-`)
console.log('     Zeilen des VPS enthalten alle Domains — und Secret-Scans mit gefaelschtem UA.')
if (Object.keys(andere).length) {
  console.log('\n  Andere Bots auf /lp/:')
  for (const [b, n] of Object.entries(andere)) console.log(`    ${b.padEnd(16)} ${n}`)
}
console.log('\n  Je Tag:')
for (const [t, n] of Object.entries(tage)) console.log(`    ${t}  ${'█'.repeat(Math.min(n, 50))} ${n}`)

const alt = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')) : null
if (alt) {
  console.log(`\n  Gegen Baseline vom ${alt.stand}:`)
  const d = (a, b) => (b - a >= 0 ? `+${b - a}` : `${b - a}`)
  console.log(`    /lp/-Crawls   ${alt.aufLp} -> ${aufLp}  (${d(alt.aufLp, aufLp)})`)
  console.log(`    Orte          ${alt.gecrawlt} -> ${gecrawlt}  (${d(alt.gecrawlt, gecrawlt)})`)
}

if (SCHREIBEN) {
  // ⚠ Kein Date.now() im Skript-Kern — der Stand kommt aus dem Log selbst,
  // damit zwei Laeufe am selben Tag denselben Zeitraum benennen.
  const stand = Object.keys(tage).sort().pop() ?? 'unbekannt'
  writeFileSync(BASELINE, `${JSON.stringify({ stand, gesamt, aufLp, gecrawlt, orte, tage }, null, 2)}\n`, 'utf8')
  console.log(`\n✓ Baseline geschrieben: ${BASELINE} (Stand ${stand})`)
} else if (!alt) {
  console.log('\nMit --baseline als Vorher-Wert festhalten.')
}
