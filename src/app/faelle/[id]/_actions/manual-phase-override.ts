'use server'

// AAR-573 (V7) → CMM-44 Stopgap (2026-05-27): manualPhaseOverride ist
// VORUEBERGEHEND DEAKTIVIERT.
//
// Warum: Die Action schrieb einen der 52 SUBPHASE_VISIBILITY-Werte (System B)
// direkt in `claims.phase`. Seit CMM-44 SP-A2 (2026-05-17) ist die alte Heimat
// `faelle.aktuelle_phase` gedroppt, und `claims.phase` traegt den 11-Code-
// CHECK `claims_phase_check` (0_lead..9_storniert). Jeder Override warf daher
// `23514 claims_phase_check` (empirisch bestaetigt 2026-05-27) — das Feature war
// seit SP-A2 bei jeder Nutzung defekt.
//
// Die feine Subphasen-Visibility ist erst nach dem System-B-Re-Base (CMM-44 P2)
// wieder steuerbar. Ein derived-kompatibler Phase-Override (Override-FELD statt
// Direkt-Write — die Phase ist unter D1 abgeleitet, also nicht durch Schreiben
// von `claims.phase` ueberschreibbar) wird in CMM-44 P3 neu gebaut.
//
// Die Original-Logik (claims-Write + phase_transitions + webhook_events-Audit +
// Mitteilungen an Admins/KB) liegt in der git-Historie vor diesem Commit.
// UI: ManualPhaseOverrideModal zeigt einen Deaktiviert-Hinweis und sperrt den
// Submit; diese Action ist zusaetzlich als Defense-in-Depth ein No-op-Guard.

interface OverrideInput {
  fallId: string
  neueSubphase: string
  begruendung: string
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars -- Signatur fuer Caller erhalten; Body ist Stopgap-No-op (siehe Header)
export async function manualPhaseOverride(_input: OverrideInput): Promise<{
  success: boolean
  error?: string
  alteSubphase?: string | null
}> {
  return {
    success: false,
    error:
      'Der manuelle Phasen-Override ist während der Phasen-Migration (CMM-44) vorübergehend deaktiviert und wird in einer kommenden Version neu gebaut.',
  }
}
