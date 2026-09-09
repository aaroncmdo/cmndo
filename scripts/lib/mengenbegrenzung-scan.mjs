// Pure Scan-Logik fuer check:mengenbegrenzung — Lesepfade auf grossen Tabellen ohne
// Mengenbegrenzung. Keine I/O -> unit-testbar (vitest). CLI: ../check-mengenbegrenzung.mjs
//
// DIE FEHLERKLASSE: PostgREST liefert ohne `range` HOECHSTENS 1.000 Zeilen. Kein Fehler,
// keine Warnung — die Antwort ist einfach kuerzer als die Wahrheit. Ohne `order` ist
// zusaetzlich nicht bestimmt, WELCHE 1.000 kommen:
//
//   .from('tasks').select('…').not('faellig_am','is',null)                  // ❌ still gekappt
//   alleSeiten((von,bis) => q.order('id').range(von,bis))                   // ✅ vollstaendig
//   .from('tasks').select('…').limit(50)                                    // ✅ Grenze gewollt
//
// BELEGTER VORFALL (09.09.2026, PR #5964): Der Admin-Kalender zeigte am 3. September NULL
// Aufgaben, obwohl sieben faellig waren — 930 von 1.930 fehlten insgesamt. Das SV-Matching
// sah 1.000 von 9.712 aktiven Leads und konnte den naechstgelegenen Sachverstaendigen
// schlicht nicht sehen. Beides lief monatelang ohne eine einzige Fehlermeldung.
// Details: memory/BROADCAST-postgrest-liefert-ohne-range-nur-1000-zeilen.
//
// NUR GROSSE TABELLEN (bewusst nicht jede Abfrage des Repos): auf einer Tabelle mit 40
// Zeilen ist eine fehlende Grenze folgenlos. Die Liste unten traegt die prod-Zeilenzahl
// als Begruendung — sie priorisiert, sie entscheidet nicht: unter den 135 Stellen, die
// ein Scan ohne diese Einschraenkung meldete, hatten am 09.09. genau vier echten Schaden.
//
// NUR ZUSAMMENHAENGENDE KETTEN: Wird die Abfrage ueber eine Variable aufgebaut
// (`let q = db.from(…); q = q.or(…); await q.limit(20)`), wird sie NIE geflaggt — die
// Grenze kann dann in einer anderen Anweisung stehen. Real belegt: `sv-basic/claim-actions`
// baut so auf und hat `.limit(20)`; ein Scanner ohne diese Regel meldet dort einen
// Fehlalarm. Ein Ratchet mit Fehlalarmen blockiert die Fleet und wird abgeschaltet.

/**
 * Tabellen, auf denen eine fehlende Grenze real schadet.
 * Zeilenzahlen: `pg_stat_user_tables` auf prod, gemessen 09.09.2026.
 * Neue grosse Tabelle? Hier eintragen — die Baseline steigt dann einmalig.
 */
export const GROSSE_TABELLEN = {
  cron_jobs_audit: 61701,
  levelup_anreicherung: 20734,
  health_check_runs: 19413,
  mitteilungen: 14713,
  sv_leads: 10019,
  benachrichtigungen: 8293,
  notification_deliveries: 7454,
  tasks: 2487,
  partner_aktivitaeten: 2438,
  lead_historie: 1957,
  nachrichten: 1879,
  timeline: 1636,
  email_log: 1106,
  consent_records: 1061,
  notification_events: 1057,
}

export const SKIP_MARKER = 'mengenbegrenzung-skip:'

