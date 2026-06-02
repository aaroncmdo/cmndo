'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'
import { revalidatePath } from 'next/cache'

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789'
  let password = ''
  const array = new Uint8Array(length)
  crypto.getRandomValues(array)
  for (let i = 0; i < length; i++) {
    password += chars[array[i] % chars.length]
  }
  return password
}

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) throw new Error('Nicht angemeldet')
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') throw new Error('Nur Admins')
  return supabase
}

export async function createMitarbeiter(
  formData: FormData,
): Promise<{ success: true; email: string; password: string } | { success: false; error: string }> {
  await requireAdmin()
  const email = (formData.get('email') as string).trim().toLowerCase()
  const vorname = (formData.get('vorname') as string).trim()
  const nachname = (formData.get('nachname') as string).trim()
  const rolle = formData.get('rolle') as string
  const kategorie = (formData.get('kategorie') as string | null) || null
  const kapazitaet = parseInt(formData.get('kapazitaet_max') as string) || 100
  if (!email || !vorname || !nachname || !rolle) {
    return { success: false, error: 'Alle Felder sind erforderlich' }
  }

  const password = generatePassword()
  const admin = createAdminClient()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { vorname, nachname },
  })
  if (createError) {
    return { success: false, error: `Benutzer erstellen fehlgeschlagen: ${createError.message}` }
  }

  const { error: profileError } = await admin.from('profiles').upsert({
    id: newUser.user.id, email, vorname, nachname, rolle,
    force_password_change: true, auth_provider: 'email',
    kategorie, kapazitaet_max: kapazitaet, aktiv: true,
    twofa_aktiviert: false,
    twofa_email_aktiviert: false,
  })
  if (profileError) {
    return { success: false, error: `Profil erstellen fehlgeschlagen: ${profileError.message}` }
  }

  // W2.3/AAR-951: eingestellt_am lebt in der admin-only Tabelle mitarbeiter_verguetung
  // (nicht mehr auf dem staff-lesbaren profiles).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tabelle noch nicht in database.types.ts (Type-Regen folgt)
  const { error: vergError } = await (admin as any).from('mitarbeiter_verguetung').insert({
    profile_id: newUser.user.id,
    eingestellt_am: new Date().toISOString().split('T')[0],
  })
  if (vergError) {
    return { success: false, error: `Verguetung anlegen fehlgeschlagen: ${vergError.message}` }
  }

  // Audit-Fix #8: sendCommunication darf den Mitarbeiter-Anlage-Flow nicht
  // abbrechen wenn Twilio/SMTP ausfaellt — User ist schon in der DB. Admin
  // bekommt Email+Passwort als Return-Wert und kann manuell weitergeben.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  try {
    await sendCommunication('mitarbeiter_einladung', {
      email,
      vorname,
      subject: 'Einladung zu Claimondo',
      html: `<p>Hallo ${vorname},</p><p>Sie wurden als <strong>${rolle}</strong> zu Claimondo eingeladen.</p><p>E-Mail: <strong>${email}</strong></p><p>Einmalpasswort: <strong>${password}</strong></p><p><a href="${appUrl}/login">Jetzt einloggen</a></p>`,
    })
  } catch (err) {
    console.error('[createMitarbeiter] Einladungs-Email fehlgeschlagen:', err)
  }
  revalidatePath('/admin/team')
  return { success: true, email, password }
}

