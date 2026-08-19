'use server'

// Wissen-AI-Redaktion: Admin-Server-Actions fuer Themen- und Artikel-Verwaltung.
//
// Pattern gespiegelt aus src/app/admin/kommentare/actions.ts (kommentare existiert in
// der gleichen Branch-Basis — falls nicht: aus tasks/actions.ts + team/actions.ts).
//   - requireRole(['admin']) -> check .success (kein throw)
//   - createAdminClient() fuer alle Schreiboperationen (service-role, bypasst RLS)
//   - Ergebnis: { ok: boolean; error?: string }
//   - revalidatePath('/admin/wissen-artikel') nach jeder Mutation
//
// Kein Export von Konstanten/Types aus diesem 'use server'-File (AAR-664-Regel:
// Client-Bundle macht sie zu undefined). Typen in eigene lib-Datei auslagern.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateArtikelDraft } from '@/lib/wissen/generate'

// ---------------------------------------------------------------------------
// createThema — neues Thema manuell anlegen (sofort freigegeben)
// ---------------------------------------------------------------------------

export async function createThema(
  formData: FormData,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const titel = (formData.get('titel') as string | null)?.trim()
  if (!titel) return { ok: false, error: 'Titel ist Pflichtfeld' }

  const kurzbrief = (formData.get('kurzbrief') as string | null)?.trim() || null
  const primary_keyword = (formData.get('primary_keyword') as string | null)?.trim() || null
  const cluster = (formData.get('cluster') as string | null)?.trim() || null
  const artikel_typ = (formData.get('artikel_typ') as string | null)?.trim() || null

  const { error } = await supabase.from('wissen_themen').insert({
    titel,
    kurzbrief,
    primary_keyword,
    cluster,
    artikel_typ,
    quelle: 'manuell',
    // manuell angelegte Themen sind sofort freigegeben (kein Review-Schritt)
    status: 'freigegeben',
  })

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// approveThema — Thema freigeben (vorgeschlagen -> freigegeben)
// ---------------------------------------------------------------------------

export async function approveThema(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('wissen_themen')
    .update({
      status: 'freigegeben',
      entschieden_am: new Date().toISOString(),
      entschieden_von: guard.user.id,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// rejectThema — Thema ablehnen (vorgeschlagen -> abgelehnt)
// ---------------------------------------------------------------------------

export async function rejectThema(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('wissen_themen')
    .update({
      status: 'abgelehnt',
      entschieden_am: new Date().toISOString(),
      entschieden_von: guard.user.id,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// generateDraft — Thema laden, AI-Draft generieren, Artikel anlegen
// ---------------------------------------------------------------------------

export async function generateDraft(
  themaId: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  // Thema laden
  const { data: thema, error: themaErr } = await supabase
    .from('wissen_themen')
    .select('id, titel, kurzbrief, primary_keyword, cluster, artikel_typ')
    .eq('id', themaId)
    .maybeSingle()

  if (themaErr) return { ok: false, error: themaErr.message }
  if (!thema) return { ok: false, error: 'Thema nicht gefunden' }

  // AI-Draft generieren
  const result = await generateArtikelDraft({
    titel: thema.titel,
    kurzbrief: thema.kurzbrief ?? undefined,
    primary_keyword: thema.primary_keyword ?? undefined,
    cluster: thema.cluster ?? undefined,
    artikel_typ: thema.artikel_typ ?? undefined,
  })

  if (!result.ok) return { ok: false, error: result.error }

  const draft = result.data

  // Artikel einfuegen — bei Slug-Kollision (23505) einmal mit '-2' Suffix retry
  async function insertArtikel(slug: string): Promise<{ error: { code: string; message: string } | null }> {
    return supabase.from('wissen_artikel').insert({
      thema_id: themaId,
      slug,
      title: draft.title,
      body: draft.body,
      excerpt: draft.excerpt,
      key_facts: draft.keyFacts,
      meta_description: draft.metaDescription,
      primary_keyword: draft.primaryKeyword,
      cluster: draft.cluster,
      ai_model: draft.ai_model,
      status: 'in_review',
    })
  }

  let insertResult = await insertArtikel(draft.slug)

  if (insertResult.error?.code === '23505') {
    // Slug-Kollision: einmal mit '-2' Suffix retry
    insertResult = await insertArtikel(`${draft.slug}-2`)
  }

  if (insertResult.error) return { ok: false, error: insertResult.error.message }

  // Thema-Status auf 'entwurf_erstellt' setzen
  const { error: themaUpdateErr } = await supabase
    .from('wissen_themen')
    .update({ status: 'entwurf_erstellt' })
    .eq('id', themaId)

  if (themaUpdateErr) {
    // Non-critical: Artikel ist angelegt, aber Thema-Status nicht aktualisiert.
    // Loggen, aber kein Fehler zurueckgeben damit der Draft nicht verloren geht.
    console.error('[generateDraft] Thema-Status-Update fehlgeschlagen:', themaUpdateErr.message)
  }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// updateArtikel — editierbare Felder aktualisieren
// ---------------------------------------------------------------------------

export async function updateArtikel(
  id: string,
  fields: {
    title?: string
    body?: string
    excerpt?: string
    key_facts?: string[]
    meta_description?: string
    /** Kurzer SERP-Titel; leer = `title` wird genommen (der zugleich die H1 ist). */
    meta_title?: string
    slug?: string
    primary_keyword?: string
    cluster?: string
  },
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('wissen_artikel')
    .update({
      ...fields,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// publishArtikel — Artikel veroeffentlichen (in_review -> veroeffentlicht)
// ---------------------------------------------------------------------------

export async function publishArtikel(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()
  const now = new Date().toISOString()
  const today = now.slice(0, 10) // YYYY-MM-DD

  const { error } = await supabase
    .from('wissen_artikel')
    .update({
      status: 'veroeffentlicht',
      veroeffentlicht_am: now,
      reviewed_am: now,
      reviewed_von: guard.user.id,
      last_modified: today,
      updated_at: now,
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// rejectArtikel — Artikel ablehnen (in_review -> abgelehnt)
// ---------------------------------------------------------------------------

export async function rejectArtikel(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('wissen_artikel')
    .update({
      status: 'abgelehnt',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// zuruckziehenArtikel — veroeffentlichten Crawl-Artikel zurueckziehen (veroeffentlicht -> archiviert)
// ---------------------------------------------------------------------------

export async function zuruckziehenArtikel(
  id: string,
): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const { error } = await supabase
    .from('wissen_artikel')
    .update({
      status: 'archiviert',
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/wissen-artikel')
  return { ok: true }
}
