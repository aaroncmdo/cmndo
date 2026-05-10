// CMM-21: Smart-Erkennung der für einen Claim relevanten Dokumenten-
// Anforderungen. Aus den Claim-Daten leiten wir ab was wir vom Kunden
// brauchen — der Kunde sieht nur die wirklich relevanten Slots.
//
// Aaron-Spec aus CMM-17:
//   polizei_vor_ort=true       → Polizeibericht
//   leads.zb1_status!='bestaetigt' → ZB1 (Fahrzeugschein)
//   hat_personenschaden=true   → Atteste / Diagnoseberichte
//   hat_sachschaden=true       → Sachschaden-Fotos + Rechnung
//   immer                      → Schaden-Fotos vom Auto
//   immer                      → Unfall-Fotos
//
// Status pro Slot:
//   - 'offen': muss der Kunde noch hochladen
//   - 'erfüllt': ist da (Pflichtdokument-URL vorhanden)
//   - 'spaeter': Kunde hat "später nachreichen" gewählt
//   - 'nicht_relevant': Bedingung trifft nicht zu (z.B. polizei_vor_ort=false)

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

type SlotConfig = {
  label: string
  beschreibung: string
  /** Pflicht ja/nein. Pflicht = Banner bleibt bis erfüllt. */
  pflicht: boolean
  /** Welche Claim-Bedingung muss zutreffen damit das Slot relevant ist? */
  condition: (claim: ClaimFull, leadZb1Status?: string | null) => boolean
}

// CMM-23 Aaron-Spec (final): 8 Pflicht-Slots, alle bei matchender Bedingung
// Pflicht. Single Source mit dokument_katalog (siehe Migration
// cmm23_pflichtdokumente_katalog_fix). Render-seitig hier gespiegelt für
// die Banner/Liste-Logik solange wir noch nicht 1:1 auf den DB-Katalog
// umgestellt haben (eigenes Konsolidierungs-Ticket).
const DOC_DEFINITIONS: Record<string, SlotConfig> = {
  fahrzeugschein: {
    label: 'Fahrzeugschein (ZB1)',
    beschreibung: 'Vorder- und Rückseite. Bestätigt Halter und Fahrzeugdaten.',
    pflicht: true,
    condition: (_claim, leadZb1Status) => leadZb1Status !== 'bestaetigt',
  },
  schadensfotos: {
    label: 'Fotos vom Fahrzeugschaden',
    beschreibung: 'Mehrere Perspektiven, Nah- und Übersichtsaufnahmen.',
    pflicht: true,
    condition: () => true,
  },
  unfallfotos: {
    label: 'Fotos vom Unfall-Ort',
    beschreibung: 'Übersicht der Unfallstelle, Endpositionen der Fahrzeuge.',
    pflicht: true,
    condition: () => true,
  },
  polizeibericht: {
    label: 'Polizeibericht',
    beschreibung: 'Foto der polizeilichen Unfallmitteilung — beschleunigt die Regulierung.',
    pflicht: true,
    condition: (claim) => claim.polizei_vor_ort === true,
  },
  aerztliches_attest: {
    label: 'Ärztliches Attest',
    beschreibung: 'Bei Personenschaden — dokumentiert Verletzungen und Behandlungsdauer.',
    pflicht: true,
    condition: (claim) => claim.hat_personenschaden === true,
  },
  diagnosebericht: {
    label: 'Diagnosebericht',
    beschreibung: 'Bei Personenschaden — ärztliche Diagnose mit Heilungsverlauf.',
    pflicht: true,
    condition: (claim) => claim.hat_personenschaden === true,
  },
  sachschaden_foto: {
    label: 'Foto Sachschaden',
    beschreibung: 'Bei beschädigten Gegenständen — Foto des Schadens.',
    pflicht: true,
    condition: (claim) => claim.hat_sachschaden === true,
  },
  sachschaden_rechnung: {
    label: 'Rechnung Sachschaden',
    beschreibung: 'Bei beschädigten Gegenständen — Reparatur- oder Neukauf-Rechnung.',
    pflicht: true,
    condition: (claim) => claim.hat_sachschaden === true,
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
 * Liefert alle für diesen Claim relevanten Dokument-Anforderungen mit
 * Status. Slots die nicht relevant sind (z.B. Polizeibericht ohne
 * polizei_vor_ort) werden komplett rausgefiltert.
 *
 * @param claim — der vollständige Claim aus getClaimForRole
 * @param pflichtDocs — bestehende pflichtdokumente für den Fall (Status-Source)
 * @param leadZb1Status — Conditional Override für ZB1: wenn der Lead via
 *                        Dispatch Phase 4 schon einen ZB1 hat, ist das
 *                        Slot nicht relevant.
 */
export function getOffeneDokumentAnforderungen(
  claim: ClaimFull,
  pflichtDocs: PflichtdokumentStand[],
  leadZb1Status?: string | null,
): DokumentAnforderung[] {
  // CMM-23: zwei Iterationen — alle bekannten Smart-Filter-Slots
  // (DOC_DEFINITIONS) die conditional matchen + alle DB-Slots die NICHT
  // in DOC_DEFINITIONS sind (Legacy / KB-Anforderungen). Damit zeigen
  // wir auch Slots an, für die die DB-Row noch nicht angelegt wurde
  // (häufig wenn createPflichtdokumenteFromKatalog Slots übersprungen
  // hat) — Status fällt dann auf 'offen', sobald File hochgeladen wird,
  // legt der Upload-Pfad die Row an.
  const result: DokumentAnforderung[] = []
  const seen = new Set<string>()

  // 1. Bekannte Smart-Filter-Slots in fester Reihenfolge.
  for (const slotId of SLOT_REIHENFOLGE) {
    const config = DOC_DEFINITIONS[slotId]
    if (!config) continue
    if (!config.condition(claim, leadZb1Status)) continue

    const pflichtdoc = pflichtDocs.find((d) => d.slot_id === slotId)

    let status: DokumentStatus
    if (pflichtdoc?.dokument_url) {
      status = 'erfuellt'
    } else if (pflichtdoc?.status === 'spaeter') {
      status = 'spaeter'
    } else {
      status = 'offen'
    }

    result.push({
      slot_id: slotId,
      label: config.label,
      beschreibung: config.beschreibung,
      // OR-Logic: Katalog-Default oder DB-Pflicht-Flag — kein Override
      // nach unten. KB kann hochstufen, kann aber nicht entpflichten.
      pflicht: !!(pflichtdoc?.pflicht || config.pflicht),
      status,
      pflichtdoc,
    })
    seen.add(slotId)
  }

  // 2. Legacy- und KB-Slots aus DB die NICHT in DOC_DEFINITIONS sind.
  for (const pflichtdoc of pflichtDocs) {
    if (seen.has(pflichtdoc.slot_id)) continue
    if (DOC_DEFINITIONS[pflichtdoc.slot_id]) continue // schon behandelt

    let status: DokumentStatus
    if (pflichtdoc.dokument_url) {
      status = 'erfuellt'
    } else if (pflichtdoc.status === 'spaeter') {
      status = 'spaeter'
    } else {
      status = 'offen'
    }

    result.push({
      slot_id: pflichtdoc.slot_id,
      label: pflichtdoc.label ?? pflichtdoc.slot_id ?? '',
      beschreibung: pflichtdoc.beschreibung ?? '',
      pflicht: !!pflichtdoc.pflicht,
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