// W2.1/AAR-949: Anlage-Pfad fuer rolle='makler'. Analog createMitarbeiter
// (Auth-User + profiles + force_password_change + Einladung), erweitert um die
// dedizierte makler-Row (Portal-Guard sucht makler via user_id + status='aktiv').
// Bislang gab es keinen Anlage-Pfad — Makler entstanden nur per Seed/manuell.
export async function createMakler(
  formData: FormData,
): Promise<{ success: true; email: string; password: string } | { success: false; error: string }> {
  const supabase = await requireAdmin()
  const adminId = (await supabase.auth.getUser())?.data?.user?.id ?? null

  const email = (formData.get('email') as string | null)?.trim().toLowerCase()
  const firma = (formData.get('firma') as string | null)?.trim()
  const vorname = (formData.get('ansprechpartner_vorname') as string | null)?.trim()
  const nachname = (formData.get('ansprechpartner_nachname') as string | null)?.trim()
  const telefon = ((formData.get('telefon') as string | null) || '').trim() || null
  const ihkNummer = ((formData.get('ihk_nummer') as string | null) || '').trim() || null
  const provKomplett = parseFloat(formData.get('provision_betrag_komplett_netto') as string)
  const provGutachter = parseFloat(formData.get('provision_betrag_nur_gutachter_netto') as string)
  if (!email || !firma || !vorname || !nachname) {
    return { success: false, error: 'Firma, Ansprechpartner (Vor- und Nachname) und E-Mail sind erforderlich' }
  }

  const password = generatePassword()
  const admin = createAdminClient()

  // 1) Auth-User
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { vorname, nachname },
  })
  if (createError) {
    return { success: false, error: `Benutzer erstellen fehlgeschlagen: ${createError.message}` }
  }
  const userId = newUser.user.id

  // 2) profiles-Row mit rolle='makler' (requirePortalAccess(['makler']) im Makler-Portal-Guard).
  //    kategorie/kapazitaet_max bleiben leer — das sind Dispatch-/KB-Felder, fuer Makler irrelevant.
  const { error: profileError } = await admin.from('profiles').upsert({
    id: userId, email, vorname, nachname, rolle: 'makler',
    force_password_change: true, auth_provider: 'email', aktiv: true,
    twofa_aktiviert: false, twofa_email_aktiviert: false,
  })
  if (profileError) {
    // Kein halber Account: Auth-User wieder entfernen.
    await admin.auth.admin.deleteUser(userId)
    return { success: false, error: `Profil erstellen fehlgeschlagen: ${profileError.message}` }
  }

  // 3) makler-Row. status='aktiv' -> Makler landet beim ersten Login direkt im Portal
  //    (sonst Layout-Redirect auf /makler/pending). aktiviert_von = anlegender Admin.
  const { error: maklerError } = await admin.from('makler').insert({
    user_id: userId,
    firma,
    ansprechpartner_vorname: vorname,
    ansprechpartner_nachname: nachname,
    email,
    telefon,
    ihk_nummer: ihkNummer,
    status: 'aktiv',
    aktiviert_am: new Date().toISOString(),
    aktiviert_von: adminId,
    ...(Number.isFinite(provKomplett) ? { provision_betrag_komplett_netto: provKomplett } : {}),
    ...(Number.isFinite(provGutachter) ? { provision_betrag_nur_gutachter_netto: provGutachter } : {}),
  })
  if (maklerError) {
    // Kein halber Account: profiles + Auth-User wieder entfernen.
    await admin.from('profiles').delete().eq('id', userId)
    await admin.auth.admin.deleteUser(userId)
    const msg = maklerError.message.includes('makler_email_key')
      ? 'Es existiert bereits ein Makler mit dieser E-Mail'
      : maklerError.message
    return { success: false, error: `Makler anlegen fehlgeschlagen: ${msg}` }
  }

  // Einladungs-Email (non-fatal: Account ist schon angelegt, Admin bekommt das
  // Passwort als Return-Wert und kann es notfalls manuell weitergeben).
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  try {
    await sendCommunication('mitarbeiter_einladung', {
      email,
      vorname,
      subject: 'Einladung zum Claimondo-Makler-Portal',
      html: `<p>Hallo ${vorname},</p><p>Sie wurden als Makler-Partner (<strong>${firma}</strong>) zum Claimondo-Portal eingeladen.</p><p>E-Mail: <strong>${email}</strong></p><p>Einmalpasswort: <strong>${password}</strong></p><p><a href="${appUrl}/login">Jetzt einloggen</a></p>`,
    })
  } catch (err) {
    console.error('[createMakler] Einladungs-Email fehlgeschlagen:', err)
  }

  revalidatePath('/admin/team')
  return { success: true, email, password }
}

export async function updateMitarbeiter(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await requireAdmin()
  const id = formData.get('id') as string
  // Operative Felder bleiben auf profiles.
  const updates: Record<string, unknown> = {}
  for (const key of ['vorname', 'nachname', 'telefon', 'kategorie']) {
    const val = formData.get(key) as string | null
    if (val !== null) updates[key] = val || null
  }
  const kap = formData.get('kapazitaet_max') as string | null
  if (kap) updates.kapazitaet_max = parseInt(kap) || 100
  const aktiv = formData.get('aktiv') as string | null
  if (aktiv !== null) updates.aktiv = aktiv === 'true'

  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) return { success: false, error: error.message }

  // W2.3/AAR-951: HR-/Verguetungsfelder leben in der admin-only Tabelle
  // mitarbeiter_verguetung (RLS is_admin), nicht mehr staff-lesbar auf profiles.
  const verg: Record<string, unknown> = { profile_id: id, updated_at: new Date().toISOString() }
  for (const key of ['position', 'gehaltsstufe']) {
    const val = formData.get(key) as string | null
    if (val !== null) verg[key] = val || null
  }
  const gehalt = formData.get('gehalt_brutto') as string | null
  if (gehalt) verg.gehalt_brutto = parseFloat(gehalt) || null
  const eingestellt = formData.get('eingestellt_am') as string | null
  if (eingestellt) verg.eingestellt_am = eingestellt
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Tabelle noch nicht in database.types.ts (Type-Regen folgt)
  const { error: vergError } = await (supabase as any)
    .from('mitarbeiter_verguetung')
    .upsert(verg, { onConflict: 'profile_id' })
  if (vergError) return { success: false, error: vergError.message }

  revalidatePath('/admin/team')
  revalidatePath(`/admin/team/${id}`)
  return { success: true }
}

