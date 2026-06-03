// claimondo-marketing/lib/sv-basic/claim-eligibility.ts
// Pure Helpers fuer den SV-Basic-Claim. KEINE 'use server'-Direktive hier.
export const BASIC_DEFAULT_RADIUS_KM = 25

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

export function buildSvInsertAusLead(lead: SvLeadRow, profileId: string) {
  return {
    profile_id: profileId,
    paket: 'basic',
    onboarding_quelle: 'self_service_claim',
    verifizierung_status: 'ausstehend' as const,
    ist_aktiv: false,
    portal_zugang_freigeschaltet: false,
    firmenname: lead.firma ?? null,
    standort_adresse: lead.adresse ?? null,
    standort_plz: lead.plz ?? null,
    standort_lat: lead.lat ?? null,
    standort_lng: lead.lng ?? null,
    gebiet_plz: lead.plz ? [lead.plz] : [],
    paket_umkreis_km: lead.paket_umkreis_km ?? BASIC_DEFAULT_RADIUS_KM,
    paket_faelle_gesamt: 0,            // 0 Inklusivfaelle (Pro-Lead-Billing, P5)
    paket_faelle_genutzt: 0,
    isochrone_polygon: lead.isochrone_polygon ?? null,
    bvsk_mitgliedsnummer: lead.bvsk_nr ?? null,
    oebuv_bestellungsnummer: lead.oebuv_nr ?? null,
    dat_nummer: lead.dat_expert_nr ?? lead.dat_id ?? null,
    // KEIN fachschwerpunkte: Spalte existiert NICHT auf sachverstaendige (live verifiziert).
    // KEIN partner_seit: ist NOT NULL DEFAULT CURRENT_DATE -> Spalte weglassen, DB-Default greift
    //   (explizites null wuerde den NOT-NULL-Constraint brechen).
  }
}
