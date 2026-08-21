import type { Holer } from '../anreicherung/lauf'
import type { Db } from '../anreicherung/schreiben'
import type { PlacesAdapter } from '../places'
import { ladeCheck, type Check } from './check'
import type { Befund, Fehlstelle, MessRegistry, Messkontext } from './modul-vertrag'
import type { ModulId } from './registry'
import { berechneScore } from './score'
import { pruefeBefunde } from './validator'
import { ordneCheckZu } from './zuordnung'

/** Was je Modul in `levelup_checks.befunde` landet. */
export type ModulErgebnis = {
  befunde: Befund[]
  istPunkte: number
  maxPunkte: number
}

export type MessOpts = {
  hole: Holer
  places: PlacesAdapter
  jetzt: () => string
  registry: MessRegistry
  /** Wird nach jedem Modul gerufen — fuer Protokollierung im CLI. */
  fortschritt?: (modul: ModulId, zustand: 'fertig' | 'fehler') => void
}

export type MessErgebnis =
  | { ok: true; istPunkte: number; punkteErhebbar: number; score: number | null; keinScore: boolean }
  | { ok: false; error: string }

/**
 * Fuehrt die gewaehlten Module aus und schreibt das Ergebnis in den Check.
 *
 * Zwei Entscheidungen, die den Nutzer schuetzen:
 *
 * 1. **Nach jedem Modul wird geschrieben.** F-04 leitet den Fortschritt aus den
 *    vorhandenen Befunden ab — ohne Zwischenstaende zeigte die Pruefliste zehn
 *    Minuten „wartet" und dann alles auf einmal. Der Fortschritt waere eine
 *    Animation, keine Auskunft.
 *
 * 2. **Ein Modulfehler beendet den Lauf nicht.** Sonst entscheidet ein einzelner
 *    fremder Server darueber, ob jemand ueberhaupt einen Befund bekommt. Der
 *    Fehler wird zur Fehlstelle mit Grund (R-B).
 */
