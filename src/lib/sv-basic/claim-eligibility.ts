// src/lib/sv-basic/claim-eligibility.ts
// Pure Helpers fuer den SV-Basic-Claim. KEINE 'use server'-Direktive hier.
import { getPaket } from '@/lib/pakete'

export const BASIC_DEFAULT_RADIUS_KM = 25

// Server-seitige Whitelist: welche Pakete aus dem Self-Service kommen duerfen.
// Der Paket-Wert kommt aus dem Client -> NIE roh uebernehmen (kein Self-Escalation
// auf pro/premium). Ungueltiges faellt hart auf 'basic'.
export const SELF_SERVICE_PAKETE = ['basic', 'standard', 'pro', 'premium'] as const
export type SelfServicePaket = (typeof SELF_SERVICE_PAKETE)[number]
export function istErlaubtesPaket(paket: string): paket is SelfServicePaket {
  return (SELF_SERVICE_PAKETE as readonly string[]).includes(paket)
}

// Firmen-/Steuerdaten fuer BEZAHLTE Self-Service-Registrierungen (Vertrag-Stammdaten-Card
// im WillkommenClient + Abrechnung). Basic erhebt sie nicht (Funnel bleibt schlank).
export type SvBusinessDaten = {
  firmenname?: string | null
  rechtsform?: string | null
  steuernummer?: string | null
  ustId?: string | null
}

export type SvLeadRow = {
  vorname: string | null; name: string | null; nachname: string | null; firma: string | null
  telefon: string | null; email: string | null; adresse: string | null
  plz: string | null; ort: string | null; lat: number | null; lng: number | null
  dat_id: string | null; dat_expert_nr: string | null; bvsk_nr: string | null; ihk_zertifikat: boolean | null
  oebuv_nr: string | null; qualifikationen: string[] | null; fachschwerpunkte: string | null
  jahre_erfahrung: number | null; isochrone_polygon: unknown; paket_umkreis_km: number | null
}

export function istClaimbar(lead: { claim_status: string | null; konvertiert_zu_sv_id: string | null }): boolean {
  return lead.claim_status === 'offen' && lead.konvertiert_zu_sv_id == null
}

export function normalisiereSuche(s: string): string {
  return s.trim().toLowerCase()
}

export function buildSvInsertAusLead(lead: SvLeadRow, profileId: string, paket: string = 'basic', business?: SvBusinessDaten) {
  // Whitelist-Gate: ungueltiges/unbekanntes Paket faellt hart auf 'basic' (kein Self-Escalation).
  const p: SelfServicePaket = istErlaubtesPaket(paket) ? paket : 'basic'
  const konfig = getPaket(p) // basic → 0 Faelle / 25km / 0 EUR; paid → Kontingent / Radius / Preis
  const base = {
    profile_id: profileId,
    paket: p,
    onboarding_quelle: 'self_service_claim',
    verifizierung_status: 'ausstehend' as const,
    ist_aktiv: false,
    portal_zugang_freigeschaltet: false,
    // business.firmenname (paid Self-Reg) hat Vorrang vor dem Cold-Pin-Firmennamen.
    firmenname: business?.firmenname ?? lead.firma ?? null,
    rechtsform: business?.rechtsform ?? null,
    steuernummer: business?.steuernummer ?? null,
    ust_id: business?.ustId ?? null,
    standort_adresse: lead.adresse ?? null,
    standort_plz: lead.plz ?? null,
    standort_lat: lead.lat ?? null,
    standort_lng: lead.lng ?? null,
    gebiet_plz: lead.plz ? [lead.plz] : [],
    paket_umkreis_km: lead.paket_umkreis_km ?? konfig.radius_km,
    paket_faelle_gesamt: konfig.faelle, // basic 0 (Pro-Lead-Billing, P5), paid = Kontingent
    paket_faelle_genutzt: 0,
    isochrone_polygon: lead.isochrone_polygon ?? null,
    bvsk_mitgliedsnummer: lead.bvsk_nr ?? null,
    oebuv_bestellungsnummer: lead.oebuv_nr ?? null,
    dat_nummer: lead.dat_expert_nr ?? lead.dat_id ?? null,
    // KEIN fachschwerpunkte: Spalte existiert NICHT auf sachverstaendige (live verifiziert).
    // KEIN partner_seit: ist NOT NULL DEFAULT CURRENT_DATE -> Spalte weglassen, DB-Default greift
    //   (explizites null wuerde den NOT-NULL-Constraint brechen).
  }
  // Basic bleibt byte-identisch zum Alt-Verhalten (kein Anzahlungs-Feld, Pay-per-Lead).
  // Bezahltes Paket: Onboarding-Anzahlung = voller Paketpreis (PAKETE-SSoT) + anzahlung_status
  // 'offen' (admin-bewaehrter CHECK-Wert) -> der reiche WillkommenClient laedt Stripe mit diesem
  // Betrag; portal_zugang bleibt false bis der willkommen/actions-Zahlungspfad ihn flippt.
  return p === 'basic'
    ? base
    : { ...base, onboarding_anzahlung_betrag: konfig.anzahlung, anzahlung_status: 'offen' as const }
}
