import { createAdminClient } from '@/lib/supabase/admin'
import { getAktuelleRechnungsKonfig } from './get-rechnungs-konfig'
import { generateRechnungsNr } from './generate-rechnungs-nr'
import { calculateUst, eurToCent } from './calculate-ust'
import {
  generateAndUploadOnboardingRechnungPdf,
  type OnboardingRechnungData,
} from '@/lib/pdf/onboarding-rechnung'

/**
 * AAR-401: Orchestrator für Setup-Anzahlungs-Rechnung.
 * Wird vom Stripe-Webhook nach erfolgter Anzahlung aufgerufen.
 *
 * Schritte:
 *   1. Aktuelle Rechnungs-Konfig laden (AAR-416)
 *   2. Empfänger-Daten aus sachverstaendige / organisationen
 *   3. Rechnungs-Nr. atomar generieren (CM-ONB-YYYY-NNNNN)
 *   4. USt-Breakdown (Cent-Arithmetik)
 *   5. PDF generieren + in Storage `onboarding-rechnungen` hochladen
 *   6. DB-Insert in sv_onboarding_rechnungen
 *   7. Gibt { rechnung_id, pdf_buffer, rechnungs_nr, brutto_formatted } zurück
 */
export type OnboardingRechnungContext = {
  typ: 'solo' | 'buero' | 'akademie'
  sv_id?: string | null
  organisation_id?: string | null
  stripe_session_id?: string | null
  stripe_payment_intent_id?: string | null
  netto_euro: number       // autoritativ aus Stripe-Session oder onboarding_anzahlung_betrag
  paket?: string | null
  kontingent: number       // 10/25/50 oder paket_faelle_gesamt
  bezahlt_am: Date
}

export type OnboardingRechnungResult = {
  success: true
  rechnung_id: string
  rechnungs_nr: string
  pdf_buffer: Buffer
  pdf_storage_path: string | null
  netto_cent: number
  ust_cent: number
  brutto_cent: number
}

export async function createOnboardingRechnung(
  ctx: OnboardingRechnungContext,
): Promise<OnboardingRechnungResult | { success: false; error: string }> {
  if (!ctx.sv_id && !ctx.organisation_id) {
    return { success: false, error: 'sv_id oder organisation_id muss gesetzt sein' }
  }
  if (ctx.netto_euro <= 0) {
    return { success: false, error: `netto_euro muss > 0 sein (got ${ctx.netto_euro})` }
  }

  const db = createAdminClient()

  try {
    // 1. Konfig laden
    const konfig = await getAktuelleRechnungsKonfig(ctx.bezahlt_am)

    // 2. Empfänger-Daten
    let empfaenger: OnboardingRechnungData['empfaenger']
    if (ctx.typ === 'solo' && ctx.sv_id) {
      const { data: sv } = await db.from('sachverstaendige')
        .select('firmenname, profile_id, standort_adresse, standort_plz, steuernummer, ust_id')
        .eq('id', ctx.sv_id)
        .single()
      const { data: profile } = sv?.profile_id
        ? await db.from('profiles').select('vorname, nachname').eq('id', sv.profile_id).single()
        : { data: null }
      const name = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || 'Sachverständiger'
      empfaenger = {
        name,
        firma: sv?.firmenname ?? null,
        strasse: sv?.standort_adresse ?? null,
        plz: sv?.standort_plz ?? null,
        ort: null,
        steuernummer: sv?.steuernummer ?? null,
        ust_id: sv?.ust_id ?? null,
      }
    } else if (ctx.organisation_id) {
      const { data: org } = await db.from('organisationen')
        .select('name, anschrift, steuernummer, ust_id, standort_adresse, standort_plz, hauptansprechpartner_user_id')
        .eq('id', ctx.organisation_id)
        .single()
      const { data: profile } = org?.hauptansprechpartner_user_id
        ? await db.from('profiles').select('vorname, nachname').eq('id', org.hauptansprechpartner_user_id).single()
        : { data: null }
      const name = [profile?.vorname, profile?.nachname].filter(Boolean).join(' ') || 'Inhaber'
      empfaenger = {
        name,
        firma: org?.name ?? null,
        strasse: org?.standort_adresse ?? org?.anschrift ?? null,
        plz: org?.standort_plz ?? null,
        ort: null,
        steuernummer: org?.steuernummer ?? null,
        ust_id: org?.ust_id ?? null,
      }
    } else {
      return { success: false, error: 'Empfänger-Daten konnten nicht geladen werden' }
    }

    // 3. Rechnungs-Nr.
    const rechnungsNr = await generateRechnungsNr('CM-ONB', ctx.bezahlt_am.getFullYear())

    // 4. USt-Breakdown
    const netto_cent = eurToCent(ctx.netto_euro)
    const { ust_cent, brutto_cent, ust_satz_pct } = calculateUst(netto_cent, 19)

    // 5. PDF generieren + uploaden
    const { pdf_buffer, storage_path } = await generateAndUploadOnboardingRechnungPdf({
      konfig,
      rechnungs_nr: rechnungsNr,
      rechnungs_datum: ctx.bezahlt_am,
      leistungs_datum: ctx.bezahlt_am,
      typ: ctx.typ,
      paket: ctx.paket ?? null,
      kontingent: ctx.kontingent,
      empfaenger,
      netto_cent,
      ust_cent,
      brutto_cent,
      ust_satz_pct,
      stripe_bezahlt_am: ctx.bezahlt_am,
    })

    // 6. DB-Insert
    const { data: inserted, error: insertErr } = await db
      .from('sv_onboarding_rechnungen')
      .insert({
        sv_id: ctx.sv_id ?? null,
        organisation_id: ctx.organisation_id ?? null,
        rechnungs_nr: rechnungsNr,
        rechnungs_datum: ctx.bezahlt_am.toISOString().slice(0, 10),
        leistungs_datum: ctx.bezahlt_am.toISOString().slice(0, 10),
        paket: ctx.paket ?? null,
        netto_cent,
        ust_cent,
        brutto_cent,
        ust_satz_pct,
        stripe_payment_intent_id: ctx.stripe_payment_intent_id ?? null,
        stripe_session_id: ctx.stripe_session_id ?? null,
        pdf_storage_path: storage_path,
        typ: ctx.typ,
        rechnungssteller: konfig.rechnungssteller,
        rechnungs_konfiguration_id: konfig.id,
        konfig_version: konfig.version,
      })
      .select('id')
      .single()

    if (insertErr || !inserted) {
      return {
        success: false,
        error: `sv_onboarding_rechnungen insert fehlgeschlagen: ${insertErr?.message ?? 'leer'}`,
      }
    }

    return {
      success: true,
      rechnung_id: inserted.id,
      rechnungs_nr: rechnungsNr,
      pdf_buffer,
      pdf_storage_path: storage_path,
      netto_cent,
      ust_cent,
      brutto_cent,
    }
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unbekannter Fehler in createOnboardingRechnung',
    }
  }
}

/**
 * Markiert die Rechnung als versendet (setzt versendet_am).
 */
export async function markRechnungVersendet(rechnung_id: string): Promise<void> {
  const db = createAdminClient()
  await db
    .from('sv_onboarding_rechnungen')
    .update({ versendet_am: new Date().toISOString() })
    .eq('id', rechnung_id)
}
