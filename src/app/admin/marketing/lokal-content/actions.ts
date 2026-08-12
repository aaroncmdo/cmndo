'use server'

// Hyperlokale Ortsinhalte: Admin-Server-Actions.
//
// Pattern 1:1 aus src/app/admin/wissen-artikel/actions.ts:
//   - requireRole(['admin']) -> .success pruefen (wirft NICHT)
//   - createAdminClient() (service-role) fuer alle Zugriffe; die Tabelle hat
//     RLS an und KEINE Policies, kommt also nur ueber service-role rein
//   - Ergebnis { ok: boolean; error?: string }
//   - revalidatePath nach jeder Mutation
//
// Kein Export von Konstanten/Types aus diesem 'use server'-File (AAR-664).
//
// Kernregel: Ein generierter Entwurf geht IMMER nach 'in_review', nie direkt
// live. Die Veroeffentlichung ist ein separater, menschlicher Klick.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { generateLokalinhaltDraft } from '@/lib/lokalinhalt/generate'
import { pruefeLokalinhalt, type LokalinhaltEntwurf } from '@/lib/lokalinhalt/gate'
import { getStadtKontext, getStadtStammdaten } from '@/lib/lokalinhalt/staedte'

const ADMIN_PFAD = '/admin/marketing/lokal-content'

// ---------------------------------------------------------------------------
// generiereEntwurf — Stadt-Kontext laden, Claude fragen, Gate, als Entwurf ablegen
// ---------------------------------------------------------------------------

export async function generiereEntwurf(
  stadtSlug: string,
): Promise<{ ok: boolean; error?: string; verworfen?: string[]; substanzScore?: number }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const stadt = getStadtStammdaten(stadtSlug)
  const kontext = getStadtKontext(stadtSlug)
  if (!stadt || !kontext) return { ok: false, error: `Unbekannte Stadt: ${stadtSlug}` }

  const supabase = createAdminClient()

  // Kein zweiter Entwurf, solange einer offen ist — sonst sammeln sich
  // Karteileichen, und der Reviewer weiss nicht, welcher gilt.
  const { data: offen, error: offenErr } = await supabase
    .from('stadt_lokalinhalte')
    .select('id')
    .eq('stadt_slug', stadtSlug)
    .in('status', ['entwurf', 'in_review'])
    .maybeSingle()
  if (offenErr) return { ok: false, error: offenErr.message }
  if (offen) {
    return { ok: false, error: 'Es liegt bereits ein offener Entwurf für diese Stadt vor.' }
  }

  const erzeugt = await generateLokalinhaltDraft(kontext)
  if (!erzeugt.ok) return { ok: false, error: erzeugt.error }

  // Das Gate ist die EINE Pruefstelle: es wirft Hotspots ohne belastbare
  // Quell-URL raus und meldet, was fehlt.
  const befund = pruefeLokalinhalt(erzeugt.data, stadt.name)

  if (!befund.ok) {
    return {
      ok: false,
      error: `Entwurf nicht verwertbar: ${befund.gruende.join(' · ')}`,
      verworfen: befund.verworfen,
      substanzScore: befund.substanzScore,
    }
  }

  const { error: insertErr } = await supabase.from('stadt_lokalinhalte').insert({
    stadt_slug: stadtSlug,
    status: 'in_review',
    stadtbezirke: befund.bereinigt.stadtbezirke,
    hauptachsen: befund.bereinigt.hauptachsen,
    unfall_hotspots: befund.bereinigt.unfallHotspots,
    lokale_faqs: befund.bereinigt.lokaleFaqs,
    hero_anker: befund.bereinigt.heroAnker ?? null,
    topografie_anker: befund.bereinigt.topografieAnker ?? null,
    substanz_score: befund.substanzScore,
    ai_generated: true,
    ai_model: erzeugt.data.ai_model,
  })
  if (insertErr) return { ok: false, error: insertErr.message }

  revalidatePath(ADMIN_PFAD)
  return { ok: true, verworfen: befund.verworfen, substanzScore: befund.substanzScore }
}

