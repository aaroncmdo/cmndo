import type { Db } from '../anreicherung/schreiben'
import { DUBLETTEN_KM, entfernungKm, istDublette } from './dubletten'

/**
 * Welcher Bestandslead gehoert zu dieser Messung?
 *
 * Bis hierher wurde ein Check erst beim TERMINWUNSCH mit einem Lead verbunden
 * (`termin.ts`, F-06) — also erst, wenn jemand seinen Namen hinterlaesst. Auf
 * prod gemessen (21.08.): 11 Checks, davon 2 verknuepft. Die uebrigen 9 lagen
 * neben ihrem Betrieb, ohne ihn zu kennen, obwohl Firmenname, Anschrift,
 * Website und Koordinaten im Check standen.
 *
 * Fuer den Vertrieb ist das der Unterschied zwischen einer Messung und einem
 * Bestand: `sv_leads.levelup_letzter_score` ist die Spalte, nach der sich
 * sortieren laesst, wer den groessten Nachholbedarf hat. Bleibt sie leer, ist
 * jede Messung ein Einzelblatt.
 *
 * ⚠ ES WIRD NIE EIN LEAD ANGELEGT. Die Startseite sagt zu: „Es entsteht kein
 * Kundenkonto und kein Eintrag in einer Interessentenliste." Einen BESTEHENDEN
 * Eintrag um sein Messergebnis zu ergaenzen bricht diese Zusage nicht — einen
 * neuen anzulegen waere genau das, was dort ausgeschlossen wird. Deshalb kennt
 * dieses Modul nur `finde`, nicht `findeOderLegeAn` (das ist der Termin-Pfad,
 * wo die Einwilligung vorliegt).
 */

export type LeadKandidat = {
  id: string
  firma: string | null
  name: string
  lat: number
  lng: number
  website_url: string | null
  /** Fuer den Termin-Pfad, der Leerstellen ergaenzt — hier nur durchgereicht. */
  telefon?: string | null
  email?: string | null
}

/** Die Spalten, die ein Kandidat braucht — an einer Stelle, damit die zwei Abfragen nicht driften. */
export const KANDIDAT_SPALTEN = 'id,firma,name,lat,lng,website_url,telefon,email'

export type CheckAngabe = {
  firmenname: string | null
  website_url: string | null
  lat: number | null
  lng: number | null
}

/** Wie der Treffer zustande kam — er wird mitprotokolliert, nicht nur benutzt. */
export type Wie = 'domain' | 'domain_und_umkreis' | 'name_und_umkreis'

/**
 * ⚠ Der Kandidat wird MITGEGEBEN, nicht nur seine Kennung. Der Termin-Pfad
 * ergaenzt anschliessend Leerstellen am Lead und braeuchte ihn sonst als
 * zweite Abfrage — dieselbe Zeile, zweimal geholt, mit dem Risiko, dass sich
 * die beiden Abfragen auseinanderentwickeln.
 */
export type Treffer = { leadId: string; wie: Wie; lead: LeadKandidat }

/**
 * Die Domain einer Adresse, vergleichbar gemacht.
 *
 * Ohne Protokoll, ohne `www.`, ohne Pfad, klein. „https://www.Sv-Bergk.de/team"
 * und „sv-bergk.de" sind dieselbe Domain — und genau in dieser Bandbreite
 * stehen die Werte im Bestand.
 */
