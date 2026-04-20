'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'

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

export async function createMitarbeiter(formData: FormData): Promise<{ email: string; password: string }> {
  await requireAdmin()
  const email = (formData.get('email') as string).trim().toLowerCase()
  const vorname = (formData.get('vorname') as string).trim()
  const nachname = (formData.get('nachname') as string).trim()
  const rolle = formData.get('rolle') as string
  const kategorie = (formData.get('kategorie') as string | null) || null
  const kapazitaet = parseInt(formData.get('kapazitaet_max') as string) || 100
  if (!email || !vorname || !nachname || !rolle) throw new Error('Alle Felder sind erforderlich')

  const password = generatePassword()
  const admin = createAdminClient()
  const { data: newUser, error: createError } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { vorname, nachname },
  })
  if (createError) throw new Error(`Benutzer erstellen fehlgeschlagen: ${createError.message}`)

  const { error: profileError } = await admin.from('profiles').upsert({
    id: newUser.user.id, email, vorname, nachname, rolle,
    force_password_change: true, auth_provider: 'email',
    kategorie, kapazitaet_max: kapazitaet, aktiv: true,
    eingestellt_am: new Date().toISOString().split('T')[0],
  })
  if (profileError) throw new Error(`Profil erstellen fehlgeschlagen: ${profileError.message}`)

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://cmndo.vercel.app'
  await sendCommunication('mitarbeiter_einladung', {
    email,
    vorname,
    subject: 'Einladung zu Claimondo',
    html: `<p>Hallo ${vorname},</p><p>Sie wurden als <strong>${rolle}</strong> zu Claimondo eingeladen.</p><p>E-Mail: <strong>${email}</strong></p><p>Einmalpasswort: <strong>${password}</strong></p><p><a href="${appUrl}/login">Jetzt einloggen</a></p>`,
  })
  return { email, password }
}

export async function updateMitarbeiter(formData: FormData) {
  const supabase = await requireAdmin()
  const id = formData.get('id') as string
  const updates: Record<string, unknown> = {}
  for (const key of ['vorname', 'nachname', 'telefon', 'position', 'gehaltsstufe', 'kategorie']) {
    const val = formData.get(key) as string | null
    if (val !== null) updates[key] = val || null
  }
  const gehalt = formData.get('gehalt_brutto') as string | null
  if (gehalt) updates.gehalt_brutto = parseFloat(gehalt) || null
  const kap = formData.get('kapazitaet_max') as string | null
  if (kap) updates.kapazitaet_max = parseInt(kap) || 100
  const eingestellt = formData.get('eingestellt_am') as string | null
  if (eingestellt) updates.eingestellt_am = eingestellt
  const aktiv = formData.get('aktiv') as string | null
  if (aktiv !== null) updates.aktiv = aktiv === 'true'

  const { error } = await supabase.from('profiles').update(updates).eq('id', id)
  if (error) throw new Error(error.message)
}

export async function createIncentive(formData: FormData) {
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
  if (error) throw new Error(error.message)
}

export async function toggleIncentive(id: string, aktiv: boolean) {
  const supabase = await requireAdmin()
  const { error } = await supabase.from('incentives').update({ aktiv }).eq('id', id)
  if (error) throw new Error(error.message)
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
