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
// Kernregel (Aaron-Entscheid 18.08.2026 — AENDERT die urspruengliche Regel):
// Ein Entwurf, der das Gate besteht, geht DIREKT live. Nur was durchfaellt,
// landet in 'in_review' und wartet auf einen Menschen.
//
// Warum die Umkehr vertretbar ist: Das Gate ist genau die Validierung, die bei
// der B2B-Content-Pipeline schon Bedingung fuer Auto-Publish war ("Auto-Publish
// NUR nach Validierung", Aaron 02.07.). Es verwirft jeden Unfall-Hotspot ohne
// belegbare Quell-URL und verlangt >= 3 harte, extern verifizierbare Fakten —
// die urspruengliche Sorge galt UNGEPRUEFTEN Zahlen, nicht gepruefen.
//
// Was dadurch NICHT schwaecher wird: Das Gate laeuft unveraendert, `aktualisiere`
// schickt auch von Hand ergaenzte Inhalte erneut hindurch, und der Read auf der
// Marketing-Seite filtert weiterhin auf status='veroeffentlicht' ueber eine
// RLS-Policy (nicht im Code) — ein vergessener Filter kann also keine Entwuerfe
// ausliefern.
//
// Vorher: jeder Entwurf ging nach 'in_review', die Veroeffentlichung war ein
// separater Klick. Ergebnis nach vier Tagen: 0 Zeilen in stadt_lokalinhalte —
// die Pipeline war vollstaendig gebaut und lieferte nichts aus.

import { revalidatePath } from 'next/cache'
import { requireRole } from '@/lib/auth/guards'
import { createAdminClient } from '@/lib/supabase/admin'
import { pruefeLokalinhalt, type LokalinhaltEntwurf } from '@/lib/lokalinhalt/gate'
import { erzeugeFuerEineStadt } from '@/lib/lokalinhalt/pipeline'
import { getStadtKontext, getStadtStammdaten } from '@/lib/lokalinhalt/staedte'

const ADMIN_PFAD = '/admin/marketing/lokal-content'

/**
 * Archiviert die aktuell veroeffentlichte Fassung einer Stadt.
 *
 * MUSS vor jedem Schreiben einer neuen 'veroeffentlicht'-Zeile laufen: ein
 * partieller Unique-Index laesst nur EINE veroeffentlichte Zeile je Stadt zu,
 * ein Insert daneben schlaegt fehl. Frueher stand diese Logik nur in
 * `veroeffentliche`; seit der Auto-Publish-Pfad dieselbe Vorbedingung hat,
 * liegt sie hier einmal statt zweimal.
 */
async function archiviereAktuelleFassung(
  supabase: ReturnType<typeof createAdminClient>,
  stadtSlug: string,
): Promise<{ ok: boolean; error?: string }> {
  const { error } = await supabase
    .from('stadt_lokalinhalte')
    .update({ status: 'archiviert', updated_at: new Date().toISOString() })
    .eq('stadt_slug', stadtSlug)
    .eq('status', 'veroeffentlicht')
  if (error) return { ok: false, error: error.message }
  return { ok: true }
}

// ---------------------------------------------------------------------------
// generiereEntwurf — Stadt-Kontext laden, Claude fragen, Gate, als Entwurf ablegen
// ---------------------------------------------------------------------------

/**
 * `ok` heisst "der Lauf hat funktioniert", NICHT "ist live".
 *
 * Ein Entwurf, der das Gate nicht besteht, ist kein Fehler: er wurde erzeugt,
 * geprueft und gespeichert — nur eben nicht veroeffentlicht. Wer beides in `ok`
 * zusammenfasst, zeigt dem Admin eine rote Fehlermeldung fuer ein korrekt
 * arbeitendes Gate. `veroeffentlicht` trennt die beiden Aussagen; `error` bleibt
 * echten Fehlschlaegen vorbehalten (KI, DB, unbekannte Stadt).
 */
export async function generiereEntwurf(stadtSlug: string): Promise<{
  ok: boolean
  error?: string
  /** true = Gate bestanden und direkt live. false = liegt im Review. */
  veroeffentlicht?: boolean
  /** Warum es nicht automatisch live ging (nur wenn veroeffentlicht=false). */
  hinweis?: string
  verworfen?: string[]
  substanzScore?: number
}> {
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

  // Generieren, pruefen, ablegen macht `erzeugeFuerEineStadt` — dieselbe
  // Funktion, die der Cron nutzt (src/lib/lokalinhalt/pipeline.ts). Zwei
  // Implementierungen desselben Wegs waeren die Sorte Redundanz, die spaeter
  // auseinanderlaeuft: eine Gate-Aenderung wuerde dann nur an einer Stelle
  // ankommen, und welche das ist, faellt erst im Ergebnis auf.
  const treffer = await erzeugeFuerEineStadt(supabase, stadtSlug)

  if (treffer.art === 'fehler') return { ok: false, error: treffer.grund }

  revalidatePath(ADMIN_PFAD)

  if (treffer.art === 'review') {
    return {
      ok: true,
      veroeffentlicht: false,
      hinweis: treffer.grund,
      verworfen: treffer.verworfen,
      substanzScore: treffer.substanzScore,
    }
  }
  // Die Stadtseite selbst liegt im Marketing-Build (eigene Anwendung) und wird
  // von hier aus nicht revalidiert — sie holt den Inhalt bei ihrem naechsten
  // Rendern. Das ist bewusst: ein Cross-App-Revalidate gibt es nicht.
  return {
    ok: true,
    veroeffentlicht: true,
    verworfen: treffer.verworfen,
    substanzScore: treffer.substanzScore,
  }
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

  const archiv = await archiviereAktuelleFassung(supabase, zeile.stadt_slug)
  if (!archiv.ok) return { ok: false, error: archiv.error }

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
