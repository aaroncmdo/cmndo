/**
 * Findet Aufrufe einer Result-Object-Action, deren Fehlschlag niemand lesen kann.
 *
 * ANLASS (Aaron 28.08.2026): *„Ich habe die Felder im Flowlink veraendert und die wurden
 * nicht uebernommen."* An drei Stellen stand:
 *
 * ```ts
 * void speichereFeststellungFlow(token, values).catch(() => {})
 * ```
 *
 * ⭐⭐ Das `.catch()` faengt dort **nichts**. Eine Action, die `Promise<{ ok, error }>`
 * liefert, **wirft nie** — der Fehlschlag steht im Rueckgabewert, der verworfen wird.
 * Dieselbe Klasse wie „ein try/catch um einen Supabase-Call ist reine Dekoration"
 * (AGENTS.md §Stille-Writes), nur eine Ebene hoeher.
 *
 * Der Nutzer sieht seinen Wert sofort — er steht im lokalen State. Ob er ankam, sagt niemand.
 *
 * ⭐ Die Klasse ist klein und war beim Messen bereits vollstaendig: genau **3** Fundstellen,
 * alle drei in derselben Lane. Deshalb Baseline 0 statt Grandfathering — die Bremse haelt zu,
 * was gerade zu ist.
 */

/** Entfernt Kommentare, damit eine Erklaerung nicht ihr eigenes File flaggt. */
export function entrausche(inhalt) {
  return inhalt
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/[^\n]*/g, '$1 ')
}

/**
 * Sammelt die Namen aller Funktionen, die ein Result-Object zurueckgeben.
 * Diese Funktionen werfen per Konvention NIE (AGENTS.md §Server-Actions).
 */
export function sammleResultFunktionen(inhalte) {
  const namen = new Set()
  for (const inhalt of inhalte) {
    for (const m of inhalt.matchAll(
      /export\s+(?:async\s+)?function\s+([A-Za-z0-9_]+)[^{]*?Promise<\s*\{\s*(?:ok|success)/g,
    )) {
      namen.add(m[1])
    }
  }
  return namen
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * @param {string} inhalt   Dateiinhalt
 * @param {Set<string>} resultFns  Namen der Result-Object-Funktionen
 * @returns {Array<{ zeile: number, fn: string, text: string }>}
 */
export function scanneResultCatch(inhalt, resultFns) {
  if (resultFns.size === 0) return []
  const sauber = entrausche(inhalt)
  if (!/\.catch\(/.test(sauber)) return []

  const funde = []
  const zeilen = sauber.split('\n')
  zeilen.forEach((z, i) => {
    // NUR der LEERE catch. `.catch(e => console.error(e))` ist bewusstes
    // fire-and-forget MIT Spur — das ist legitim und wird nie geflaggt
    // (real: 4 Stellen im content-studio, dort sogar im Kommentar begruendet).
    if (!/\.catch\(\s*\(\s*\)\s*=>\s*\{\s*\}\s*\)/.test(z)) return
    for (const fn of resultFns) {
      if (new RegExp(`\\b${escape(fn)}\\s*\\(`).test(z)) {
        funde.push({ zeile: i + 1, fn, text: z.trim().slice(0, 120) })
        break
      }
    }
  })
  return funde
}
