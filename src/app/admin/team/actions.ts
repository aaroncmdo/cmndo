'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendCommunication } from '@/lib/communications/send'
import { einladungEmailHtml } from '@/lib/auth/invite-email'
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
    // F3 (Mitarbeiter-Audit): Rollback — den verwaisten auth.user wieder loeschen,
    // sonst blockt ein Retry mit derselben Email am "Email existiert" (createUser).
    try { await admin.auth.admin.deleteUser(newUser.user.id) } catch { /* best-effort */ }
    return { success: false, error: `Profil erstellen fehlgeschlagen: ${profileError.message}` }
  }

  // W2.3/AAR-951: eingestellt_am lebt in der admin-only Tabelle mitarbeiter_verguetung
  // (nicht mehr auf dem staff-lesbaren profiles).
  const { error: vergError } = await admin.from('mitarbeiter_verguetung').insert({
    profile_id: newUser.user.id,
    eingestellt_am: new Date().toISOString().split('T')[0],
  })
  if (vergError) {
    // F3 (Mitarbeiter-Audit): Rollback — profiles-Zeile + auth.user wieder entfernen.
    try { await admin.from('profiles').delete().eq('id', newUser.user.id) } catch { /* best-effort */ }
    try { await admin.auth.admin.deleteUser(newUser.user.id) } catch { /* best-effort */ }
    return { success: false, error: `Verguetung anlegen fehlgeschlagen: ${vergError.message}` }
  }

  // Audit-Fix #8: sendCommunication darf den Mitarbeiter-Anlage-Flow nicht
  // abbrechen wenn Twilio/SMTP ausfaellt — User ist schon in der DB. Admin
  // bekommt Email+Passwort als Return-Wert und kann manuell weitergeben.
  // AAR-auth-haertung (Befund F): Recovery-Magic-Link statt Klartext-Passwort
  // in der Mail (Email = geloggter/weiterleitbarer Kanal). Der Eingeladene setzt
  // sein eigenes Passwort; force_password_change=true bleibt als Fallback.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
  let magicLink: string | null = null
  try {
    const { data: linkData, error: linkErr } = await admin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${appUrl}/passwort-zuruecksetzen` },
    })
    if (linkErr || !linkData?.properties?.action_link) {
      console.error('[createMitarbeiter] Magic-Link-Generierung fehlgeschlagen:', linkErr?.message)
    } else {
      magicLink = linkData.properties.action_link
    }
  } catch (err) {
    console.error('[createMitarbeiter] Magic-Link-Sub-Op fehlgeschlagen:', err)
  }
  try {
    await sendCommunication('mitarbeiter_einladung', {
      email,
      vorname,
      subject: 'Einladung zu Claimondo',
      html: einladungEmailHtml({
        vorname,
        email,
        introHtml:
          `<p>Sie wurden als <strong>${rolle}</strong> zu Claimondo eingeladen.</p>` +
          `<p>Beim ersten Login richten Sie zur Kontosicherheit die Zwei-Faktor-Authentifizierung ein (Authenticator-App oder SMS-Code) — für interne Konten ist sie verpflichtend.</p>`,
        magicLink,
        appUrl,
      }),
    })
  } catch (err) {
    console.error('[createMitarbeiter] Einladungs-Email fehlgeschlagen:', err)
  }
  revalidatePath('/admin/team')
  return { success: true, email, password }
}

// Makler-Anlage konsolidiert auf /admin/makler (makler/actions.ts createMakler, #3151) —
// der dortige Pfad legt zusaetzlich einen Default-Promo-Code + dual-rate an (Lead-Attribution).
// Die fruehere team-seitige createMakler (AAR-949) erzeugte Makler OHNE Promo-Code (defekt)
// und wurde entfernt; Makler-Anlage laeuft jetzt ausschliesslich ueber das Makler-Portal.

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
  const position = formData.get('position') as string | null
  const gehaltsstufe = formData.get('gehaltsstufe') as string | null
  const gehalt = formData.get('gehalt_brutto') as string | null
  const eingestellt = formData.get('eingestellt_am') as string | null
  const { error: vergError } = await supabase
    .from('mitarbeiter_verguetung')
    .upsert(
      {
        profile_id: id,
        updated_at: new Date().toISOString(),
        ...(position !== null ? { position: position || null } : {}),
        ...(gehaltsstufe !== null ? { gehaltsstufe: gehaltsstufe || null } : {}),
        ...(gehalt ? { gehalt_brutto: parseFloat(gehalt) || null } : {}),
        ...(eingestellt ? { eingestellt_am: eingestellt } : {}),
      },
      { onConflict: 'profile_id' },
    )
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

// F1 (Mitarbeiter-Audit 08.07.): Vollstaendiger 2FA-Reset — loescht die echten
// GoTrue-MFA-Faktoren (TOTP/SMS) via clearTwoFa, nicht nur den profiles-Mirror wie
// resetTwoFaForUser (das nur die Nummer wechselt). Entsperrt einen Mitarbeiter, der
// seinen Authenticator/sein Telefon verloren hat — nach der 2FA-Pflicht der Standard-
// Aussperr-Fall. clearTwoFa ist admin-gegatet (schliesst zugleich die frueher
// ungegatete 'use server'-Exposure = IDOR).
export async function clearTwoFaForUser(
  targetUserId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await requireAdmin()
  const { clearTwoFa } = await import('@/lib/auth/twofa/remember-me')
  const r = await clearTwoFa(targetUserId)
  if (!r.success) return r
  const admin = createAdminClient()
  const user = (await supabase.auth.getUser())?.data?.user
  await admin.from('timeline').insert({
    typ: 'system',
    titel: '2FA vollständig zurückgesetzt (Konto entsperrt)',
    beschreibung:
      'Admin hat alle 2FA-Faktoren (TOTP + SMS) entfernt. Der Nutzer richtet die Zwei-Faktor-Authentifizierung beim nächsten Login neu ein.',
    erstellt_von: user?.id ?? null,
  })
  revalidatePath('/admin/team')
  revalidatePath(`/admin/team/${targetUserId}`)
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
