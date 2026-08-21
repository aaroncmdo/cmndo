/**
 * Filter, Sortierung und Blättern für die SV-Leads-Liste.
 *
 * Reine Logik, ohne Datenbank — damit die Fallen einzeln prüfbar sind.
 *
 * ⚠ Der Anlass: Die Liste lud hart `.limit(200)` sortiert nach zuletzt geändert.
 * Solange der Bestand aus 62 gepflegten Leads bestand, war das unauffällig. Nach
 * dem Deutschland-Scrape (21.08.2026) standen 4.644 Leads in der Tabelle — und
 * die Ansicht zeigte 200, davon 200 frisch entdeckte und KEINEN einzigen der 62
 * gepflegten. Der Vertrieb sah seine eigene Arbeitsliste nicht mehr.
 *
 * ⭐ Dieselbe Klasse wie die Admin-Aufgabenliste (#5457): eine Kopfzeile, die
 * „947 von 1000" sagte, während 1000 das Limit war und 49 % der offenen
 * Aufgaben unerreichbar blieben. Ein Deckel ohne Gesamtzahl ist unsichtbar.
 */

/** Wie viele Zeilen eine Seite trägt. */
export const PRO_SEITE = 50

/** Quellen, die ein automatischer Lauf erzeugt hat — niemand hat sie gepflegt. */
export const ENTDECKT_QUELLEN = ['places_discovery'] as const

export type Bestand = 'alle' | 'gepflegt' | 'entdeckt'
export type Sortierung = 'aktualisiert' | 'score' | 'firma' | 'ort'

export type SvLeadFilter = {
  suche: string
  bestand: Bestand
  status: string | null
  sortierung: Sortierung
  seite: number
}

const BESTAND_WERTE: readonly Bestand[] = ['alle', 'gepflegt', 'entdeckt']
const SORTIERUNG_WERTE: readonly Sortierung[] = ['aktualisiert', 'score', 'firma', 'ort']

/**
 * Zeichen, die den PostgREST-`or()`-Ausdruck zerlegen würden.
 *
 * ⚠ `or('firma.ilike.%a,b%')` liest PostgREST als ZWEI Bedingungen — das Komma
 * trennt sie. Klammern öffnen Gruppen, der Punkt trennt Spalte/Operator/Wert.
 * Ein Suchbegriff „Meyer, Schulz (GbR)" erzeugt damit keinen Treffer, sondern
 * einen Syntaxfehler, und die Liste bliebe leer — ohne dass jemand sähe, warum.
 *
 * Bewusst entfernt statt maskiert: Anführungszeichen um den Wert würden zwar
 * Kommas erlauben, verschieben das Problem aber auf das Anführungszeichen
 * selbst. Für eine Namenssuche sind diese Zeichen entbehrlich.
 */
const GEFAEHRLICH = /[,()".*\\%]/g

export function bereinigeSuche(roh: string): string {
  return roh.replace(GEFAEHRLICH, ' ').replace(/\s+/g, ' ').trim().slice(0, 80)
}

/**
 * Der PostgREST-`or`-Ausdruck für die Freitextsuche.
 *
 * Gesucht wird über die vier Felder, nach denen im Vertrieb tatsächlich gesucht
 * wird: Firma, Name, Ort, Postleitzahl. `null`, wenn nichts Brauchbares übrig
 * bleibt — der Aufrufer lässt die Bedingung dann ganz weg, statt auf `%%` zu
 * filtern (das träfe alles und sähe aus wie „Suche ohne Wirkung").
 */
export function suchAusdruck(roh: string): string | null {
  const rein = bereinigeSuche(roh)
  if (rein.length < 2) return null
  const m = `%${rein}%`
  return `firma.ilike.${m},name.ilike.${m},ort.ilike.${m},plz.ilike.${m}`
}

export function seitenAnzahl(gesamt: number, proSeite = PRO_SEITE): number {
  return Math.max(1, Math.ceil(gesamt / proSeite))
}

/**
 * Der Zeilenbereich einer Seite (beide Grenzen einschließlich, wie `.range()`).
 *
 * ⚠ Die Seite wird auf den gültigen Bereich geklemmt. Ohne das liefert eine
 * URL mit `?seite=999` eine leere Tabelle, die wie „keine Treffer" aussieht.
 */
export function seitenBereich(
  seite: number,
  gesamt: number,
  proSeite = PRO_SEITE,
): { von: number; bis: number; seite: number } {
  const letzte = seitenAnzahl(gesamt, proSeite)
  const s = Math.min(Math.max(1, Math.floor(seite) || 1), letzte)
  const von = (s - 1) * proSeite
  return { von, bis: von + proSeite - 1, seite: s }
}

function ersterWert(v: string | string[] | undefined): string {
  return (Array.isArray(v) ? v[0] : v) ?? ''
}

/**
 * Liest den Filter aus den URL-Parametern.
 *
 * Die URL ist der Zustand — damit bleibt eine gefilterte Ansicht teilbar und
 * über den Zurück-Knopf erreichbar. Unbekannte Werte fallen auf die Vorgabe
 * zurück, statt eine Abfrage mit unsinnigen Bedingungen zu bauen.
 */
export function leseFilter(
  sp: Record<string, string | string[] | undefined> = {},
): SvLeadFilter {
  const bestandRoh = ersterWert(sp.bestand) as Bestand
  const sortierungRoh = ersterWert(sp.sortierung) as Sortierung
  const seiteRoh = Number.parseInt(ersterWert(sp.seite), 10)

  return {
    suche: bereinigeSuche(ersterWert(sp.suche)),
    bestand: BESTAND_WERTE.includes(bestandRoh) ? bestandRoh : 'alle',
    status: ersterWert(sp.status).trim() || null,
    sortierung: SORTIERUNG_WERTE.includes(sortierungRoh) ? sortierungRoh : 'aktualisiert',
    seite: Number.isFinite(seiteRoh) && seiteRoh > 0 ? seiteRoh : 1,
  }
}

/** Nach welcher Spalte sortiert wird — und in welche Richtung. */
export function sortierSpalte(s: Sortierung): { spalte: string; aufsteigend: boolean } {
  switch (s) {
    // ⚠ Aufsteigend: der NIEDRIGSTE Wert ist der größte Nachholbedarf — genau
    // wonach der Vertrieb sucht. Absteigend zeigte die Vorbildlichen zuerst.
    case 'score': return { spalte: 'levelup_letzter_score', aufsteigend: true }
    case 'firma': return { spalte: 'firma', aufsteigend: true }
    case 'ort': return { spalte: 'ort', aufsteigend: true }
    default: return { spalte: 'aktualisiert_am', aufsteigend: false }
  }
}

/** Baut die URL für einen geänderten Filter — bestehende Werte bleiben erhalten. */
export function filterUrl(f: SvLeadFilter, aenderung: Partial<SvLeadFilter>): string {
  const neu = { ...f, ...aenderung }
  // Jede Änderung außer dem Blättern führt auf Seite 1 zurück: Seite 7 eines
  // anderen Filters ist selten die gemeinte Seite und oft leer.
  if (aenderung.seite === undefined) neu.seite = 1

  const p = new URLSearchParams()
  if (neu.suche) p.set('suche', neu.suche)
  if (neu.bestand !== 'alle') p.set('bestand', neu.bestand)
  if (neu.status) p.set('status', neu.status)
  if (neu.sortierung !== 'aktualisiert') p.set('sortierung', neu.sortierung)
  if (neu.seite > 1) p.set('seite', String(neu.seite))

  const s = p.toString()
  return s ? `?${s}` : '?'
}
