import { createAdminClient } from '@/lib/supabase/admin'
import { buildSvInsertAusLead, type SvLeadRow } from '@/lib/sv-basic/claim-eligibility'
import type { PartnerRolle } from '@/lib/partner/policy'
import { setzeStandardStaffel } from '@/lib/partner/standard-staffel'
import { enablePhoneLogin } from '@/lib/auth/phone-login'

// Konsolidierter Kern der Partner-Account-Anlage (makler | sachverstaendiger | werkstatt).
// Spiegelt anlegeMaklerKern: Auth-User (Random-PW + force_password_change) ->
// profiles(rolle=<rolle>) -> Rollen-Row per switch(rolle) -> Rollback-Cascade bei Fehler.
// KEIN 'use server' (AAR-664: importierbar von Server-Actions UND convertPartnerLead).
// Caller-Verantwortung: Validierung, Email-Dedupe, Rate-Limit, Magic-Link/Notify.

type AdminClient = ReturnType<typeof createAdminClient>

function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length]
  return password + 'A1!'
}

export type PartnerAnlageInput = {
  firma: string
  ansprechpartnerVorname: string
  ansprechpartnerNachname: string
  email: string // normalisiert (trim + lowercase)
  telefon: string | null
  plz: string | null
  ort: string | null
  /** Geocodierte Koordinaten — nur werkstatt nutzt sie (makler/SV haben keine Koordinaten-Spalte). */
  lat?: number | null
  lng?: number | null
  aktiviertVon: string | null // admin user-id, oder null beim Self-Signup
  rollenDetails: Record<string, unknown> // rollen-spezifisch (DAT-Nr, Marken, IHK ...)
}

export type PartnerAnlageResult =
  | { ok: true; userId: string; partnerId: string; password: string }
  | { ok: false; error: string }

/** Liest ein optionales String-Feld aus rollenDetails (sonst null). */
function detailString(details: Record<string, unknown>, key: string): string | null {
  const v = details[key]
  return typeof v === 'string' && v.trim().length > 0 ? v.trim() : null
}

/** Liest ein optionales Number-Feld aus rollenDetails (sonst null). */
function detailNumber(details: Record<string, unknown>, key: string): number | null {
  const v = details[key]
  return typeof v === 'number' && Number.isFinite(v) ? v : null
}

/** Liest ein optionales Boolean-Feld aus rollenDetails (sonst null). */
function detailBoolean(details: Record<string, unknown>, key: string): boolean | null {
  const v = details[key]
  return typeof v === 'boolean' ? v : null
}

