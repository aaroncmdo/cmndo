import type { Db } from '../anreicherung/schreiben'

export const ZONE = 'Europe/Berlin'

/**
 * Das Raster der Beratungstermine in deutscher ORTSZEIT.
 *
 * ⚠ Ortszeit, nicht UTC. Ein an UTC gebundenes Raster wandert mit der
 * Sommerzeit: 07:00 UTC sind im August 09:00, im Dezember aber 08:00
 * (nachgemessen 19.08.). Der Sachverstaendige sieht die Uhrzeit auf der
 * Kachel, nicht den Zeitzonen-Versatz — also muss die Uhrzeit feststehen.
 */
export const SLOT_STUNDEN = [9, 11, 14, 16]
export const ANZAHL_SLOTS = 6
export const VORLAUF_STUNDEN = 2
export const TAGE_VORAUS = 21

export type Slot = { start: string; label: string }

const WOCHENTAG = ['So', 'Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa']

/**
 * Versatz einer Zone zu UTC — robust gegen die Zeitzone des Servers.
 *
 * Beide Seiten werden mit demselben Locale gelesen, deshalb hebt sich die
 * lokale Interpretation heraus. Ein direkter `new Date(x.toLocaleString(...))`
 * waere von der Systemzone abhaengig und auf einem UTC-Server anders als auf
 * einem deutschen.
 */
function versatzMs(zeitpunkt: Date, zone: string): number {
  const alsUtc = new Date(zeitpunkt.toLocaleString('en-US', { timeZone: 'UTC' }))
  const alsOrt = new Date(zeitpunkt.toLocaleString('en-US', { timeZone: zone }))
  return alsOrt.getTime() - alsUtc.getTime()
}

/** Eine Ortszeit-Angabe in den echten Zeitpunkt umrechnen. */
function ortszeit(jahr: number, monat: number, tag: number, stunde: number): Date {
  const kandidat = new Date(Date.UTC(jahr, monat, tag, stunde, 0, 0, 0))
  return new Date(kandidat.getTime() - versatzMs(kandidat, ZONE))
}

/** Kalendertag in der Zielzone — nicht der UTC-Tag. */
function ortsTeile(zeitpunkt: Date): { jahr: number; monat: number; tag: number; wochentag: number } {
  const ort = new Date(zeitpunkt.getTime() + versatzMs(zeitpunkt, ZONE))
  return {
    jahr: ort.getUTCFullYear(),
    monat: ort.getUTCMonth(),
    tag: ort.getUTCDate(),
    wochentag: ort.getUTCDay(),
  }
}

/**
 * F-07 · Sechs naechste freie Termine.
 *
 * Bewusst KEINE Kalender-Anbindung: F-07 sagt ausdruecklich „keine Belegung
 * reservieren — erst F-06 bucht". Das Raster laesst lediglich aus, was bereits
 * gewuenscht wurde; eine echte Verfuegbarkeitspruefung waere ein eigener
 * Baustein mit eigener Entscheidung.
 *
 * ⚠ Ein Lesefehler liefert eine LEERE Liste, nicht das volle Raster. Im
 * Zweifel keine Termine anzubieten ist sichtbar und behebbar — eine
 * Doppelbuchung merkt erst der Vertrieb im Gespraech.
 */
export async function freieSlots(db: Db, jetzt: Date): Promise<Slot[]> {
  const { data, error } = await db
    .from('levelup_termine')
    .select('slot_start')
    .in('status', ['gewuenscht', 'bestaetigt'])
    .gte('slot_start', jetzt.toISOString())

  if (error) {
    console.error('Belegte Termine nicht lesbar — es werden keine Slots angeboten:', error.message)
    return []
  }

  const belegt = new Set(
    ((data ?? []) as { slot_start: string }[]).map((z) => new Date(z.slot_start).toISOString()),
  )

  const fruehestens = jetzt.getTime() + VORLAUF_STUNDEN * 3_600_000
  const slots: Slot[] = []

  for (let versatz = 0; versatz <= TAGE_VORAUS && slots.length < ANZAHL_SLOTS; versatz++) {
    const tagesAnker = new Date(jetzt.getTime() + versatz * 86_400_000)
    const { jahr, monat, tag, wochentag } = ortsTeile(tagesAnker)

    // Kein Beratungstermin am Wochenende
    if (wochentag === 0 || wochentag === 6) continue

    for (const stunde of SLOT_STUNDEN) {
      if (slots.length >= ANZAHL_SLOTS) break

      const start = ortszeit(jahr, monat, tag, stunde)
      if (start.getTime() < fruehestens) continue

      const iso = start.toISOString()
      if (belegt.has(iso)) continue

      slots.push({ start: iso, label: beschrifte(start) })
    }
  }

  return slots
}

/** „Do 20.8. · 11:00" — deutsche Ortszeit, kurz genug fuer eine Kachel. */
function beschrifte(start: Date): string {
  const { tag, monat, wochentag } = ortsTeile(start)
  const uhr = start.toLocaleTimeString('de-DE', {
    timeZone: ZONE, hour: '2-digit', minute: '2-digit',
  })
  return `${WOCHENTAG[wochentag]} ${tag}.${monat + 1}. · ${uhr}`
}
