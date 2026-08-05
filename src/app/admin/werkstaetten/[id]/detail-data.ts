import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import type { SupabaseClient } from '@supabase/supabase-js'
import { ladePartnerBilling } from '@/lib/finance/partner-billing-actions'
import type { PartnerBillingAggregat, PartnerBillingRow } from '@/lib/finance/partner-billing'
import { werkstattStartUrl } from '@/lib/start-link/werkstatt-start-url'
import { generateQrCodeSvg } from '@/lib/kanzlei/qr-code'
import { berechneWerkstattLeistung, type WerkstattLeistung } from '@/lib/werkstatt/werkstatt-leistung'

// Loader fuer die Admin-Werkstatt-Detailseite. Reine Reads (kein DDL), Admin-gegated
// durch die Page. v_werkstatt_auftrag ist RLS-is_staff()-gegated -> Admin liest legitim
// alle Auftraege einer Werkstatt (gefiltert per werkstatt_id).

export interface WerkstattDetailAuftrag {
  claim_id: string
  claim_nummer: string | null
  richtung: string | null
  operative_status: string | null
  reparatur_termin_status: string | null
  reparatur_wunschtermin: string | null
  reparatur_bestaetigter_termin: string | null
  gutachten_fertiggestellt_am: string | null
  gutachten_totalschaden: boolean | null
  besichtigung_start: string | null
  provision_betrag_netto: number | null
  provision_status: string | null
  fahrzeug_hersteller: string | null
  fahrzeug_modell: string | null
  kennzeichen: string | null
}

export interface WerkstattDetailStammdaten {
  id: string
  name: string
  status: string | null
  adresse_strasse: string | null
  adresse_plz: string | null
  adresse_ort: string | null
  email: string | null
  telefon: string | null
  website: string | null
  ansprechpartner_name: string | null
  provision_betrag_netto: number | null
  provision_aktiv: boolean | null
  faehigkeiten: string[] | null
  marken: string[] | null
  ist_freie_werkstatt: boolean | null
  fahrzeug_gruppen: string[] | null
  bank_iban: string | null
  bank_bic: string | null
  bank_kontoinhaber: string | null
  ist_kleinunternehmer: boolean | null
  ust_id: string | null
  aktiviert_am: string | null
  created_at: string | null
  user_id: string | null
  lat: number | null
  lng: number | null
  isochrone: unknown
  verifiziert: boolean | null
  verifiziert_am: string | null
}

export interface WerkstattBilling {
  rows: PartnerBillingRow[]
  aggregat: PartnerBillingAggregat
  istKleinunternehmer: boolean | null
  steuerdaten: { ust_id: string | null; adresse_strasse: string | null; adresse_plz: string | null; adresse_ort: string | null } | null
  gutschriftDocsByLedger: Record<string, import('@/lib/finance/partner-billing').LedgerGutschriftDocs>
}

export interface WerkstattDetail {
  werkstatt: WerkstattDetailStammdaten
  staffel: { schwelle: number; bonus_betrag_netto: number }[]
  auftraege: WerkstattDetailAuftrag[]
  lastSignInAt: string | null
  forcePasswordChange: boolean | null
  billing: WerkstattBilling | null
  leistung: WerkstattLeistung
  // QR: regulaerer Kunden-Einstiegs-QR (/start/werkstatt/<id>) — server-generiert,
  // damit die Detailseite ihn ohne Client-Action-Call inline zeigt.
  qrUrl: string
  qrSvg: string
  // Aktuell zugewiesener physischer Pool-QR-Sticker-Code (falls vorhanden).
  zugewiesenerPoolCode: string | null
}

