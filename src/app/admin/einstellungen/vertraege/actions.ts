'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

// KFZ-148 Lückenfix: CRUD fuer vertragsvorlagen mit Versions-System.
// Pro 'typ' kann nur EINE Vorlage aktiv sein. Wenn eine aktive Vorlage geaendert
// wird, wird die alte als Archiv-Version (aktiv=false) belassen und eine neue
// Version eingefuegt — KEINE in-place Edits auf aktive Vertraege, weil die ja
// schon unterzeichnet sein koennten und Audit-Trail wichtig ist.

async function ensureAdmin(): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht angemeldet' }
  const { data: profile } = await supabase.from('profiles').select('rolle').eq('id', user.id).single()
  if (profile?.rolle !== 'admin') return { ok: false, error: 'Nur Admins' }
  return { ok: true }
}

/**
 * Neue Vertragsvorlage anlegen. Wenn typ schon eine aktive Vorlage hat, bleibt
 * die alte aktiv — der Caller muss explizit "aktivieren" rufen damit die neue
 * scharf geht.
 */
export async function createVertragsvorlage(data: {
  typ: string
  titel: string
  version: string
  inhalt_html: string
  pflicht_unterschrift: boolean
}): Promise<{ success: boolean; error?: string; id?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  if (!data.typ || !data.titel || !data.version || !data.inhalt_html) {
    return { success: false, error: 'typ, titel, version und inhalt_html sind Pflicht' }
  }

  const db = createAdminClient()
  const { data: row, error } = await db.from('vertragsvorlagen').insert({
    typ: data.typ,
    titel: data.titel,
    version: data.version,
    inhalt_html: data.inhalt_html,
    pflicht_unterschrift: data.pflicht_unterschrift,
    aktiv: false, // Neue Vorlagen starten inaktiv — explizit aktivieren noetig
  }).select('id').single()

  if (error || !row) return { success: false, error: error?.message ?? 'Insert fehlgeschlagen' }

  revalidatePath('/admin/einstellungen/vertraege')
  return { success: true, id: row.id }
}

/**
 * Eine inaktive Vorlage in-place editieren (Inhalt/Titel/Version).
 * Aktive Vorlagen koennen NICHT direkt editiert werden — stattdessen
 * createVertragsvorlage + setAktiv aufrufen.
 */
export async function updateVertragsvorlage(id: string, data: {
  titel?: string
  version?: string
  inhalt_html?: string
  pflicht_unterschrift?: boolean
}): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: existing } = await db.from('vertragsvorlagen').select('aktiv').eq('id', id).single()
  if (!existing) return { success: false, error: 'Vorlage nicht gefunden' }
  if (existing.aktiv) {
    return { success: false, error: 'Aktive Vorlage kann nicht editiert werden — neue Version anlegen und aktivieren' }
  }

  const update: Record<string, unknown> = { updated_at: new Date().toISOString() }
  if (data.titel !== undefined) update.titel = data.titel
  if (data.version !== undefined) update.version = data.version
  if (data.inhalt_html !== undefined) update.inhalt_html = data.inhalt_html
  if (data.pflicht_unterschrift !== undefined) update.pflicht_unterschrift = data.pflicht_unterschrift

  const { error } = await db.from('vertragsvorlagen').update(update).eq('id', id)
  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/einstellungen/vertraege')
  return { success: true }
}

/**
 * Vorlage aktivieren. Setzt automatisch alle anderen Vorlagen mit dem gleichen
 * typ auf inaktiv (nur eine pro typ darf aktiv sein).
 */
export async function setVertragsvorlageAktiv(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { data: target } = await db.from('vertragsvorlagen').select('id, typ').eq('id', id).single()
  if (!target) return { success: false, error: 'Vorlage nicht gefunden' }

  // Alle anderen Vorlagen vom gleichen typ deaktivieren
  await db.from('vertragsvorlagen')
    .update({ aktiv: false, updated_at: new Date().toISOString() })
    .eq('typ', target.typ)
    .neq('id', id)

  // Diese aktivieren
  const { error } = await db.from('vertragsvorlagen')
    .update({ aktiv: true, gueltig_ab: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/einstellungen/vertraege')
  return { success: true }
}

/**
 * Vorlage deaktivieren (kein Loeschen — Audit-Trail bleibt).
 */
export async function setVertragsvorlageInaktiv(id: string): Promise<{ success: boolean; error?: string }> {
  const auth = await ensureAdmin()
  if (!auth.ok) return { success: false, error: auth.error }

  const db = createAdminClient()
  const { error } = await db.from('vertragsvorlagen')
    .update({ aktiv: false, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return { success: false, error: error.message }

  revalidatePath('/admin/einstellungen/vertraege')
  return { success: true }
}
