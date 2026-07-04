import type { AbrechnungDescriptor } from '@/lib/abrechnung/create-abrechnung'

/**
 * AbrechnungDescriptor for SV-onboarding setup invoices (sv_onboarding_rechnungen).
 * Serie: CM-ONB, format: CM-ONB-{YYYY}-{NNNNN}
 * No dedup (upstream Stripe dedup), no positionen table, no markiere.
 */
export const ONBOARDING_DESCRIPTOR: AbrechnungDescriptor = {
  zielTabelle: 'sv_onboarding_rechnungen',
  positionenTabelle: null,
  ustSatz: 19,
  nummer: (kontext) => {
    const jahr = (kontext.jahr as number) ?? new Date().getFullYear()
    return {
      serie: 'CM-ONB',
      jahr,
      format: (j: number, lfdNr: number) =>
        `CM-ONB-${j}-${String(lfdNr).padStart(5, '0')}`,
    }
  },
  buildHeaderRow: (b, _pos, kontext) => ({
    sv_id: kontext.sv_id as string | null ?? null,
    organisation_id: kontext.organisation_id as string | null ?? null,
    rechnungs_nr: b.nummer,
    rechnungs_datum: kontext.rechnungs_datum as string,
    leistungs_datum: kontext.leistungs_datum as string,
    paket: kontext.paket as string | null ?? null,
    netto_cent: b.nettoCent,
    ust_cent: b.ustCent,
    brutto_cent: b.bruttoCent,
    ust_satz_pct: b.ustSatz,
    stripe_payment_intent_id: kontext.stripe_payment_intent_id as string | null ?? null,
    stripe_session_id: kontext.stripe_session_id as string | null ?? null,
    pdf_storage_path: kontext.pdf_storage_path as string | null ?? null,
    typ: kontext.typ as string,
    rechnungssteller: kontext.rechnungssteller as string,
    rechnungs_konfiguration_id: kontext.rechnungs_konfiguration_id as string,
    konfig_version: kontext.konfig_version as number,
  }),
}
