// AAR-395 / Phase 0.5: Zentrale Entscheidungs-Matrix für die „Jetzt zu tun"-Karte
// im Gutachter-Portal. Diese Funktion ist eine reine Pure-Function und wird
// von JetztZuTunCard (Fallakte) UND AuftragCard (AAR-408) gemeinsam genutzt.
//
// Rückgabe:
//   - null → keine SV-Aktion erforderlich in dieser Phase
//   - Action-Objekt → genau EIN Aktions-Prompt (aktiv oder passiv)

export type SvAktionsTyp =
  | 'termin_vorschlagen'
  | 'gegenvorschlag_entscheiden'
  | 'warten_auf_kunde'
  | 'termin_vorbereiten'
  | 'besichtigung_dokumentieren'
  | 'gutachten_hochladen'
  | 'gutachten_final_freigeben'
  | 'stellungnahme_erstellen'
  | 'warten_auf_zahlung'
  | 'nichts_zu_tun'

export type JetztZuTunAction = {
  type: SvAktionsTyp
  label: string
  beschreibung?: string
  cta?: { href?: string; openModal?: 'termin' | 'gutachten' | 'stellungnahme' }
  /** Passive Zustände werden dezenter gerendert, kein CTA-Button. */
  passive?: boolean
}

export type TerminCtx = {
  status: string // 'vorschlag' | 'bestaetigt' | 'gegenvorschlag' | 'storniert' | ...
  start_zeit?: string | null
  gegenvorschlag_von?: 'sv' | 'kunde' | null
} | null

export type JetztZuTunCtx = {
  subphase: {
    phase: number // 4 | 5 | 6
    subphase: string // 'auftrag-eingegangen' | 'termin-bestaetigt' | 'vor-ort' | 'gutachten-erstellen' | ...
  }
  aktiverTermin: TerminCtx
  fall: {
    status?: string | null
    technische_stellungnahme_status?: string | null
    gutachten_final_freigegeben?: boolean | null
    gutachten_eingegangen_am?: string | null
    zahlung_eingegangen_am?: string | null
  }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleString('de-DE', {
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return iso
  }
}

export function getJetztZuTun(ctx: JetztZuTunCtx): JetztZuTunAction | null {
  const { subphase, aktiverTermin, fall } = ctx

  // Globale Abschalt-Regel: Fall storniert/geschlossen → keine Action.
  if (fall.status === 'storniert' || fall.status === 'geschlossen') return null

  // Storno eines Termins: aktiverTermin ignorieren.
  const termin =
    aktiverTermin && aktiverTermin.status !== 'storniert' ? aktiverTermin : null

  // PHASE 4 — Besichtigungs-Flow
  if (subphase.phase === 4) {
    switch (subphase.subphase) {
      case 'auftrag-eingegangen': {
        if (!termin) {
          return {
            type: 'termin_vorschlagen',
            label: 'Schlage dem Kunden einen Termin vor',
            beschreibung: 'Der Kunde wartet auf deinen ersten Vorschlag.',
            cta: { openModal: 'termin' },
          }
        }
        if (termin.gegenvorschlag_von === 'kunde' || termin.status === 'gegenvorschlag') {
          return {
            type: 'gegenvorschlag_entscheiden',
            label: 'Der Kunde hat einen anderen Termin vorgeschlagen',
            beschreibung: 'Annehmen, anpassen oder Gegenvorschlag senden.',
            cta: { openModal: 'termin' },
          }
        }
        if (termin.status === 'reserviert') {
          return {
            type: 'warten_auf_kunde',
            label: 'Termin-Vorschlag gesendet',
            beschreibung: 'Warten auf die Bestätigung des Kunden.',
            passive: true,
          }
        }
        break
      }
      case 'termin-bestaetigt': {
        return {
          type: 'termin_vorbereiten',
          label: `Termin am ${fmtDate(termin?.start_zeit)}`,
          beschreibung: 'Besichtigung vorbereiten — vorhandene Dokumente prüfen.',
        }
      }
      case 'vor-ort': {
        return {
          type: 'besichtigung_dokumentieren',
          label: 'Besichtigung dokumentieren',
          beschreibung: 'Fotos und Notizen aus dem Ortstermin hochladen.',
        }
      }
      case 'gutachten-erstellen': {
        return {
          type: 'gutachten_hochladen',
          label: 'Gutachten hochladen',
          beschreibung: 'Das fertige Gutachten als PDF einstellen.',
          cta: { openModal: 'gutachten' },
        }
      }
    }
    return null
  }

  // PHASE 5 — Kanzlei bearbeitet. SV nur aktiv, wenn Stellungnahme angefordert.
  if (subphase.phase === 5) {
    const stellStatus = fall.technische_stellungnahme_status
    if (stellStatus && !['abgeschlossen', 'zurueckgezogen'].includes(stellStatus)) {
      // StellungnahmeCard übernimmt die UI — hier nur Signal falls JetztZuTun
      // die einzige sichtbare Card wäre. Wir geben aber bewusst null zurück,
      // damit die StellungnahmeCard nicht doppelt erscheint.
      return null
    }
    return null
  }

  // PHASE 6 — Abschluss + Abrechnung
  if (subphase.phase === 6) {
    if (!fall.gutachten_final_freigegeben) {
      return {
        type: 'gutachten_final_freigeben',
        label: 'Gutachten final freigeben',
        beschreibung: 'Nach Kunden-Check das Gutachten final freizeichnen.',
      }
    }
    if (!fall.zahlung_eingegangen_am) {
      return {
        type: 'warten_auf_zahlung',
        label: 'Warten auf Zahlung',
        beschreibung: 'Honorar ist gestellt — Eingang der Versicherung ausstehend.',
        passive: true,
      }
    }
    return null
  }

  return null
}