export async function ladeWerkstattDetail(id: string): Promise<WerkstattDetail | null> {
  const supabase = await createClient()

  const { data: w } = await supabase
    .from('werkstaetten')
    .select(
      'id, name, status, adresse_strasse, adresse_plz, adresse_ort, email, telefon, website, ansprechpartner_name, provision_betrag_netto, provision_aktiv, faehigkeiten, marken, ist_freie_werkstatt, fahrzeug_gruppen, bank_iban, bank_bic, bank_kontoinhaber, ist_kleinunternehmer, ust_id, aktiviert_am, created_at, user_id, lat, lng, isochrone, verifiziert, verifiziert_am',
    )
    .eq('id', id)
    .maybeSingle()
  if (!w) return null

  const [staffelRes, auftragRes] = await Promise.all([
    supabase
      .from('werkstatt_staffel_stufen')
      .select('schwelle, bonus_betrag_netto')
      .eq('werkstatt_id', id)
      .order('schwelle', { ascending: true }),
    supabase
      .from('v_werkstatt_auftrag')
      .select(
        'claim_id, claim_nummer, richtung, operative_status, reparatur_termin_status, reparatur_wunschtermin, reparatur_bestaetigter_termin, gutachten_fertiggestellt_am, gutachten_totalschaden, besichtigung_start, provision_betrag_netto, provision_status, fahrzeug_hersteller, fahrzeug_modell, kennzeichen',
      )
      .eq('werkstatt_id', id)
      .order('besichtigung_start', { ascending: false, nullsFirst: false }),
  ])

  let lastSignInAt: string | null = null
  let forcePasswordChange: boolean | null = null
  if (w.user_id) {
    const admin = createAdminClient()
    const { data: authUser } = await admin.auth.admin.getUserById(w.user_id as string)
    lastSignInAt = authUser?.user?.last_sign_in_at ?? null
    const { data: prof } = await admin
      .from('profiles')
      .select('force_password_change')
      .eq('id', w.user_id as string)
      .maybeSingle()
    forcePasswordChange = (prof?.force_password_change as boolean | null | undefined) ?? null
  }

  const billing = await ladePartnerBilling('werkstatt', id)

  // QR-Code (regulaerer Kunden-Einstieg /start/werkstatt/<id>) mit den reinen Server-Utils
  // direkt generieren — generateQrCodeSvg ist eine reine, render-sichere Util.
  // (Die fruehere 'use server'-Action werkstattQrSvg wurde im Dead-Action-Sweep
  // 04.08. geloescht — sie hatte nie einen Prod-Consumer.)
  const qrUrl = werkstattStartUrl(id)
  const qrSvg = await generateQrCodeSvg(qrUrl, 300)

  // Aktuell zugewiesener Pool-QR-Code — ueber einen untypisierten Service-Role-Client
  // (werkstatt_qr_pool ist service-role-only). Die Page ist admin-gegated.
  const adminDb = createAdminClient() as unknown as SupabaseClient
  const poolRes = await adminDb
    .from('werkstatt_qr_pool')
    .select('token')
    .eq('werkstatt_id', id)
    .eq('status', 'zugewiesen')
    .limit(1)
  const zugewiesenerPoolCode = (poolRes.data as { token: string }[] | null)?.[0]?.token ?? null

  const auftraege = (auftragRes.data ?? []) as unknown as WerkstattDetailAuftrag[]
  const leistung = berechneWerkstattLeistung(auftraege, new Date())

  return {
    werkstatt: w as unknown as WerkstattDetailStammdaten,
    staffel: (staffelRes.data ?? []) as { schwelle: number; bonus_betrag_netto: number }[],
    auftraege,
    lastSignInAt,
    forcePasswordChange,
    billing: billing.ok
      ? {
          rows: billing.rows,
          aggregat: billing.aggregat,
          istKleinunternehmer: billing.istKleinunternehmer,
          steuerdaten: billing.steuerdaten,
          gutschriftDocsByLedger: billing.gutschriftDocsByLedger,
        }
      : null,
    leistung,
    qrUrl,
    qrSvg,
    zugewiesenerPoolCode,
  }
}
