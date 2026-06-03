// AAR-956 Phase C — Decoupling-Schritt 1: die Self-Service-Booking-Actions leben
// jetzt route-neutral in @/lib/self-service/anfrage-actions, damit die GETEILTEN
// Onboarding-Bausteine (WizardClient/TerminField — auch in /kunde- + /gutachter-
// Onboarding) NICHT mehr an der /anfrage-Route hängen. Diese Datei ist nur noch ein
// Re-Export-Shim für die /anfrage-internen Komponenten (relative './actions'-Imports)
// und verschwindet mit der Route beim Phase-C-Drop — die Lib + die geteilten
// Bausteine bleiben dann heil. Verhalten unverändert (reines Code-Verschieben).
export {
  getAnfrageByToken,
  promoteAnfrageZuLead,
  speichereBeauftragungStep,
  speichereQuali,
  ladeMatching,
  bucheTermin,
  unterschreibeUndErstelleFall,
} from '@/lib/self-service/anfrage-actions'