/** Alles, was die Ergebnismenge nach oben begrenzt. */
const BEGRENZER = /\.(limit|range|single|maybeSingle)\s*\(|count:\s*['"]exact['"]|head:\s*true/

/**
 * Gleichheits- oder IN-Filter auf eine ID-artige Spalte: die Menge haengt dann an der
 * Zahl der uebergebenen Kennungen, nicht an der Tabellengroesse.
 */
const ID_FILTER =
  /\.(eq|in)\s*\(\s*['"](id|[a-z0-9_]*_id|zugewiesen_an|empfaenger_id|message_id)['"]/

const WRITE_METHODEN = /\.(insert|update|upsert|delete)\s*\(/

/** Zeilen- und Blockkommentare entfernen, Zeilenzahl erhalten. */
export function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
  out = out
    .split('\n')
    .map((z) => {
      // Kein Zeilenkommentar innerhalb eines Strings: grob, aber ausreichend —
      // ein `//` in einer URL steht immer hinter `:` oder in Anfuehrungszeichen.
      const i = z.search(/(^|[^:'"`\w])\/\//)
      return i === -1 ? z : z.slice(0, i === 0 ? 0 : i + 1)
    })
    .join('\n')
  return out
}

/**
 * Die Fluent-Kette ab `.from(` — solange Folgezeilen mit `.` beginnen oder Klammern
 * offen sind. Endet an der ersten Zeile, die eine neue Anweisung eroeffnet.
 */
export function ketteAb(code, startIdx) {
  const zeilen = code.slice(startIdx).split('\n')
  const teile = [zeilen[0]]
  let tiefe = klammerBilanz(zeilen[0])
  for (let i = 1; i < zeilen.length; i++) {
    const z = zeilen[i]
    const trimmed = z.trim()
    // ⚠ Eine LEERE Zeile beendet die Kette nicht: nach dem Kommentar-Strippen bleibt
    // von einer Erklaerzeile genau das uebrig — und die steht in den reparierten
    // Stellen direkt vor `.order().range()`. Wer hier abbricht, uebersieht die Grenze.
    const naechsteEchte = trimmed === '' ? naechsteNichtLeere(zeilen, i + 1) : trimmed
    const gehoertDazu =
      tiefe > 0 || trimmed === '' ? true : trimmed.startsWith('.') || trimmed.startsWith(')')
    if (!gehoertDazu) break
    // Leerzeile nur mitnehmen, wenn danach die Kette weitergeht.
    if (trimmed === '' && tiefe <= 0 && !naechsteEchte.startsWith('.') && !naechsteEchte.startsWith(')')) break
    teile.push(z)
    tiefe += klammerBilanz(z)
    if (tiefe <= 0) {
      const n = naechsteNichtLeere(zeilen, i + 1)
      if (!n.startsWith('.') && !n.startsWith(')')) break
    }
  }
  return teile.join('\n')
}

/**
 * Der Beginn der Anweisung, in der `idx` liegt: rueckwaerts bis zur letzten Zeile, die
 * eine Anweisung eroeffnet (const/let/var/await/return/if) — Fortsetzungszeilen
 * (beginnen mit `.` oder sind leer) gehoeren noch dazu.
 */
export function anweisungVor(code, idx) {
  const bis = code.slice(0, idx)
  const zeilen = bis.split('\n')
  for (let i = zeilen.length - 1; i >= 0; i--) {
    const t = zeilen[i].trim()
    if (t === '' || t.startsWith('.')) continue
    return zeilen[i]
  }
  return ''
}

function naechsteNichtLeere(zeilen, ab) {
  for (let i = ab; i < zeilen.length; i++) {
    const t = zeilen[i].trim()
    if (t !== '') return t
  }
  return ''
}

function klammerBilanz(z) {
  let n = 0
  for (const c of z) {
    if (c === '(' || c === '[' || c === '{') n++
    else if (c === ')' || c === ']' || c === '}') n--
  }
  return n
}

/**
 * @param {string} src Dateiinhalt
 * @returns {{line:number, table:string, zeilen:number}[]}
 */
export function scanContent(src) {
  if (src.includes(SKIP_MARKER)) return []
  const code = stripComments(src)
  const out = []

  const fromRe = /\.from\(\s*['"]([a-z0-9_]+)['"]\s*\)/gi
  let m
  while ((m = fromRe.exec(code)) !== null) {
    const table = m[1]
    if (!(table in GROSSE_TABELLEN)) continue

    // Ueber eine Variable aufgebaut? Dann kann die Grenze in einer ANDEREN Anweisung
    // stehen (`q = q.or(…); await q.limit(20)`) -> nie flaggen.
    // ⚠ Der Anweisungsbeginn steht oft nicht auf derselben Zeile wie `.from(`:
    //     let q = adminDb
    //       .from('sv_leads')
    // Deshalb rueckwaerts bis zum Beginn der Anweisung suchen, nicht nur bis zum
    // Zeilenanfang.
    if (/^\s*(let|var)\s+[\w$]+\s*=/.test(anweisungVor(code, m.index))) continue

    const kette = ketteAb(code, m.index)
    if (WRITE_METHODEN.test(kette)) continue
    if (BEGRENZER.test(kette)) continue
    if (ID_FILTER.test(kette)) continue

    out.push({
      line: code.slice(0, m.index).split('\n').length,
      table,
      zeilen: GROSSE_TABELLEN[table],
    })
  }
  return out
}

/**
 * @param {string[]} aktuell Verletzer-Files jetzt
 * @param {string[]} baseline Verletzer-Files der Baseline
 */
export function diffBaseline(aktuell, baseline) {
  const b = new Set(baseline)
  const a = new Set(aktuell)
  return {
    neu: aktuell.filter((f) => !b.has(f)).sort(),
    behoben: baseline.filter((f) => !a.has(f)).sort(),
  }
}
