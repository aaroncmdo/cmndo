'use server'

// DSGVO Art. 17 — Recht auf Vergessenwerden.
//
// Drei Pfade:
//   1. Self-Service: Kunde stellt Antrag im Kunden-Portal
//   2. Admin-manuell: Admin trägt Email-Anfrage ein
//   3. Cron ausführen: täglich, bei status='bestaetigt' AND bestaetigt_am+14d
//
// Anonymisierung läuft via SQL-Function dsgvo_anonymize_user_data() aus
// Migration 20260510095718. Hier sind die Server-Actions die den Workflow
// orchestrieren.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

type Result =
  | { ok: true; auftragId: string }
  | { ok: false; error: string }

// ─── Self-Service: Kunde stellt Antrag ─────────────────────────────────
export async function stelleLoeschAntrag(grund?: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user }, error: authErr } = await supabase.auth.getUser()
  if (authErr || !user) return { ok: false, error: 'Nicht angemeldet' }

  // Idempotenz: existiert bereits ein offener Antrag?
  const { data: bestehend } = await supabase
    .from('dsgvo_loeschauftraege')
    .select('id, status')
    .eq('user_id', user.id)
    .in('status', ['eingereicht', 'bestaetigt'])
    .maybeSingle()

  if (bestehend) {
    return { ok: false, error: 'Sie haben bereits einen offenen Lösch-Antrag.' }
  }

  const { data, error } = await supabase
    .from('dsgvo_loeschauftraege')
    .insert({
      user_id: user.id,
      email: user.email ?? '',
      grund: grund ?? null,
      eingereicht_von: 'self_service',
      status: 'eingereicht',
    })
    .select('id')
    .single()

  if (error || !data) return { ok: false, error: error?.message ?? 'Insert fehlgeschlagen' }

  revalidatePath('/kunde/einstellungen')
  return { ok: true, auftragId: data.id as string }
}

// ─── Admin: Antrag bestätigen (startet 14d-Karenz) ────────────────────
export async function bestaetigeLoeschAntrag(auftragId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  // Admin-Check
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admin' }

  const admin = createAdminClient()
  const { error } = await admin
    .from('dsgvo_loeschauftraege')
    .update({
      status: 'bestaetigt',
      bestaetigt_am: new Date().toISOString(),
      bestaetigt_von_user_id: user.id,
    })
    .eq('id', auftragId)
    .eq('status', 'eingereicht') // nur aus 'eingereicht' bestaetigbar

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/datenschutz/loeschauftraege')
  return { ok: true, auftragId }
}

// ─── Admin: Antrag direkt ausführen (ohne 14d-Karenz, nur in begründeten
// Fällen) ───────────────────────────────────────────────────────────
export async function fuehreLoeschungAus(auftragId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admin' }

  const admin = createAdminClient()

  // Antrag laden
  const { data: auftrag, error: ladErr } = await admin
    .from('dsgvo_loeschauftraege')
    .select('id, user_id, email, status')
    .eq('id', auftragId)
    .single()
  if (ladErr || !auftrag) return { ok: false, error: 'Auftrag nicht gefunden' }

  if (auftrag.status === 'ausgefuehrt') {
    return { ok: false, error: 'Bereits ausgeführt' }
  }
  if (!auftrag.user_id) {
    return { ok: false, error: 'User-ID fehlt — manuelle Prüfung nötig' }
  }

  // Audit-Snapshot vor Anonymisierung
  const { data: profileSnap } = await admin
    .from('profiles')
    .select('id, email, vorname, nachname')
    .eq('id', auftrag.user_id as string)
    .single()

  const { count: claimsCount } = await admin
    .from('claims')
    .select('id', { count: 'exact', head: true })
    .eq('kunde_id', auftrag.user_id as string)

  // 1. SQL-Function rufen — anonymisiert alle PII-Tabellen
  const { error: anonErr } = await admin.rpc('dsgvo_anonymize_user_data', {
    p_user_id: auftrag.user_id as string,
  })
  if (anonErr) {
    return { ok: false, error: `Anonymisierung fehlgeschlagen: ${anonErr.message}` }
  }

  // 2. auth.users hart löschen — entzieht Login + Sessions
  const { error: deleteUserErr } = await admin.auth.admin.deleteUser(
    auftrag.user_id as string,
  )
  if (deleteUserErr) {
    console.warn('[dsgvo] auth.users.delete fehlgeschlagen — Anonymisierung war ok:', deleteUserErr.message)
    // nicht hart returnen — Anonymisierung ist die wichtigere Maßnahme
  }

  // 3. Antrag als ausgefuehrt markieren
  await admin
    .from('dsgvo_loeschauftraege')
    .update({
      status: 'ausgefuehrt',
      ausgefuehrt_am: new Date().toISOString(),
      audit_payload: {
        profile_pre_delete: profileSnap,
        claims_count: claimsCount,
        executed_by_admin_user_id: user.id,
        auth_user_deleted: !deleteUserErr,
      },
    })
    .eq('id', auftragId)

  revalidatePath('/admin/datenschutz/loeschauftraege')
  return { ok: true, auftragId }
}

// ─── Self-Service: Antrag stornieren (vor Bestätigung) ────────────────
export async function storniereLoeschAntrag(auftragId: string): Promise<Result> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { error } = await supabase
    .from('dsgvo_loeschauftraege')
    .update({ status: 'storniert' })
    .eq('id', auftragId)
    .eq('user_id', user.id)
    .in('status', ['eingereicht', 'bestaetigt']) // nicht aus 'ausgefuehrt'

  if (error) return { ok: false, error: error.message }
  revalidatePath('/kunde/einstellungen')
  return { ok: true, auftragId }
}