export async function createIncentive(
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('incentives').insert({
    titel: formData.get('titel') as string,
    beschreibung: (formData.get('beschreibung') as string) || null,
    kategorie: formData.get('kategorie') as string,
    typ: formData.get('typ') as string,
    bedingung: formData.get('bedingung') as string,
    wert: parseFloat(formData.get('wert') as string) || 0,
    aktiv: true,
    gueltig_ab: (formData.get('gueltig_ab') as string) || null,
    gueltig_bis: (formData.get('gueltig_bis') as string) || null,
  })
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/team')
  return { success: true }
}

export async function toggleIncentive(
  id: string,
  aktiv: boolean,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('incentives').update({ aktiv }).eq('id', id)
  if (error) return { success: false, error: error.message }
  revalidatePath('/admin/team')
  return { success: true }
}

// AAR-343: Admin-Reset der 2FA-Telefonnummer (bei Nummern-Wechsel etc).
// Setzt twofa_telefon zurück und invalidiert alle remember-Tokens — beim
// nächsten Login greift der Fallback auf profiles.telefon ODER, wenn
// eine neue Nummer mitgegeben wurde, wird die direkt verwendet.
export async function resetTwoFaForUser(
  targetUserId: string,
  newPhone?: string | null,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await requireAdmin()
  const admin = createAdminClient()

  const cleanPhone = newPhone?.trim() || null
  // profile updaten (entweder auf null oder auf neue Nummer)
  const { error: updErr } = await admin
    .from('profiles')
    .update({
      twofa_telefon: cleanPhone,
      twofa_telefon_verifiziert_am: null,
      updated_at: new Date().toISOString(),
    })
    .eq('id', targetUserId)
  if (updErr) return { success: false, error: updErr.message }

  // Alle remember-Tokens invalidieren (User muss sich neu per SMS verifizieren)
  const { revokeAllTokens } = await import('@/lib/auth/twofa/remember-me')
  await revokeAllTokens(targetUserId)

  // Audit via timeline (ohne fall_id/lead_id — reiner System-Eintrag)
  const user = (await supabase.auth.getUser())?.data?.user
  await admin.from('timeline').insert({
    typ: 'system',
    titel: '2FA-Telefonnummer zurückgesetzt',
    beschreibung: cleanPhone
      ? `Admin hat die 2FA-Nummer geändert (auf ${cleanPhone}). Alle Remember-Tokens wurden widerrufen.`
      : 'Admin hat die 2FA-Nummer entfernt. Beim nächsten Login greift der Fallback auf die Profil-Telefonnummer. Remember-Tokens wurden widerrufen.',
    erstellt_von: user?.id ?? null,
  })

  revalidatePath('/admin/team')
  return { success: true }
}

// AAR-634: Admin deaktiviert KB + Fälle werden sofort neu verteilt (statt
// auf den nächtlichen Cron zu warten). Nutzt den Shared-Helper aus
// kb-assignment.ts — gleicher Round-Robin wie bei Conversion.
export async function deactivateKbWithReassign(
  kbId: string,
): Promise<{
  success: boolean
  error?: string
  reassigned_count?: number
  tasks_reassigned?: number
  failed_count?: number
}> {
  try {
    await requireAdmin()
    const admin = createAdminClient()

    const { error: updateErr } = await admin
      .from('profiles')
      .update({ aktiv: false, updated_at: new Date().toISOString() })
      .eq('id', kbId)
    if (updateErr) return { success: false, error: updateErr.message }

    const { reassignAllFaelleForInactiveKbs } = await import('@/lib/faelle/kb-assignment')
    const result = await reassignAllFaelleForInactiveKbs(admin)

    revalidatePath('/admin/team')
    revalidatePath('/admin/faelle')
    return {
      success: true,
      reassigned_count: result.reassigned_count,
      tasks_reassigned: result.tasks_reassigned,
      failed_count: result.failed_count,
    }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unbekannter Fehler' }
  }
}

// KFZ-182: Twilio WhatsApp-Nummer Provisioning
export async function provisionTwilioNummer(profileId: string) {
  await requireAdmin()
  const { provisionKbNummer } = await import('@/lib/twilio/provision-kb-nummer')
  return provisionKbNummer(profileId)
}

export async function releaseTwilioNummer(profileId: string) {
  await requireAdmin()
  const { releaseKbNummer } = await import('@/lib/twilio/provision-kb-nummer')
  return releaseKbNummer(profileId)
}
