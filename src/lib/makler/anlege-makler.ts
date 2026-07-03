import { createAdminClient } from '@/lib/supabase/admin'
import { generatePromoCode } from '@/lib/makler/promo-code'

// Gemeinsamer Kern der Makler-Anlage — von admin-createMakler UND dem Self-Signup genutzt.
// Legt Auth-User (Random-PW + force_password_change) + profiles(rolle='makler') +
// makler-Row(status='aktiv') + Default-Promo-Code an, mit Rollback-Cascade bei Fehler.
// KEIN 'use server' (AAR-664: importierbar von beiden Server-Actions).
// Caller-Verantwortung: Validierung, Email-Dedupe, (self) Rate-Limit, (self) Magic-Link/Notify.

type AdminClient = ReturnType<typeof createAdminClient>

function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length]
  return password + 'A1!'
}

export type MaklerAnlageInput = {
  firma: string
  ansprechpartnerVorname: string
  ansprechpartnerNachname: string
  email: string // erwartet normalisiert (trim + lowercase)
  telefon: string | null
  adresseStrasse: string | null
  adressePlz: string | null
  adresseOrt: string | null
  provisionKomplett: number
  provisionGutachter: number
  aktiviertVon: string | null // admin user-id, oder null beim Self-Signup
  // Makler-Gesellschaft: entweder versicherungsgebunden (versicherungId) ODER frei (maklerpoolId).
  // Der Typ wird aus dem gesetzten FK abgeleitet; beide null = (noch) nicht zugeordnet.
  versicherungId?: string | null
  maklerpoolId?: string | null
}

export type MaklerAnlageResult =
  | { ok: true; userId: string; maklerId: string; password: string }
  | { ok: false; error: string }

export async function anlegeMaklerKern(
  admin: AdminClient,
  input: MaklerAnlageInput,
): Promise<MaklerAnlageResult> {
  const password = generatePassword()

  // 1) Auth-User (rolle='makler' via profiles unten)
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

  // 2) Profile
  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    email: input.email,
    rolle: 'makler',
    vorname: input.firma,
    force_password_change: true,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: profErr.message }
  }

  // 3) makler-Row (status='aktiv' -> Saeule-A-Landeseite sofort live)
  const { data: m, error: mErr } = await admin
    .from('makler')
    .insert({
      firma: input.firma,
      ansprechpartner_vorname: input.ansprechpartnerVorname,
      ansprechpartner_nachname: input.ansprechpartnerNachname,
      email: input.email,
      telefon: input.telefon,
      adresse_strasse: input.adresseStrasse,
      adresse_plz: input.adressePlz,
      adresse_ort: input.adresseOrt,
      provision_betrag_komplett_netto: input.provisionKomplett,
      provision_betrag_nur_gutachter_netto: input.provisionGutachter,
      provision_aktiv: true,
      status: 'aktiv',
      aktiviert_am: new Date().toISOString(),
      aktiviert_von: input.aktiviertVon,
      versicherung_id: input.versicherungId ?? null,
      maklerpool_id: input.maklerpoolId ?? null,
      user_id: userId,
    })
    .select('id')
    .single()

  if (mErr || !m) {
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: mErr?.message ?? 'Makler-Anlage fehlgeschlagen' }
  }

  // 4) Default Promo-Code (MK-xxxx) — Attribution via leads.promotion_code_id + Slug der
  //    Saeule-A-Landeseite. Non-fatal: der Makler steht; ein Code ist via getOrCreate nachholbar.
  let promoOk = false
  for (let i = 0; i < 3 && !promoOk; i++) {
    const { error: pcErr } = await admin
      .from('promotion_codes')
      .insert({ makler_id: m.id, code: generatePromoCode(), aktiv: true })
    if (!pcErr) promoOk = true
    else if (!/duplicate|unique/i.test(pcErr.message)) {
      console.error('[anlegeMaklerKern] Promo-Code-Anlage fehlgeschlagen (non-fatal):', pcErr.message)
      break
    }
  }

  return { ok: true, userId, maklerId: m.id as string, password }
}
