// Lead-Bucket → Claim-Bucket: Eine Quelle der Wahrheit.
//
// Vorher (CMM-21): hier lebten Smart-Filter-Conditions die zu UI-Banner-
// Slots gemappt wurden. Diese Conditions duplizierten die Logik aus
// lib/dokumente/erwartung.ts (Backend) und konnten driften — z.B. zeigte
// das Banner Polizeibericht für jeden polizei_vor_ort=true, aber das
// Backend legte ihn nur an wenn polizeibericht_pflicht=true.
//
// Jetzt: Backend (createPflichtdokumenteFromKatalog) entscheidet via
// berechneErwartung welche Slots als pflichtdokumente-Rows angelegt
// werden. UI iteriert NUR diese Rows und reichert sie mit Label/
// Beschreibung aus dem statischen DOC_LABELS-Lookup an. Wenn ein Slot
// nicht in pflichtdokumente steht → wird nicht angezeigt.
//
// Status pro Slot:
//   - 'offen':         pflichtdokumente-Row existiert, kein File
//   - 'erfüllt':       File hochgeladen / dokument_url gesetzt
//   - 'spaeter':       Kunde hat „später nachreichen" gewählt
//   - 'nicht_relevant': existiert nicht mehr (Slot wäre einfach nicht angelegt)

import type { ClaimFull } from './types'
import type { PflichtdokumentStand } from '@/app/kunde/onboarding/actions'

export type DokumentStatus = 'offen' | 'erfuellt' | 'spaeter' | 'nicht_relevant'

export type DokumentAnforderung = {
  slot_id: string
  label: string
  beschreibung: string
  pflicht: boolean
  status: DokumentStatus
  /** Bestehender pflichtdokumente-Eintrag (für Upload-Pfad) — null wenn das Slot noch nicht in pflichtdokumente angelegt ist. */
  pflichtdoc?: PflichtdokumentStand
}

// UI-Lookup für die bekannten Slots. Conditions sind raus — Backend
// (berechneErwartung + createPflichtdokumenteFromKatalog) entscheidet
// welche Slots angelegt werden. Hier nur label/beschreibung + Pflicht-
// Default für Slots ohne expliziten Pflicht-Wert in pflichtdokumente.
type SlotLabel = {
  label: string
  beschreibung: string
  /** Default-Pflicht wenn pflichtdokumente.pflicht NULL ist. */
  pflicht_default: boolean
}

const DOC_LABELS: Record<string, SlotLabel> = {
  fahrzeugschein: {
    label: 'Fahrzeugschein (ZB1)',
    beschreibung: 'Vorder- und Rückseite. Bestätigt Halter und Fahrzeugdaten.',
    pflicht_default: true,
  },
  schadensfotos: {
    label: 'Fotos vom Fahrzeugschaden',
    beschreibung: 'Mehrere Perspektiven, Nah- und Übersichtsaufnahmen.',
    pflicht_default: true,
  },
  unfallfotos: {
    label: 'Fotos vom Unfall-Ort',
    beschreibung: 'Übersicht der Unfallstelle, Endpositionen der Fahrzeuge.',
    pflicht_default: true,
  },
  polizeibericht: {
    label: 'Polizeibericht',
    beschreibung: 'Foto der polizeilichen Unfallmitteilung — beschleunigt die Regulierung.',
    pflicht_default: true,
  },
  aerztliches_attest: {
    label: 'Ärztliches Attest',
    beschreibung: 'Bei Personenschaden — dokumentiert Verletzungen und Behandlungsdauer.',
    pflicht_default: true,
  },
  diagnosebericht: {
    label: 'Diagnosebericht',
    beschreibung: 'Bei Personenschaden — ärztliche Diagnose mit Heilungsverlauf.',
    pflicht_default: true,
  },
  sachschaden_foto: {
    label: 'Foto Sachschaden',
    beschreibung: 'Bei beschädigten Gegenständen — Foto des Schadens.',
    pflicht_default: true,
  },
  sachschaden_rechnung: {
    label: 'Rechnung Sachschaden',
    beschreibung: 'Bei beschädigten Gegenständen — Reparatur- oder Neukauf-Rechnung.',
    pflicht_default: true,
  },
  // Backoffice-Slots (Kanzlei / Halter-Vollmacht etc.) bekommen ihr Label
  // entweder hier ergänzt oder fallback zum slot_id-Wert.
  zeugenaussage: {
    label: 'Zeugenaussage',
    beschreibung: 'Schriftliche Zeugenaussage oder Kontaktdaten.',
    pflicht_default: false,
  },
  gewerbenachweis: {
    label: 'Gewerbenachweis',
    beschreibung: 'Bei Gewerbe / vorsteuerabzugsberechtigt.',
    pflicht_default: true,
  },
  gf_vollmacht: {
    label: 'Geschäftsführer-Vollmacht',
    beschreibung: 'Bei Gewerbe / vorsteuerabzugsberechtigt.',
    pflicht_default: true,
  },
  halter_vollmacht: {
    label: 'Halter-Vollmacht',
    beschreibung: 'Wenn Halter ≠ Anrufer.',
    pflicht_default: true,
  },
  halter_ausweis: {
    label: 'Halter-Ausweis',
    beschreibung: 'Wenn Halter ≠ Anrufer.',
    pflicht_default: true,
  },
  freigabe_bank: {
    label: 'Freigabe Bank / Leasinggesellschaft',
    beschreibung: 'Bei Leasing- oder Finanzierungsfahrzeugen.',
    pflicht_default: true,
  },
}

