'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { resolveTasksForEntity } from '@/lib/tasks/resolve-tasks'
import { createLinkedTask } from '@/lib/tasks/create-task'
import { getKatalogSlot } from '@/lib/dokumente/katalog'
import { revalidatePath } from 'next/cache'

// AAR-359 W6: Admin-Actions für Verifizierungs-Tab.
//
// Die 6 Actions bilden den Admin-seitigen Gegenpart zum SV-Upload-Flow:
// - saVorlageFreigeben / saVorlageZurueckweisen — Tier 1 (Dispatch-Gate)
// - tier2Freigeben / tier2DokumentNachfordern — Tier 2 (14-Tage-Frist)
// - svSperren / svEntsperren — separate Sperre (nie automatisch)
//
// Jede Status-Änderung auto-resolved die zugehörigen Tasks über
// resolveTasksForEntity('gutachter', svId, ...).

async function requireAdmin() {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false as const, error: 'Nicht angemeldet' }
  const { data: me } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  if (me?.rolle !== 'admin') {
    return { ok: false as const, error: 'Nur Admins dürfen die Verifizierung bearbeiten.' }
  }
  return { ok: true as const, userId: user.id }
}

function revalidateBoth(svId: string) {
  revalidatePath(`/admin/sachverstaendige/${svId}`)
  revalidatePath('/admin/sachverstaendige')
  revalidatePath('/admin/tasks')
  revalidatePath('/gutachter/verifizierung')
  revalidatePath('/gutachter')
}

// ─── Tier 1: SA-Vorlage ──────────────────────────────────────────────

export async function saVorlageFreigeben(svId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      sa_vorlage_status: 'geprueft',
      sa_vorlage_geprueft_am: new Date().toISOString(),
      sa_vorlage_geprueft_von_user_id: auth.userId,
      sa_vorlage_admin_notiz: null,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Freigabe fehlgeschlagen: ${error.message}` }

  // Alle offenen sv_dokument_review-Tasks auto-schließen (SA-Freigabe).
  await resolveTasksForEntity('gutachter', svId, 'SA-Vorlage durch Admin freigegeben')

  revalidateBoth(svId)
  return { success: true }
}

export async function saVorlageZurueckweisen(
  svId: string,
  notiz: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const trimmed = (notiz ?? '').trim()
  if (trimmed.length < 10) {
    return { success: false, error: 'Ablehnungsgrund muss mindestens 10 Zeichen lang sein.' }
  }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      sa_vorlage_status: 'zurueckgewiesen',
      sa_vorlage_admin_notiz: trimmed,
      sa_vorlage_geprueft_am: new Date().toISOString(),
      sa_vorlage_geprueft_von_user_id: auth.userId,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Zurückweisen fehlgeschlagen: ${error.message}` }

  // Keine Task-Resolution — der Prüfungs-Task bleibt offen bis Re-Upload kommt.
  // SV-Seite zeigt den Grund im Banner + Re-Upload-Flow über /gutachter/verifizierung.

  revalidateBoth(svId)
  return { success: true }
}

// ─── Tier 2: 14-Tage-Verifizierung ───────────────────────────────────

