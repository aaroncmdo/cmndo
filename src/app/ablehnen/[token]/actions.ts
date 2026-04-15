'use server'

// AAR-134 Phase 5: Public Server Action für Email-Link-Ablehnung.
// KEIN Auth-Check — der Token IST die Autorisierung.

import { createAdminClient } from '@/lib/supabase/admin'
import { redirect } from 'next/navigation'

export async function ablehneMitToken(
  token: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  if (!token || token.length < 8) return { success: false, error: 'Ungültiger Link' }
  if (!grund || grund.trim().length < 10) {
    return { success: false, error: 'Bitte mindestens 10 Zeichen Begründung angeben.' }
  }

  const adminDb = createAdminClient()

  // Termin via Token laden + Expiry-Check
  const { data: termin } = await adminDb
    .from('gutachter_termine')
    .select('id, status, sv_id, fall_id, lead_id, ablehnen_token_expires_at')
    .eq('ablehnen_token', token)
    .single()

  if (!termin) return { success: false, error: 'Link ungültig' }
  if (
    termin.ablehnen_token_expires_at &&
    new Date(termin.ablehnen_token_expires_at).getTime() < Date.now()
  ) {
    return { success: false, error: 'Link abgelaufen — bitte über das Portal ablehnen.' }
  }
  if (!['reserviert', 'bestaetigt'].includes(termin.status)) {
    return { success: false, error: `Termin ist bereits im Status "${termin.status}"` }
  }

  const { error: upErr } = await adminDb
    .from('gutachter_termine')
    .update({
      status: 'abgelehnt',
      sv_ablehnung_grund: grund.trim(),
      sv_ablehnung_am: new Date().toISOString(),
    })
    .eq('id', termin.id)

  if (upErr) return { success: false, error: upErr.message }

  // Dispatcher-Email
  try {
    const { sendDispatcherTerminAbgelehnt } = await import('@/lib/email/google/flows')
    await sendDispatcherTerminAbgelehnt(termin.id, grund.trim())
  } catch (err) {
    console.warn('[ablehneMitToken] Dispatcher-Email fehlgeschlagen:', err)
  }

  // Timeline (sv_id ist im Termin gespeichert; erstellt_von kennen wir nicht — null)
  await adminDb.from('timeline').insert({
    fall_id: termin.fall_id ?? null,
    lead_id: !termin.fall_id ? termin.lead_id : null,
    typ: 'termin',
    titel: 'SV hat Termin abgelehnt (via Email-Link)',
    beschreibung: `Grund: ${grund.trim()}`,
    erstellt_von: null,
  }).then(() => {}, () => {})

  return { success: true }
}

// Form-Action-Wrapper für die <form action={...}> Convention
export async function ablehneFromForm(formData: FormData): Promise<void> {
  const token = String(formData.get('token') ?? '')
  const grund = String(formData.get('grund') ?? '')
  const r = await ablehneMitToken(token, grund)
  if (r.success) {
    redirect(`/ablehnen/${token}/erfolg`)
  } else {
    redirect(`/ablehnen/${token}?error=${encodeURIComponent(r.error ?? 'Fehler')}`)
  }
}