export async function messeCheck(db: Db, token: string, opts: MessOpts): Promise<MessErgebnis> {
  const check = await ladeCheck(db, token)
  if (!check) return { ok: false, error: 'unbekannt' }

  const kontext: Messkontext = {
    modus: check.modus,
    websiteUrl: check.website_url,
    standort: check.standort_lat !== null && check.standort_lng !== null
      ? { lat: check.standort_lat, lng: check.standort_lng, ort: check.standort_ort, plz: check.standort_plz }
      : null,
    hole: opts.hole,
    places: opts.places,
    jetzt: opts.jetzt,
  }

  const befunde: Record<string, ModulErgebnis> = {}
  const fehlstellen: Record<string, Fehlstelle[]> = {}
  let istPunkte = 0

  for (const modulId of check.module_gewaehlt) {
    const messe = opts.registry[modulId]

    if (!messe) {
      // Ein Modul ohne Messfunktion ist NICHT „0 Punkte" — es wurde nicht
      // gemessen. Der Unterschied ist der ganze Sinn von R-B.
      fehlstellen[modulId] = [{
        schluessel: modulId,
        grund: 'Dieses Modul wird noch nicht gemessen.',
      }]
      opts.fortschritt?.(modulId, 'fehler')
      continue
    }

    try {
      const ergebnis = await messe(kontext)
      const geprueft = pruefeBefunde(ergebnis.befunde)

      befunde[modulId] = {
        befunde: geprueft.gueltig,
        istPunkte: geprueft.istPunkte,
        maxPunkte: geprueft.maxPunkte,
      }
      istPunkte += geprueft.istPunkte

      const alle = [...ergebnis.fehlstellen, ...geprueft.fehlstellen]
      if (alle.length > 0) fehlstellen[modulId] = alle

      opts.fortschritt?.(modulId, 'fertig')
    } catch (err) {
      const text = err instanceof Error ? err.message : String(err)
      fehlstellen[modulId] = [{ schluessel: modulId, grund: `Messung fehlgeschlagen: ${text}` }]
      opts.fortschritt?.(modulId, 'fehler')
    }

    // Zwischenstand — siehe Punkt 1 oben.
    //
    // ⚠ Als KOPIE, nicht als Referenz: `befunde` waechst mit jedem Modul
    // weiter. Wer die Referenz weitergibt, uebergibt ein Objekt, das sich nach
    // dem Absenden noch aendert — der „Zwischenstand nach Modul 1" enthielte
    // dann bereits Modul 2. Dass supabase-js beim Senden serialisiert, ist
    // Verlass auf einen Zeitpunkt, den wir nicht kontrollieren.
    await schreibeStand(db, token, {
      befunde: { ...befunde },
      fehlstellen: { ...fehlstellen },
    })
  }

  // ⚠ Der Nenner steht erst NACH der Messung fest, nicht bei der Modulwahl.
  //
  // `check.punkte_erhebbar` ist die Schaetzung aus F-02: die Summe der
  // gewaehlten Module. Zu dem Zeitpunkt weiss niemand, welche davon wirklich
  // messen — ein Modul ohne Messfunktion, eine gesperrte robots.txt oder eine
  // Anwendung, die ihre Inhalte erst im Browser aufbaut, liefern nichts.
  // Bliebe die Schaetzung der Nenner, zaehlten diese Punkte als NICHT
  // ERREICHT statt als NICHT GEMESSEN (R-B).
  //
  // Am 19.08. im Durchlauf gemessen: 54 von 76 tatsaechlich erhobenen Punkten
  // ergaben gegen die Schaetzung (116) einen Wert von 47 % statt 71 %.
  const punkteErhebbar = Object.values(befunde).reduce((s, m) => s + m.maxPunkte, 0)
  const { score, keinScore } = berechneScore(istPunkte, punkteErhebbar)

  const { data: zeilen, error } = await db
    .from('levelup_checks')
    .update({
      befunde, fehlstellen,
      punkte_erhebbar: punkteErhebbar,
      score, kein_score: keinScore,
      status: 'fertig',
      erhoben_am: opts.jetzt(),
    })
    .eq('token', token)
    .select()

  if (error) return { ok: false, error: `Abschluss fehlgeschlagen: ${error.message}` }
  if (!zeilen || zeilen.length === 0) return { ok: false, error: 'abschluss_wirkungslos' }

  // Den Bestandslead nachtragen, wenn es einen gibt.
  //
  // ⚠ NICHT kritisch: die Messung steht auch ohne Zuordnung, und der Nutzer
  // sieht seinen Befund. Aber der Fehlschlag MUSS auftauchen — ohne die
  // Zuordnung bleibt `sv_leads.levelup_letzter_score` leer, und genau danach
  // sortiert der Vertrieb.
  //
  // ⚠ Ein Treffer wird protokolliert, ein Nicht-Treffer AUCH. „Kein Lead
  // gefunden" ist eine Auskunft ueber den Bestand; als Schweigen waere sie von
  // „gar nicht gesucht" nicht zu unterscheiden.
  const zuordnung = await ordneCheckZu(db, {
    id: check.id,
    firmenname: check.firmenname,
    website_url: check.website_url,
    lat: check.standort_lat,
    lng: check.standort_lng,
    score,
  })
  if (!zuordnung.ok) console.error('Lead-Zuordnung fehlgeschlagen:', zuordnung.error)

  const { error: evFehler } = await db.from('levelup_events').insert({
    check_id: check.id,
    typ: 'messung_beendet',
    payload: {
      istPunkte, punkteErhebbar, score, keinScore,
      leadZuordnung: zuordnung.ok ? (zuordnung.treffer?.wie ?? 'kein_treffer') : 'fehlgeschlagen',
    },
  })
  if (evFehler) console.error('levelup_events:', evFehler.message)

  return { ok: true, istPunkte, punkteErhebbar, score, keinScore }
}

/** Zwischenstand — ein Fehlschlag hier darf den Lauf nicht beenden. */
async function schreibeStand(
  db: Db,
  token: string,
  stand: { befunde: Record<string, ModulErgebnis>; fehlstellen: Record<string, Fehlstelle[]> },
): Promise<void> {
  const { error } = await db
    .from('levelup_checks')
    .update(stand)
    .eq('token', token)
    .select()

  if (error) console.error('Zwischenstand nicht gespeichert:', error.message)
}

/** Nur fuer Tests und den CLI-Runner — die Module, die es schon gibt. */
export function baueRegistry(module: MessRegistry): MessRegistry {
  return module
}

export type { Check }