export async function anlegePartnerKern(
  admin: AdminClient,
  rolle: PartnerRolle,
  input: PartnerAnlageInput,
): Promise<PartnerAnlageResult> {
  const password = generatePassword()

  // 1) Auth-User (rolle via profiles unten)
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email: input.email,
    password,
    email_confirm: true,
    user_metadata: { force_password_change: true },
  })
  if (authErr || !authUser?.user) {
    return { ok: false, error: authErr?.message ?? 'User-Anlage fehlgeschlagen' }
  }
  const userId = authUser.user.id

  // 2) Profile — rolle-abhaengig, 2FA explizit AUS (AAR-697: sonst /login/2fa statt Onboarding)
  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    email: input.email,
    rolle,
    vorname: rolle === 'sachverstaendiger' ? input.ansprechpartnerVorname : input.firma,
    nachname: rolle === 'sachverstaendiger' ? input.ansprechpartnerNachname : null,
    telefon: input.telefon,
    force_password_change: true,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: profErr.message }
  }

  // 3) Rollen-Row per switch(rolle). Rollback-Cascade (profiles delete + auth deleteUser) bei Fehler.
  let partnerId: string
  switch (rolle) {
    case 'makler': {
      // Makler-spezifische Optionalfelder aus rollenDetails: nur setzen wenn vorhanden,
      // damit convertPartnerLead-Makler (ohne diese Details) die DB-Defaults behaelt.
      // createMakler liefert dual-rate Provision + Gesellschaft + Strasse hierueber.
      const maklerInsert: Record<string, unknown> = {
        firma: input.firma,
        ansprechpartner_vorname: input.ansprechpartnerVorname,
        ansprechpartner_nachname: input.ansprechpartnerNachname,
        email: input.email,
        telefon: input.telefon,
        adresse_plz: input.plz,
        adresse_ort: input.ort,
        provision_aktiv: true,
        status: 'aktiv',
        aktiviert_am: new Date().toISOString(),
        aktiviert_von: input.aktiviertVon,
        user_id: userId,
      }
      const maklerStrasse = detailString(input.rollenDetails, 'adresse_strasse')
      if (maklerStrasse) maklerInsert.adresse_strasse = maklerStrasse
      const maklerVersId = detailString(input.rollenDetails, 'versicherung_id')
      if (maklerVersId) maklerInsert.versicherung_id = maklerVersId
      const maklerPoolId = detailString(input.rollenDetails, 'maklerpool_id')
      if (maklerPoolId) maklerInsert.maklerpool_id = maklerPoolId
      const provKomplett = detailNumber(input.rollenDetails, 'provision_betrag_komplett_netto')
      if (provKomplett !== null) maklerInsert.provision_betrag_komplett_netto = provKomplett
      const provGutachter = detailNumber(input.rollenDetails, 'provision_betrag_nur_gutachter_netto')
      if (provGutachter !== null) maklerInsert.provision_betrag_nur_gutachter_netto = provGutachter

      const { data: m, error: mErr } = await admin
        .from('makler')
        .insert(maklerInsert)
        .select('id')
        .single()
      if (mErr || !m) {
        await admin.from('profiles').delete().eq('id', userId)
        await admin.auth.admin.deleteUser(userId)
        return { ok: false, error: mErr?.message ?? 'Makler-Anlage fehlgeschlagen' }
      }
      partnerId = m.id as string

      // Default Promo-Code (MK-xxxx) — non-fatal: der Makler steht auch ohne Code (nachholbar).
      // Dynamischer Import: promo-code.ts ist 'server-only'; ein statischer Import zoege das in
      // den Modulgraphen von convert-partner-lead.ts und braeche dessen pure-function-Tests (vitest).
      try {
        const { generatePromoCode } = await import('@/lib/makler/promo-code')
        let promoOk = false
        for (let i = 0; i < 3 && !promoOk; i++) {
          const { error: pcErr } = await admin
            .from('promotion_codes')
            .insert({ makler_id: partnerId, code: generatePromoCode(), aktiv: true })
          if (!pcErr) promoOk = true
          else if (!/duplicate|unique/i.test(pcErr.message)) {
            console.error('[anlegePartnerKern] Promo-Code-Anlage fehlgeschlagen (non-fatal):', pcErr.message)
            break
          }
        }
      } catch (err) {
        console.error('[anlegePartnerKern] Promo-Code-Modul-Import fehlgeschlagen (non-fatal):', err)
      }
      break
    }

    case 'sachverstaendiger': {
      // Insert-Spalten aus dem bewaehrten buildSvInsertAusLead (SSoT, sv-basic/claim-eligibility).
      // ist_aktiv=false + verifizierung_status='ausstehend' bleiben pending bis Review/Zahlung.
      const synthetic: SvLeadRow = {
        vorname: input.ansprechpartnerVorname,
        name: input.ansprechpartnerNachname,
        nachname: input.ansprechpartnerNachname,
        firma: input.firma || null,
        telefon: input.telefon,
        email: input.email,
        adresse: null,
        plz: input.plz,
        ort: input.ort,
        lat: null,
        lng: null,
        dat_id: null,
        dat_expert_nr: detailString(input.rollenDetails, 'datNr'),
        bvsk_nr: detailString(input.rollenDetails, 'bvskNr'),
        ihk_zertifikat: null,
        oebuv_nr: detailString(input.rollenDetails, 'oebuvNr'),
        qualifikationen: null,
        fachschwerpunkte: null,
        jahre_erfahrung: null,
        isochrone_polygon: null,
        paket_umkreis_km: null,
      }
      const svInsert = {
        ...buildSvInsertAusLead(synthetic, userId),
        onboarding_quelle: 'self_service_neu',
      }
      const { data: svRow, error: svErr } = await admin
        .from('sachverstaendige')
        .insert(svInsert)
        .select('id')
        .single()
      if (svErr || !svRow) {
        await admin.from('profiles').delete().eq('id', userId)
        await admin.auth.admin.deleteUser(userId)
        return { ok: false, error: svErr?.message ?? 'SV-Anlage fehlgeschlagen' }
      }
      partnerId = (svRow as { id: string }).id
      break
    }

    case 'werkstatt': {
      // Insert-Spalten aus createWerkstatt (admin/werkstaetten/actions). status='aktiv'.
      // lat/lng aus input (von geocodePartnerLead via Convert-Pfad geliefert).
      const normalized_name = input.firma.toLowerCase().replace(/\s+/g, ' ').trim()
      const werkstattInsert: Record<string, unknown> = {
        name: input.firma,
        normalized_name,
        adresse_plz: input.plz,
        adresse_ort: input.ort,
        lat: input.lat ?? null,
        lng: input.lng ?? null,
        telefon: input.telefon,
        ansprechpartner_name:
          `${input.ansprechpartnerVorname} ${input.ansprechpartnerNachname}`.trim() || null,
        email: input.email,
        user_id: userId,
        provision_aktiv: true,
        status: 'aktiv',
        aktiviert_am: new Date().toISOString(),
        aktiviert_von: input.aktiviertVon,
      }
      // Self-Signup-Optionalfelder: nur setzen wenn vorhanden, damit der Convert-Pfad
      // (ohne diese Details) die DB-Defaults behaelt (Muster wie im makler-Case).
      const wStrasse = detailString(input.rollenDetails, 'adresse_strasse')
      if (wStrasse) werkstattInsert.adresse_strasse = wStrasse
      const wKleinunternehmer = detailBoolean(input.rollenDetails, 'ist_kleinunternehmer')
      if (wKleinunternehmer !== null) werkstattInsert.ist_kleinunternehmer = wKleinunternehmer

      const { data: w, error: wErr } = await admin
        .from('werkstaetten')
        .insert(werkstattInsert)
        .select('id')
        .single()
      if (wErr || !w) {
        await admin.from('profiles').delete().eq('id', userId)
        await admin.auth.admin.deleteUser(userId)
        return { ok: false, error: wErr?.message ?? 'Werkstatt-Anlage fehlgeschlagen' }
      }
      partnerId = (w as { id: string }).id
      break
    }

    default: {
      // Exhaustiveness-Guard: unbekannte Rolle -> Auth-User zuruecknehmen.
      await admin.from('profiles').delete().eq('id', userId)
      await admin.auth.admin.deleteUser(userId)
      return { ok: false, error: `Unbekannte Partner-Rolle: ${String(rolle)}` }
    }
  }

  // Standard-Staffelung (Default-Bonus-Stufen) — best-effort, non-fatal. Nur makler + werkstatt
  // haben eine Bonus-Staffel; SV nicht.
  if (rolle === 'makler') await setzeStandardStaffel(admin, 'makler', partnerId)
  else if (rolle === 'werkstatt') await setzeStandardStaffel(admin, 'werkstatt', partnerId)

  // AAR-phone-login (Phase 2): passwordless Telefon-Login fuer ALLE neuen Partner
  // (makler/werkstatt/SV) aktivieren — unbedingt, kein Rollen-Guard. Best-effort/
  // kollisionssicher, kein Outbound (phone_confirm:true). New-only per Konstruktion.
  await enablePhoneLogin(admin, userId, input.telefon)

  return { ok: true, userId, partnerId, password }
}