export function domainVon(url: string | null): string | null {
  const roh = url?.trim()
  if (!roh) return null

  const host = roh
    .replace(/^[a-z]+:\/\//i, '')
    .replace(/^www\./i, '')
    .replace(/[/?#].*$/, '')
    .replace(/:\d+$/, '')
    .toLowerCase()
    .trim()

  // Ein Host ohne Punkt ist keine Domain, sondern ein Tippfehler oder
  // „localhost". Ihn zu vergleichen erzeugte Treffer zwischen Betrieben, die
  // nur gemeinsam haben, dass ihre Adresse kaputt ist.
  return host.includes('.') ? host : null
}

/**
 * Der Abgleich selbst — rein, ohne Datenbank.
 *
 * Zwei Stufen, nach Beweiskraft geordnet:
 *
 *   1. Die DOMAIN. Zwei Betriebe teilen sich keine Website — ausser sie
 *      gehoeren zur selben Kette.
 *   2. NAME UND UMKREIS, das bestehende Dublettenverfahren.
 *
 * ⚠ Stufe 1 gilt nur, wenn die Domain im Bestand EINDEUTIG ist. Am Bestand
 * gemessen (21.08.): 100 der 2.643 Leads sind Kettenbetriebe — 37 TÜV, 24 GTÜ,
 * 23 DEKRA, 16 KÜS, jeder in einer anderen Stadt. Traegt die Kette EINE Domain,
 * traefe eine reine Domain-Regel irgendeine Station, und die Messung aus
 * Flensburg landete in Passau. Bei mehreren Kandidaten entscheidet deshalb der
 * Umkreis; bleibt es uneindeutig, faellt die Stufe aus, statt zu raten.
 */
export function waehleTreffer(
  check: CheckAngabe,
  mitGleicherDomain: LeadKandidat[],
  imUmkreis: LeadKandidat[],
): Treffer | null {
  if (mitGleicherDomain.length === 1) {
    return { leadId: mitGleicherDomain[0].id, wie: 'domain', lead: mitGleicherDomain[0] }
  }

  if (mitGleicherDomain.length > 1 && check.lat !== null && check.lng !== null) {
    const lat = check.lat
    const lng = check.lng
    const nah = mitGleicherDomain.filter(
      (k) => entfernungKm(lat, lng, k.lat, k.lng) <= DUBLETTEN_KM,
    )
    if (nah.length === 1) return { leadId: nah[0].id, wie: 'domain_und_umkreis', lead: nah[0] }
    // Mehrere Stationen derselben Kette im selben Umkreis: nicht entscheidbar.
    // Weiter zu Stufe 2 — der Name kann trennen, wo die Domain es nicht kann.
  }

  if (check.lat === null || check.lng === null) return null

  const lat = check.lat
  const lng = check.lng
  const ueberName = imUmkreis.find((k) =>
    istDublette(
      { firma: check.firmenname, lat, lng },
      { firma: k.firma ?? k.name, lat: k.lat, lng: k.lng },
    ),
  )

  return ueberName ? { leadId: ueberName.id, wie: 'name_und_umkreis', lead: ueberName } : null
}

export type ZuordnungErgebnis =
  | { ok: true; treffer: Treffer | null }
  | { ok: false; error: string }

/** ~0,15° sind rund 15 km — mehr als DUBLETTEN_KM, damit der Grobfilter nichts abschneidet. */
const BOX_GRAD = 0.15

/**
 * Sucht den passenden Lead — und schreibt NICHTS.
 *
 * Getrennt von `ordneCheckZu`, damit ein Trockenlauf zeigen kann, was zugeordnet
 * WUERDE, ohne es zu tun. Eine Vorschau, die dafuer schreiben muss, ist keine.
 *
 * ⚠ Findet sich nichts, ist das ein ERGEBNIS, kein Fehler: der Betrieb steht
 * schlicht nicht im Bestand. `ok: true, treffer: null` — der Aufrufer soll
 * beides unterscheiden koennen, ohne einen Fehlertext zu lesen.
 */
export async function sucheTreffer(db: Db, check: CheckAngabe): Promise<ZuordnungErgebnis> {
  const domain = domainVon(check.website_url)

  let mitDomain: LeadKandidat[] = []
  if (domain) {
    // ⚠ BUNDESWEIT suchen, nicht im Umkreis. Sonst bliebe eine Kette
    // unentdeckt, deren zweite Station ausserhalb liegt — und die
    // Eindeutigkeitspruefung oben waere eine Attrappe, die immer „eindeutig"
    // sagt, weil sie nur einen Ausschnitt sieht.
    const { data, error } = await db
      .from('sv_leads')
      .select(KANDIDAT_SPALTEN)
      .not('website_url', 'is', null)
      .ilike('website_url', `%${domain}%`)

    if (error) return { ok: false, error: `Domain-Abgleich fehlgeschlagen: ${error.message}` }

    // Der `ilike`-Filter ist ein Grobfilter — „sv-bergk.de" trifft auch
    // „nicht-sv-bergk.de". Die Gleichheit wird hier entschieden, nicht in SQL.
    mitDomain = ((data ?? []) as LeadKandidat[]).filter(
      (k) => domainVon(k.website_url) === domain,
    )
  }

  let imUmkreis: LeadKandidat[] = []
  if (check.lat !== null && check.lng !== null) {
    const { data, error } = await db
      .from('sv_leads')
      .select(KANDIDAT_SPALTEN)
      .gte('lat', check.lat - BOX_GRAD)
      .lte('lat', check.lat + BOX_GRAD)
      .gte('lng', check.lng - BOX_GRAD)
      .lte('lng', check.lng + BOX_GRAD)

    if (error) return { ok: false, error: `Umkreis-Abgleich fehlgeschlagen: ${error.message}` }
    imUmkreis = (data ?? []) as LeadKandidat[]
  }

  return { ok: true, treffer: waehleTreffer(check, mitDomain, imUmkreis) }
}

/**
 * Sucht den Lead und traegt die Messung an BEIDEN Enden nach.
 *
 * Beide Nachtraege werden auf ihre Zeilenzahl geprueft: ein Update, das 0 Zeilen
 * trifft, liefert bei supabase-js `error === null` und saehe sonst aus wie
 * Erfolg.
 */
export async function ordneCheckZu(
  db: Db,
  check: CheckAngabe & { id: string; score: number | null },
): Promise<ZuordnungErgebnis> {
  const gefunden = await sucheTreffer(db, check)
  if (!gefunden.ok) return gefunden

  const treffer = gefunden.treffer
  if (!treffer) return { ok: true, treffer: null }

  const { data: checkZeilen, error: checkFehler } = await db
    .from('levelup_checks')
    .update({ sv_lead_id: treffer.leadId })
    .eq('id', check.id)
    .select()

  if (checkFehler) return { ok: false, error: `Verknuepfung am Check: ${checkFehler.message}` }
  if (!checkZeilen || (checkZeilen as unknown[]).length === 0) {
    return { ok: false, error: 'Verknuepfung wirkungslos — keine Zeile getroffen.' }
  }

  const { data: leadZeilen, error: leadFehler } = await db
    .from('sv_leads')
    .update({ levelup_letzter_check_id: check.id, levelup_letzter_score: check.score })
    .eq('id', treffer.leadId)
    .select()

  if (leadFehler) return { ok: false, error: `Nachtrag am Lead: ${leadFehler.message}` }
  if (!leadZeilen || (leadZeilen as unknown[]).length === 0) {
    return { ok: false, error: 'Nachtrag am Lead wirkungslos — keine Zeile getroffen.' }
  }

  return { ok: true, treffer }
}