// ---------------------------------------------------------------------------
// veroeffentliche — der eine menschliche Klick, der Inhalt live schaltet
// ---------------------------------------------------------------------------

export async function veroeffentliche(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()

  const { data: zeile, error: ladeErr } = await supabase
    .from('stadt_lokalinhalte')
    .select('id, stadt_slug, status')
    .eq('id', id)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message }
  if (!zeile) return { ok: false, error: 'Eintrag nicht gefunden' }
  if (zeile.status === 'veroeffentlicht') return { ok: true }

  // Die alte Fassung archivieren, bevor die neue live geht: der partielle
  // Unique-Index laesst nur EINE veroeffentlichte Zeile je Stadt zu.
  const { error: archivErr } = await supabase
    .from('stadt_lokalinhalte')
    .update({ status: 'archiviert', updated_at: new Date().toISOString() })
    .eq('stadt_slug', zeile.stadt_slug)
    .eq('status', 'veroeffentlicht')
  if (archivErr) return { ok: false, error: archivErr.message }

  const jetzt = new Date().toISOString()
  const { error: pubErr } = await supabase
    .from('stadt_lokalinhalte')
    .update({
      status: 'veroeffentlicht',
      veroeffentlicht_am: jetzt,
      reviewed_von: guard.user.id,
      reviewed_am: jetzt,
      updated_at: jetzt,
    })
    .eq('id', id)
  if (pubErr) return { ok: false, error: pubErr.message }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

// ---------------------------------------------------------------------------
// verwirf / aktualisiere
// ---------------------------------------------------------------------------

export async function verwirf(id: string): Promise<{ ok: boolean; error?: string }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const jetzt = new Date().toISOString()
  const supabase = createAdminClient()
  const { error } = await supabase
    .from('stadt_lokalinhalte')
    .update({
      status: 'abgelehnt',
      reviewed_von: guard.user.id,
      reviewed_am: jetzt,
      updated_at: jetzt,
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(ADMIN_PFAD)
  return { ok: true }
}

/**
 * Redaktionelle Korrektur vor der Freigabe. Der Reviewer darf alles anfassen —
 * die Hotspots laufen aber erneut durchs Gate, damit eine per Hand ergaenzte
 * Fundstelle ohne Quelle nicht doch noch durchrutscht.
 */
export async function aktualisiere(
  id: string,
  felder: Partial<LokalinhaltEntwurf>,
): Promise<{ ok: boolean; error?: string; verworfen?: string[] }> {
  const guard = await requireRole(['admin'])
  if (!guard.success) return { ok: false, error: guard.error }

  const supabase = createAdminClient()
  const { data: zeile, error: ladeErr } = await supabase
    .from('stadt_lokalinhalte')
    .select('id, stadt_slug')
    .eq('id', id)
    .maybeSingle()
  if (ladeErr) return { ok: false, error: ladeErr.message }
  if (!zeile) return { ok: false, error: 'Eintrag nicht gefunden' }

  const stadt = getStadtStammdaten(zeile.stadt_slug)
  if (!stadt) return { ok: false, error: `Unbekannte Stadt: ${zeile.stadt_slug}` }

  const befund = pruefeLokalinhalt(felder, stadt.name)
  if (!befund.ok) {
    return { ok: false, error: befund.gruende.join(' · '), verworfen: befund.verworfen }
  }

  const { error } = await supabase
    .from('stadt_lokalinhalte')
    .update({
      stadtbezirke: befund.bereinigt.stadtbezirke,
      hauptachsen: befund.bereinigt.hauptachsen,
      unfall_hotspots: befund.bereinigt.unfallHotspots,
      lokale_faqs: befund.bereinigt.lokaleFaqs,
      hero_anker: befund.bereinigt.heroAnker ?? null,
      topografie_anker: befund.bereinigt.topografieAnker ?? null,
      substanz_score: befund.substanzScore,
      ai_generated: false,
      updated_at: new Date().toISOString(),
    })
    .eq('id', id)
  if (error) return { ok: false, error: error.message }

  revalidatePath(ADMIN_PFAD)
  return { ok: true, verworfen: befund.verworfen }
}
