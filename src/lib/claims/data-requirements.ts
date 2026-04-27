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

const DOC_DEFINITIONS: Record<string, SlotConfig> = {
  fahrzeugschein: {
    label: 'Fahrzeugschein (ZB1)',
    beschreibung: 'Vorder- und Rückseite. Bestätigt Halter und Fahrzeugdaten.',
    pflicht: true,
    condition: (_claim, leadZb1Status) => leadZb1Status !== 'bestaetigt',
  },
  polizeibericht: {
    label: 'Polizeibericht',
    beschreibung: 'Polizeiliche Unfallmitteilung — beschleunigt die Regulierung deutlich.',
    pflicht: true,
    condition: (claim) => claim.polizei_vor_ort === true,
  },
  aerztliches_attest: {
    label: 'Ärztliches Attest',
    beschreibung: 'Bei Personenschaden — dokumentiert Verletzungen und Behandlungsdauer.',
    pflicht: true,
    condition: (claim) => claim.hat_personenschaden === true,
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
    pflicht: false,
    condition: () => true,
  },
  sachschaden_rechnung: {
    label: 'Rechnung Sachschaden',
    beschreibung: 'Wenn Gegenstände beschädigt wurden (z.B. Kindersitz, Gepäck).',
    pflicht: false,
    condition: (claim) => claim.hat_sachschaden === true,
  },
}

const SLOT_REIHENFOLGE = [
  'fahrzeugschein',
  'schadensfotos',
  'unfallfotos',
  'polizeibericht',
  'aerztliches_attest',
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
  const result: DokumentAnforderung[] = []
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
      // CMM-22 Bugfix: DB-Pflicht-Flag bevorzugen — KB kann Slots vom
      // Katalog-optional zur Pflicht hochstufen.
      pflicht: pflichtdoc?.pflicht ?? config.pflicht,
      status,
      pflichtdoc,
    })
  }
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