export async function tier2Freigeben(svId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      verifizierung_status: 'geprueft',
      verifiziert_am: new Date().toISOString(),
      verifiziert_von: auth.userId,
      verifizierung_admin_notiz: null,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Freigabe fehlgeschlagen: ${error.message}` }

  await resolveTasksForEntity('gutachter', svId, 'Tier-2-Verifizierung durch Admin freigegeben')

  revalidateBoth(svId)
  return { success: true }
}

export async function tier2DokumentNachfordern(
  svId: string,
  slotId: string,
  begruendung: string,
  fristIso: string,
): Promise<{ success: boolean; error?: string; pflichtdokId?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const trimmed = (begruendung ?? '').trim()
  if (trimmed.length < 20) {
    return { success: false, error: 'Begründung muss mindestens 20 Zeichen lang sein.' }
  }
  if (!fristIso || Number.isNaN(new Date(fristIso).getTime())) {
    return { success: false, error: 'Ungültige Frist.' }
  }

  const supabase = await createClient()
  const slot = await getKatalogSlot(supabase, slotId)
  if (!slot) return { success: false, error: `Unbekannter Dokumententyp: ${slotId}` }
  if (slot.kategorie !== 'gutachter_verifizierung') {
    return { success: false, error: `Slot "${slotId}" ist kein Verifizierungs-Dokument.` }
  }
  if (!slot.anforderbar_von.includes('admin')) {
    return { success: false, error: `Slot "${slot.label}" ist nicht admin-anforderbar.` }
  }

  const db = createAdminClient()

  // Duplikat-Check — nur ein offener Anforderungs-Row pro (svId, slotId)
  const { data: existing } = await db
    .from('pflichtdokumente')
    .select('id')
    .eq('sv_id', svId)
    .eq('dokument_typ', slotId)
    .eq('status', 'ausstehend')
    .maybeSingle()
  if (existing) {
    return { success: false, error: `"${slot.label}" ist bereits angefordert.` }
  }

  const { data: maxRow } = await db
    .from('pflichtdokumente')
    .select('sort_order')
    .eq('sv_id', svId)
    .order('sort_order', { ascending: false })
    .limit(1)
    .maybeSingle()
  const nextSort = ((maxRow?.sort_order as number | null) ?? 0) + 1

  const { data: inserted, error: insErr } = await db
    .from('pflichtdokumente')
    .insert({
      sv_id: svId,
      dokument_typ: slotId,
      status: 'ausstehend',
      pflicht: true,
      quelle: 'admin',
      angefordert_von_rolle: 'admin',
      angefordert_von_user_id: auth.userId,
      angefordert_am: new Date().toISOString(),
      begruendung: trimmed,
      frist: new Date(fristIso).toISOString(),
      sort_order: nextSort,
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { success: false, error: insErr?.message ?? 'Anforderung konnte nicht gespeichert werden.' }
  }

  // SV-Task: erscheint in /gutachter/tasks
  const { data: sv } = await db
    .from('sachverstaendige')
    .select('profile_id')
    .eq('id', svId)
    .maybeSingle()

  await createLinkedTask({
    titel: `Dokument nachreichen: ${slot.label}`,
    beschreibung: trimmed,
    prioritaet: 'normal',
    typ: 'dokument-nachreichen',
    entity_type: 'gutachter',
    entity_id: svId,
    empfaenger_rolle: 'sachverstaendiger',
    empfaenger_user_id: (sv?.profile_id as string | null) ?? null,
    faellig_am: new Date(fristIso),
    auto_erstellt: false,
    trigger_event: 'sv_verifizierung_nachforderung',
  })

  revalidateBoth(svId)
  return { success: true, pflichtdokId: inserted.id as string }
}

// ─── Sperre ──────────────────────────────────────────────────────────

export async function svSperren(
  svId: string,
  grund: string,
): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const trimmed = (grund ?? '').trim()
  if (trimmed.length < 10) {
    return { success: false, error: 'Sperr-Grund muss mindestens 10 Zeichen lang sein.' }
  }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      gesperrt_seit: new Date().toISOString(),
      gesperrt_grund: trimmed,
      gesperrt_von_user_id: auth.userId,
      ist_aktiv: false,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Sperren fehlgeschlagen: ${error.message}` }

  revalidateBoth(svId)
  return { success: true }
}

export async function svEntsperren(svId: string): Promise<{ success: boolean; error?: string }> {
  const auth = await requireAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db
    .from('sachverstaendige')
    .update({
      gesperrt_seit: null,
      gesperrt_grund: null,
      gesperrt_von_user_id: null,
      ist_aktiv: true,
    })
    .eq('id', svId)
  if (error) return { success: false, error: `Entsperren fehlgeschlagen: ${error.message}` }

  revalidateBoth(svId)
  return { success: true }
}
