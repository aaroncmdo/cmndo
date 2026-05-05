// Eine Quelle der Wahrheit für „welche Dokumente werden erwartet".
//
// Aaron-Prinzip: „lead bucket → claim bucket. alles aus dem lead bucket
// wird in den claim bucket contributet. alle flows und dokumente banner
// und alles was damit zu tun hat bekommt die info — das sollte da sein
// vs. das ist da."
//
// Dieser Helper berechnet aus einem Lead/Fall-Datensatz deterministisch
// welche Slots erwartet sind. Konsumenten:
//   - DokumenteAnfordernCard (UI): rendert alle erwarteten Slots als
//     Checkboxen — kein verteiltes Conditional-Rendering pro Slot.
//   - createPflichtdokumenteFromKatalog (Server): legt nur erwartete
//     Slots als pflichtdokumente-Rows an.
//   - Banner / Pflichtdokumente-View: liest Diff erwartet ↔ vorhanden.

export type SlotErwartet = {
  slot_id: string
  label: string
  /** True wenn der Slot als „Pflicht" gilt (Banner-Counter) — sonst optional. */
  pflicht: boolean
  /** Kategorie für Gruppierung in der UI (Stammdaten, Personenschaden, …). */
  kategorie: 'stammdaten' | 'unfall' | 'personenschaden' | 'fahrzeug' | 'sonstiges'
  /** Debug-Hinweis warum erwartet (z.B. „personenschaden_flag=true"). */
  grund: string
}

type LeadDaten = {
  zb1_status?: string | null
  polizei_vor_ort?: boolean | null
  polizeibericht_pflicht?: boolean | null
  fahrerflucht?: boolean | null
  personenschaden_flag?: boolean | null
  sachschaden_flag?: boolean | null
  // Zwei Felder im Schema (Legacy + Neu) — beide berücksichtigen
  zeugen?: boolean | null
  zeugen_vorhanden?: boolean | null
  gewerbe_flag?: boolean | null
  vorsteuerabzugsberechtigt?: boolean | null
  finanzierung_leasing?: 'keine' | 'leasing' | 'finanzierung' | string | null
  ist_fahrzeughalter?: boolean | null
  halter_ungleich_fahrer_flag?: boolean | null
  nachname?: string | null
  halter_nachname?: string | null
  hat_vorschaeden?: boolean | null
  mietwagen_flag?: boolean | null
  nutzungsausfall?: boolean | null
}

/**
 * Deterministisch: Lead-Daten → Liste der erwarteten Slots.
 * Reihenfolge in der UI = Reihenfolge im Array.
 */
