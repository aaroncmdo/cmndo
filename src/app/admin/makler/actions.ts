'use server'

// Makler-Vermittlung: Admin-Anlage eines Maklers. Spiegelt admin/werkstaetten/actions.ts
// (createWerkstatt): Auth-User + profiles(rolle='makler') + makler-Row + default Promo-Code.
// KEIN Isochrone (makler-irrelevant). dual-rate (komplett/nur_gutachter) statt flat.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { generatePromoCode } from '@/lib/makler/promo-code'

function generatePassword(length = 14): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) password += chars[array[i] % chars.length]
  return password + 'A1!'
}

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

export async function createMakler(
  formData: FormData,
): Promise<{ ok: true; email: string; password: string } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Makler anlegen.' }

  const firma = String(formData.get('firma') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  // ansprechpartner_vorname/nachname sind in makler NOT NULL -> nie null setzen.
  const ansprechpartner_vorname = String(formData.get('ansprechpartner_vorname') ?? '').trim()
  const ansprechpartner_nachname = String(formData.get('ansprechpartner_nachname') ?? '').trim()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const adresse_strasse = String(formData.get('adresse_strasse') ?? '').trim() || null
  const adresse_plz = String(formData.get('adresse_plz') ?? '').trim() || null
  const adresse_ort = String(formData.get('adresse_ort') ?? '').trim() || null
  const provKomplett = Number(formData.get('provision_betrag_komplett_netto') ?? 100) || 100
  const provGutachter = Number(formData.get('provision_betrag_nur_gutachter_netto') ?? 50) || 50
  // Makler-Gesellschaft: versicherungsgebunden (versicherung_id) ODER frei (maklerpool_id).
  const versicherung_id = String(formData.get('versicherung_id') ?? '').trim() || null
  const maklerpool_id = String(formData.get('maklerpool_id') ?? '').trim() || null

  if (!firma || !email || !ansprechpartner_vorname || !ansprechpartner_nachname) {
    return { ok: false, error: 'Firma, E-Mail und Ansprechpartner (Vor- und Nachname) sind Pflicht.' }
  }

  const admin = createAdminClient()
  const password = generatePassword()

  // 1) Auth-User (rolle='makler')
  const { data: authUser, error: authErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { force_password_change: true },
  })
  if (authErr || !authUser?.user) {
    return { ok: false, error: authErr?.message ?? 'User-Anlage fehlgeschlagen' }
  }
  const userId = authUser.user.id

  // 2) Profile (rolle='makler')
  const { error: profErr } = await admin.from('profiles').insert({
    id: userId,
    email,
    rolle: 'makler',
    vorname: firma,
    force_password_change: true,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })
  if (profErr) {
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: profErr.message }
  }

  // 3) makler-Row
  const { data: m, error: mErr } = await admin.from('makler').insert({
    firma,
    ansprechpartner_vorname,
    ansprechpartner_nachname,
    email,
    telefon,
    adresse_strasse,
    adresse_plz,
    adresse_ort,
    provision_betrag_komplett_netto: provKomplett,
    provision_betrag_nur_gutachter_netto: provGutachter,
    provision_aktiv: true,
    status: 'aktiv',
    aktiviert_am: new Date().toISOString(),
    aktiviert_von: adminUser.id,
    versicherung_id,
    maklerpool_id,
    user_id: userId,
  }).select('id').single()

  if (mErr || !m) {
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    return { ok: false, error: mErr?.message ?? 'Makler-Anlage fehlgeschlagen' }
  }

  // 4) Default Promo-Code (MK-xxxx) — der vermittelnde Identifier (Attribution via leads.promotion_code_id).
  //    Non-fatal: der Makler steht; ein Code kann nachgezogen werden. Retry bei Unique-Kollision.
  let promoOk = false
  for (let i = 0; i < 3 && !promoOk; i++) {
    const { error: pcErr } = await admin.from('promotion_codes').insert({
      makler_id: m.id,
      code: generatePromoCode(),
      aktiv: true,
    })
    if (!pcErr) promoOk = true
    else if (!/duplicate|unique/i.test(pcErr.message)) {
      console.error('[createMakler] Promo-Code-Anlage fehlgeschlagen (non-fatal):', pcErr.message)
      break
    }
  }

  revalidatePath('/admin/makler')
  return { ok: true, email, password }
}
