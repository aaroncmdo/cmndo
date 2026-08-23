// Findet Autobahnknoten, die sich selbst widersprechen — ohne jede externe Quelle.
//
// WOFUER: Ein Knoten heisst entweder Kreuz oder Dreieck, nie beides. Steht
// derselbe Ort in einer Stadt als „Kreuz X" und in einer anderen als „Dreieck X",
// ist mindestens eine der beiden Angaben falsch — unabhaengig davon, welche.
//
// ⭐ Das ist der Grund, warum diese Pruefung etwas kann, was Recherche nicht
// kann: Sie BEWEIST einen Fehler, ohne die Wahrheit zu kennen. Bei 656 Knoten
// ueber 173 Staedte ist eine Vollrecherche teuer; dieser Filter kostet nichts
// und trifft trotzdem hart.
//
// Gefunden 23.08.2026 von einem Subagenten, nachdem eine Stichprobe von 10
// Staedten 7 erfundene Knoten zutage gefoerdert hatte. Die Kalibrierung: Der
// Filter findet zwei extern verifizierte Befunde (Recklinghausen, Darmstadt)
// blind wieder — er misst also dieselbe Sache wie die teure Pruefung.
//
// Reine Logik, kein Netz, keine DB.

/** Kreuz | Dreieck | null (Anschlussstelle, Auffahrt, Sonstiges). */
export function gattung(knoten) {
  const t = String(knoten ?? '')
  // Beide Schreibweisen: „Kreuz Bottrop" und „Bottroper Kreuz", „Autobahnkreuz X".
  if (/\b(autobahn)?kreuz\b/i.test(t)) return 'Kreuz'
  if (/\b(autobahn)?dreieck\b/i.test(t)) return 'Dreieck'
  return null
}

/**
 * Der Ortsteil eines Knotennamens, ohne Gattungswort und Zusaetze.
 *
 * „Kreuz Bottrop" → „bottrop"; „Bottroper Kreuz" → „bottroper"; die beiden
 * fallen also NICHT zusammen. Bewusst so: eine Normalisierung ueber
 * Adjektiv-Endungen wuerde „Bremer" und „Bremerhaven" verschmelzen und damit
 * zwei verschiedene Orte zu einem Widerspruch erklaeren.
 */
export function kern(knoten) {
  return String(knoten ?? '')
    .replace(/\b(autobahn)?(kreuz|dreieck)\b/gi, ' ')
    .replace(/\([^)]*\)/g, ' ')       // „(A3/A46)"
    .replace(/\bA\d+\b|\bB\d+\b/g, ' ')
    .replace(/[^\p{L}\p{N}/\-\s]/gu, ' ')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
}

/**
 * Widersprueche ueber alle Staedte.
 * `staedte` = [{ slug, knoten: string[] }]
 */
export function findeWiderspruecke(staedte) {
  /** kern → Map<gattung, Set<slug>> */
  const nachKern = new Map()
  for (const s of staedte) {
    for (const k of s.knoten ?? []) {
      const g = gattung(k)
      if (!g) continue
      const c = kern(k)
      if (!c) continue
      if (!nachKern.has(c)) nachKern.set(c, new Map())
      const m = nachKern.get(c)
      if (!m.has(g)) m.set(g, new Map())
      m.get(g).set(s.slug, k)
    }
  }
  const treffer = []
  for (const [c, m] of nachKern) {
    if (m.size < 2) continue
    treffer.push({
      kern: c,
      varianten: [...m.entries()].map(([g, slugs]) => ({
        gattung: g,
        vorkommen: [...slugs.entries()].map(([slug, name]) => ({ slug, name })),
      })),
    })
  }
  treffer.sort((a, b) => a.kern.localeCompare(b.kern))
  return treffer
}

/**
 * Knoten, deren Ortsteil NICHT zur Stadt gehoert, in deren Liste sie stehen.
 *
 * Faengt die zweite belegte Klasse: „Kreuz Werl" bei Arnsberg, „Kreuz Hilden"
 * bei Haan, „Dreieck Bocholt-Nord" bei Muenster (70 km entfernt).
 *
 * ⚠ BEWUSST NUR EIN HINWEIS, kein Befund: Ein Knoten darf legitim nach einer
 * Nachbarstadt heissen und die eigene trotzdem erschliessen (das Kamener Kreuz
 * erschliesst auch Bergkamen). Die Entscheidung braucht Ortskenntnis — dieser
 * Filter liefert nur die Kandidatenliste.
 */
export function fremdeOrtsnamen(staedte, alleStadtnamen) {
  const bekannt = new Map()
  for (const [slug, name] of alleStadtnamen) bekannt.set(name.toLowerCase(), slug)
  const treffer = []
  for (const s of staedte) {
    const eigen = (alleStadtnamen.get(s.slug) ?? s.slug).toLowerCase()
    for (const k of s.knoten ?? []) {
      if (!gattung(k)) continue
      const c = kern(k)
      for (const [name, fremdSlug] of bekannt) {
        if (fremdSlug === s.slug) continue
        if (name.length < 4) continue
        // Ortsteil des Knotens beginnt mit einem ANDEREN Stadtnamen,
        // und der eigene kommt darin nicht vor.
        if (c.startsWith(name) && !c.includes(eigen)) {
          treffer.push({ slug: s.slug, knoten: k, fremd: fremdSlug })
          break
        }
      }
    }
  }
  return treffer
}
