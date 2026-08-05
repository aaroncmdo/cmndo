'use server'

// Flotten-Self-Signup (05.08., Aaron: „Firmen als Partner hinzufuegen"): public
// Registrier-Flow analog werkstatt/makler — Reuse des Admin-Anlage-Kerns
// (ensureFirma find-or-create + anlegeFlottenmanagerKern + Welcome-Mail) mit
// aktiviertVon=null (Self-Signup) + Netzwerk-Einladungs-Redemption + Team-WA.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { ensureFirma } from '@/lib/firmen/ensure-firma'
import { anlegeFlottenmanagerKern } from '@/lib/partner/anlege-flottenmanager'

const EMAIL_RX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export async function registriereFlotteSelf(
  formData: FormData,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const firmaName = String(formData.get('firma_name') ?? '').trim()
  const vorname = String(formData.get('vorname') ?? '').trim()
  const email = String(formData.get('email') ?? '').trim().toLowerCase()
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const einladungToken = String(formData.get('einladung') ?? '').trim()

  if (!firmaName || !vorname || !email) {
    return { ok: false, error: 'Firmenname, Vorname und E-Mail sind Pflichtfelder.' }
  }
  if (!EMAIL_RX.test(email)) {
    return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  }

  const admin = createAdminClient()

  // Doppel-Account-Guard: existiert die Mail schon, ist das keine Neu-Registrierung.
  const { data: existing } = await admin.from('profiles').select('id').eq('email', email).maybeSingle()
  if (existing) {
    return {
      ok: false,
      error: 'Zu dieser E-Mail existiert bereits ein Konto — bitte einloggen oder „Vernetzen" im Verzeichnis nutzen.',
    }
  }

  // Firma find-or-create (Muster admin/firmen-flotte).
  const firmaResult = await ensureFirma({
    db: admin,
    snapshot: { name: firmaName, quelle: 'flotte_self_signup' },
  })
  if (!firmaResult.ok) {
    console.error('[registriereFlotteSelf] ensureFirma:', firmaResult.error)
    return { ok: false, error: 'Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.' }
  }

  const result = await anlegeFlottenmanagerKern(admin, {
    firmaId: firmaResult.firmaId,
    email,
    telefon,
    vorname,
    aktiviertVon: null, // Self-Signup
  })
  if (!result.ok) {
    console.error('[registriereFlotteSelf] Anlage:', result.error)
    return { ok: false, error: 'Registrierung konnte nicht abgeschlossen werden. Bitte versuchen Sie es erneut.' }
  }

  // Welcome-Mail (best-effort, wie der Admin-Pfad).
  try {
    const { sendFlottenmanagerWelcome } = await import('@/lib/email/google/flows')
    await sendFlottenmanagerWelcome({ to: email, vorname, firmaName })
  } catch (err) {
    console.error('[registriereFlotteSelf] Welcome-Email (non-critical):', err)
  }

  // Netzwerk-Kalt-Einladung einloesen (Auto-Kante zum Einlader) — best-effort.
  if (einladungToken) {
    try {
      const { loeseNetzwerkEinladungEin } = await import('@/lib/netzwerk/einladung')
      await loeseNetzwerkEinladungEin(admin, einladungToken, result.userId)
    } catch (err) {
      console.error('[registriereFlotteSelf] netzwerk-einladung redemption (non-critical):', err)
    }
  }

  // Team-Echtzeit-Sichtbarkeit (j08-Soll): Team-WA wie bei den anderen Self-Signups.
  try {
    const { notifyTeamPartnerSignup } = await import('@/lib/partner/notify-team-signup')
    await notifyTeamPartnerSignup({
      typ: 'flotte',
      art: 'registrierung',
      quelle: '/flotte/registrieren (Self-Signup)',
      firma: firmaName,
      name: vorname,
      email,
      telefon,
      ort: null,
      adminPfad: '/admin/firmen-flotte',
    })
  } catch (err) {
    console.error('[registriereFlotteSelf] Team-Notify (non-critical):', err)
  }

  revalidatePath('/admin/firmen-flotte')
  return { ok: true }
}