const SLOT_REIHENFOLGE = [
  'fahrzeugschein',
  'schadensfotos',
  'unfallfotos',
  'polizeibericht',
  'aerztliches_attest',
  'diagnosebericht',
  'sachschaden_foto',
  'sachschaden_rechnung',
] as const

/**
 * Liefert alle Dokument-Anforderungen für einen Claim mit Status.
 *
 * Lead-Bucket-Migration: keine eigenen Smart-Filter-Conditions mehr.
 * Backend (createPflichtdokumenteFromKatalog via berechneErwartung)
 * legt die richtigen Slots als pflichtdokumente-Rows an, diese Funktion
 * iteriert nur die existierenden Rows und reichert sie mit Label /
 * Beschreibung aus DOC_LABELS an. Wenn ein Slot nicht angelegt ist,
 * wird er nicht angezeigt — das war vorher Drift-Quelle (UI zeigte
 * mehr/anderes als das Backend wirklich erwartete).
 *
 * @param _claim — wird nicht mehr für Conditions genutzt, bleibt in der
 *                  Signatur damit Konsumenten unverändert sind.
 * @param pflichtDocs — pflichtdokumente-Rows = Single Source of Truth
 *                      für „welche Slots sind erwartet"
 * @param _leadZb1Status — wird nicht mehr genutzt (Backend setzt
 *                          fahrzeugschein.pflicht je nach zb1_status).
 */
export function getOffeneDokumentAnforderungen(
  _claim: ClaimFull,
  pflichtDocs: PflichtdokumentStand[],
  _leadZb1Status?: string | null,
): DokumentAnforderung[] {
  const result: DokumentAnforderung[] = []

  // Eine Iteration: alle pflichtdokumente-Rows. Bekannte Slots mit
  // Label/Beschreibung aus DOC_LABELS, unbekannte (KB-Custom oder
  // Backoffice) mit slot_id als Fallback-Label.
  for (const pflichtdoc of pflichtDocs) {
    const labels = DOC_LABELS[pflichtdoc.slot_id]

    let status: DokumentStatus
    if (
      pflichtdoc.dokument_url ||
      pflichtdoc.status === 'hochgeladen' ||
      pflichtdoc.status === 'geprueft'
    ) {
      status = 'erfuellt'
    } else if (pflichtdoc.status === 'spaeter') {
      status = 'spaeter'
    } else {
      status = 'offen'
    }

    result.push({
      slot_id: pflichtdoc.slot_id,
      // Label-Lookup: DOC_LABELS (bekannte Slots) > pflichtdoc.label (KB-
      // gesetzt) > slot_id als Fallback.
      label: labels?.label ?? pflichtdoc.label ?? pflichtdoc.slot_id ?? '',
      beschreibung: labels?.beschreibung ?? pflichtdoc.beschreibung ?? '',
      // OR-Logic: DB-Pflicht oder DOC_LABELS-Default — KB kann hochstufen,
      // kann aber nicht entpflichten.
      pflicht: !!(pflichtdoc.pflicht || labels?.pflicht_default),
      status,
      pflichtdoc,
    })
  }

  // Stabiles Sort nach SLOT_REIHENFOLGE für bekannte Slots, dann Rest
  // alphabetisch — damit Kunde und SV identische Reihenfolge sehen.
  const reihenfolgeIdx = (slotId: string) => {
    const idx = (SLOT_REIHENFOLGE as readonly string[]).indexOf(slotId)
    return idx === -1 ? 999 : idx
  }
  result.sort((a, b) => {
    const da = reihenfolgeIdx(a.slot_id)
    const db = reihenfolgeIdx(b.slot_id)
    if (da !== db) return da - db
    // Defensive localeCompare — auch wenn label leer/null ist nicht crashen.
    return (a.label ?? '').localeCompare(b.label ?? '', 'de')
  })

  return result
}

/**
 * Anzahl noch offener Pflicht-Punkte (für Banner-Counter + Onboarding-Ende).
 * CMM-22 Bugfix: vorher zählte nur status==='offen' und ignorierte 'spaeter'-
 * Slots → Banner und Onboarding-Ende haben verschiedene Zahlen ausgegeben.
 * Jetzt: alles was nicht 'erfuellt' ist zählt als offen — der Kunde muss es
 * eh noch hochladen, egal ob er "später" geklickt hat oder noch nicht
 * interagiert hat.
 */
export function countOffenePflicht(anforderungen: DokumentAnforderung[]): number {
  return anforderungen.filter((a) => a.pflicht && a.status !== 'erfuellt').length
}
