// AAR-756 (Phase E): Zentrale Rule-Engine für Admin-QuickActions.
//
// Analog zu:
//   - `@/lib/gutachter/jetzt-zu-tun` (SV)
//   - `@/lib/kunde/jetzt-zu-tun` (Kunde)
//
// Unterschied: Admin kann mehrere parallele Actions gleichzeitig haben
// (FIN-Call + Phase-Action + ...). Daher liefert `getAdminJetztZuTun`
// ein Array, nicht eine einzelne Aktion.
//
// Consumer: `src/app/faelle/[id]/_sidebar/QuickActions.tsx`.

export type AdminAktionKey =
  | 'fin_call'
  | 'zb1_anfordern'
  | 'kunde_anrufen'
  | 'termin_erinnerung'
  | 'qc_durchfuehren'
  | 'kanzlei_paket'
  | 'eskalation'
  | 'stellungnahme_anfordern'
  | 'ruege_vorbereiten'
  | 'nachbesichtigung_einpflegen'
  | 'kunde_informieren_wa'

export type AdminAktion = {
  key: AdminAktionKey
  label: string
  description?: string
  /** True = Server-Action verdrahtet; false = Platzhalter (noch im Backlog). */
  enabled: boolean
}

/**
 * Input-Shape — minimal, damit die Engine seiten-seitig (Sidebar) kurz
 * bleibt. Datums-Strings sind ISO (timestamptz).
 */
export type AdminJetztZuTunInput = {
  phase: string
  fin: string | null
  sv_termin: string | null
  cardentity_abfrage_am: string | null
}

/**
 * Liefert die Liste der aktuell relevanten Admin-Actions.
 * Reihenfolge im Array = Render-Reihenfolge in der UI.
 */
export function getAdminJetztZuTun(input: AdminJetztZuTunInput): AdminAktion[] {
  const actions: AdminAktion[] = []

  // AAR-163: FIN-Call — phasen-übergreifend möglich solange FIN vorhanden,
  // noch nicht abgefragt, und (kein SV-Termin oder in der Zukunft).
  const finCallMoeglich =
    !!input.fin &&
    !input.cardentity_abfrage_am &&
    (!input.sv_termin || new Date(input.sv_termin) > new Date())

  if (finCallMoeglich) {
    actions.push({
      key: 'fin_call',
      label: 'FIN-Call triggern',
      description: 'Cardentity/DAT — Fahrzeug + Vorschaden-Check',
      enabled: true,
    })
  }

  // Phase-spezifische Actions. Aktuell mehrheitlich Platzhalter bis die
  // zugehörigen Server-Actions gebaut sind — identisch zur alten
  // `getPhaseActions` aus QuickActions.tsx.
  actions.push(...phaseSpecificActions(input.phase))

  return actions
}

function phaseSpecificActions(phase: string): AdminAktion[] {
  switch (phase) {
    case 'ersterfassung':
    case 'erstgespraech':
    case 'flow-gesendet':
    case 'onboarding':
      return [
        { key: 'zb1_anfordern', label: 'ZB1 anfordern', description: 'WA-Reminder an Kunde', enabled: false },
        { key: 'kunde_anrufen', label: 'Kunde anrufen', enabled: false },
      ]

    case 'sv-gesucht':
    case 'termin-reserviert':
    case 'sv-zugewiesen':
    case 'sv-termin':
      return [
        { key: 'termin_erinnerung', label: 'Termin-Erinnerung senden', enabled: false },
      ]

    case 'gutachten-erstellt':
    case 'akte-uebergeben':
    case 'gutachten-eingegangen':
      return [
        { key: 'qc_durchfuehren', label: 'QC durchführen', enabled: false },
        { key: 'kanzlei_paket', label: 'E-Akte an Kanzlei', enabled: false },
      ]

    case 'as-versendet':
    case 'warten-auf-vs':
      return [
        {
          key: 'eskalation',
          label: 'Eskalation triggern',
          description: 'Bei Frist-Ablauf Tag 14/21/28',
          enabled: false,
        },
      ]

    case 'vs-kuerzt':
      return [
        { key: 'stellungnahme_anfordern', label: 'Techn. Stellungnahme SV anfordern', enabled: false },
        { key: 'ruege_vorbereiten', label: 'Rüge vorbereiten', enabled: false },
      ]

    case 'nachbesichtigung-laeuft':
      return [
        { key: 'nachbesichtigung_einpflegen', label: 'Nachbesichtigungs-Ergebnis einpflegen', enabled: false },
      ]

    case 'vs-reguliert':
    case 'regulierung-laeuft':
    case 'zahlung-eingegangen':
      return [
        { key: 'kunde_informieren_wa', label: 'Kunde informieren (WA)', enabled: false },
      ]

    default:
      return []
  }
}