export function berechneErwartung(lead: LeadDaten | null | undefined): SlotErwartet[] {
  const out: SlotErwartet[] = []
  const l = lead ?? {}

  // Immer erwartet
  out.push({
    slot_id: 'fahrzeugschein',
    label: 'Fahrzeugschein (ZB1)',
    pflicht: l.zb1_status !== 'hochgeladen' && l.zb1_status !== 'bestaetigt',
    kategorie: 'stammdaten',
    grund: 'Immer erforderlich für Halter-Identifikation',
  })

  out.push({
    slot_id: 'unfallfotos',
    label: 'Unfallfotos (Tatort + Schaden)',
    pflicht: true,
    kategorie: 'unfall',
    grund: 'Standard-Schadenbeleg',
  })

  // Polizeibericht — wenn Polizei vor Ort + Pflicht-Flag, oder bei Fahrerflucht
  const polizeiPflicht =
    (l.polizei_vor_ort === true && l.polizeibericht_pflicht === true) ||
    (l.fahrerflucht === true && l.polizei_vor_ort !== true)
  if (polizeiPflicht) {
    out.push({
      slot_id: 'polizeibericht',
      label: 'Polizeiliche Unfallmitteilung',
      pflicht: true,
      kategorie: 'unfall',
      grund: l.fahrerflucht
        ? 'Fahrerflucht ohne Polizei vor Ort'
        : 'Polizei war vor Ort',
    })
  }

  // Personenschaden
  if (l.personenschaden_flag === true) {
    out.push({
      slot_id: 'aerztliches_attest',
      label: 'Ärztliches Attest',
      pflicht: true,
      kategorie: 'personenschaden',
      grund: 'personenschaden_flag=true',
    })
    out.push({
      slot_id: 'diagnosebericht',
      label: 'Diagnosebericht / Befundbericht',
      pflicht: false,
      kategorie: 'personenschaden',
      grund: 'personenschaden_flag=true',
    })
  }

  // Sachschaden (nicht Fahrzeug)
  if (l.sachschaden_flag === true) {
    out.push({
      slot_id: 'sachschaden_foto',
      label: 'Fotos des Sachschadens',
      pflicht: true,
      kategorie: 'sonstiges',
      grund: 'sachschaden_flag=true',
    })
    out.push({
      slot_id: 'sachschaden_rechnung',
      label: 'Rechnung / Kostenvoranschlag Sachschaden',
      pflicht: false,
      kategorie: 'sonstiges',
      grund: 'sachschaden_flag=true',
    })
  }

  // Zeugen — beide Schema-Felder berücksichtigen
  if (l.zeugen === true || l.zeugen_vorhanden === true) {
    out.push({
      slot_id: 'zeugenaussage',
      label: 'Zeugenaussage / Zeugenkontakt',
      pflicht: false,
      kategorie: 'sonstiges',
      grund: 'zeugen=true ODER zeugen_vorhanden=true',
    })
  }

  // Gewerbe / Vorsteuerabzug
  if (l.gewerbe_flag === true || l.vorsteuerabzugsberechtigt === true) {
    out.push({
      slot_id: 'gewerbenachweis',
      label: 'Gewerbenachweis',
      pflicht: true,
      kategorie: 'stammdaten',
      grund: 'gewerbe_flag oder vorsteuerabzugsberechtigt',
    })
    out.push({
      slot_id: 'gf_vollmacht',
      label: 'Geschäftsführer-Vollmacht',
      pflicht: true,
      kategorie: 'stammdaten',
      grund: 'gewerbe_flag oder vorsteuerabzugsberechtigt',
    })
  }

  // Halter ≠ Fahrer
  const halterUngleich =
    l.halter_ungleich_fahrer_flag === true ||
    l.ist_fahrzeughalter === false ||
    (() => {
      const h = String(l.halter_nachname ?? '').trim().toLowerCase()
      const k = String(l.nachname ?? '').trim().toLowerCase()
      return h.length > 0 && k.length > 0 && h !== k
    })()
  if (halterUngleich) {
    out.push({
      slot_id: 'halter_vollmacht',
      label: 'Halter-Vollmacht',
      pflicht: true,
      kategorie: 'stammdaten',
      grund: 'Halter ≠ Anrufer',
    })
    out.push({
      slot_id: 'halter_ausweis',
      label: 'Halter-Ausweis',
      pflicht: true,
      kategorie: 'stammdaten',
      grund: 'Halter ≠ Anrufer',
    })
  }

  // Leasing / Finanzierung — Bank-Freigabe nötig
  if (l.finanzierung_leasing === 'leasing' || l.finanzierung_leasing === 'finanzierung') {
    out.push({
      slot_id: 'freigabe_bank',
      label: 'Freigabe der Bank / Leasinggesellschaft',
      pflicht: true,
      kategorie: 'fahrzeug',
      grund: `finanzierung_leasing=${l.finanzierung_leasing}`,
    })
  }

  return out
}

/**
 * Filter-Helper für die UI: gruppiert die erwarteten Slots nach Kategorie.
 */
export function gruppiereNachKategorie(
  erwartet: SlotErwartet[],
): Record<SlotErwartet['kategorie'], SlotErwartet[]> {
  const groups: Record<SlotErwartet['kategorie'], SlotErwartet[]> = {
    stammdaten: [],
    unfall: [],
    personenschaden: [],
    fahrzeug: [],
    sonstiges: [],
  }
  for (const slot of erwartet) groups[slot.kategorie].push(slot)
  return groups
}
