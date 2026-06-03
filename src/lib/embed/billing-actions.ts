'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'

/**
 * AAR-939 Stream 8 — Billing-Storno + Review (Schnittstelle B des Contracts
 * docs/30.05.2026/AAR-939-billing-lifecycle-contract.md).
 *
 * AUTO-FÄLLIG-Modell: der Cron bucht 70 EUR automatisch nach Terminzeit. Diese
 * Datei liefert die zwei manuellen Gegenstuecke:
 *   • markBillingReviewPending — SV (oder Team) meldet einen KUNDEN-Grund
 *     („Kunde war nicht da/abgesagt"). Setzt billing_review_status='pending' →
 *     der Cron ueberspringt die Anfrage (View-Filter) → Admin entscheidet.
 *     Anti-Gaming: der SV kann damit NICHT selbst voiden, nur zur Pruefung melden.
 *   • stornoEmbedBilling — ADMIN-only Void (der einzige Void-Weg, Aaron #3).
 *
 * Monika-gfa-Zeilen sind RLS-seitig service-only (anon auf source IS NULL gescoped).
 * Beide Aktionen pruefen zuerst die Rolle/Ownership (createClient/auth) und
 * schreiben dann via createAdminClient — gleiches Muster wie markSvNoShowEmbedB.
 * Spalten (billing_review_*, abrechnung_storno_*) sind noch nicht in database.types
 * (Regen = B6) → lokaler any-Cast auf den Writer.
 *
 * 'use server'-Regel (AGENTS.md §use-server-Konstanten): es werden NUR async
 * Server-Actions exportiert. GfaBillingRow + resolveAnfrageSvId sind modul-lokal.
 */

type GfaBillingRow = {
  id: string
  source: string | null
  variante: string | null
  abrechnung_id: string | null
  abrechnung_storniert_am: string | null
  abrechnung_sv_id: string | null
  embed_site_id: string | null
}

/** Loest den (eingefrorenen oder aktuellen) abrechnungs-SV einer Anfrage auf. */
async function resolveAnfrageSvId(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: any,
  gfa: GfaBillingRow,
): Promise<string | null> {
  if (gfa.abrechnung_sv_id) return gfa.abrechnung_sv_id
  if (!gfa.embed_site_id) return null
  const { data: site } = await db
    .from('embed_sites')
    .select('sv_id')
    .eq('id', gfa.embed_site_id)
    .maybeSingle()
  return (site?.sv_id as string | null) ?? null
}

// ─── markBillingReviewPending (Schnittstelle B, Pay-Unterdrueckung) ───────────
//
// Aufgerufen von der Lifecycle-Seite (af25a50f) bzw. dem SV-„Kunde war nicht da"-
// Flow. Setzt die Anfrage auf Review-pending → Cron-View schliesst sie aus →
// kein Auto-Charge bis Admin entscheidet. Erlaubt fuer das Team (admin/dispatch)
// ODER den SV, dem die Anfrage zugeordnet ist (er meldet den Kunden-Grund selbst).
export async function markBillingReviewPending(
  anfrageId: string,
  grund: 'kunde_absage' | 'kunde_no_show' = 'kunde_absage',
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const rolle = (profile?.rolle as string | null) ?? null
  const isTeam = rolle === 'admin' || rolle === 'dispatch'

  const db = createAdminClient()
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, source, variante, abrechnung_id, abrechnung_storniert_am, abrechnung_sv_id, embed_site_id')
    .eq('id', anfrageId)
    .maybeSingle()
  if (!gfa) return { ok: false, error: 'Anfrage nicht gefunden' }
  const row = gfa as GfaBillingRow
  if (row.source !== 'sv_embed' || row.variante !== 'B') {
    return { ok: false, error: 'Keine abrechenbare Monika-B-Anfrage' }
  }

  // Ownership: Team immer; SV nur fuer eigene Anfrage.
  if (!isTeam) {
    if (rolle !== 'sachverstaendiger') return { ok: false, error: 'Zugriff verweigert' }
    const svId = await resolveAnfrageSvId(db, row)
    let ownProfileId: string | null = null
    if (svId) {
      const { data: sv } = await db
        .from('sachverstaendige')
        .select('profile_id')
        .eq('id', svId)
        .maybeSingle()
      ownProfileId = (sv?.profile_id as string | null) ?? null
    }
    if (!ownProfileId || ownProfileId !== user.id) {
      return { ok: false, error: 'Zugriff verweigert' }
    }
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = db.from('gutachter_finder_anfragen') as any
  const { error } = await writer
    .update({
      billing_review_status: 'pending',
      billing_review_grund: grund,
      billing_review_erstellt_am: new Date().toISOString(),
    })
    .eq('id', anfrageId)
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/embed-billing')
  return { ok: true }
}

// ─── markBillingReviewClosed (Admin schliesst Review OHNE Void) ────────────────
//
// Admin prueft eine pending-Meldung und entscheidet, dass die 70 EUR DOCH faellig
// sind (z.B. SV-Grund statt Kunden-Grund). Setzt review_status='closed' → die
// Anfrage faellt im naechsten Cron-Lauf wieder in die Faellig-View. Admin-only.
export async function markBillingReviewClosed(
  anfrageId: string,
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: auth.error }

  const db = createAdminClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = db.from('gutachter_finder_anfragen') as any
  const { error } = await writer
    .update({ billing_review_status: 'closed' })
    .eq('id', anfrageId)
    .eq('source', 'sv_embed')
    .eq('variante', 'B')
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/embed-billing')
  return { ok: true }
}

// ─── stornoEmbedBilling (Admin-only Void — einziger Void-Weg) ──────────────────
//
// Admin voidet die 70-EUR-Position einer Anfrage (Aaron #3: nur Admin, nie SV/Kunde).
// Setzt die gfa-Storno-Felder → die Anfrage faellt dauerhaft aus der Faellig-View.
// Falls bereits abgerechnet: wenn die zugehoerige abrechnungen-Rechnung NUR diese
// eine Position enthaelt UND noch nicht bezahlt ist → ganze Rechnung stornieren;
// bei mehreren Positionen / bereits bezahlt → gfa-Storno gesetzt + Warnung, dass
// die Rechnung manuell korrigiert werden muss (keine stille Teil-Gutschrift).
export async function stornoEmbedBilling(
  anfrageId: string,
  grund: string,
): Promise<{ ok: boolean; error?: string; warnung?: string }> {
  const auth = await requireRole(['admin'])
  if (!auth.success) return { ok: false, error: auth.error }
  if (!grund?.trim()) return { ok: false, error: 'Storno-Grund erforderlich' }

  const db = createAdminClient()
  const { data: gfa } = await db
    .from('gutachter_finder_anfragen')
    .select('id, source, variante, abrechnung_id, abrechnung_storniert_am, abrechnung_sv_id, embed_site_id')
    .eq('id', anfrageId)
    .maybeSingle()
  if (!gfa) return { ok: false, error: 'Anfrage nicht gefunden' }
  const row = gfa as GfaBillingRow
  if (row.source !== 'sv_embed' || row.variante !== 'B') {
    return { ok: false, error: 'Keine abrechenbare Monika-B-Anfrage' }
  }
  if (row.abrechnung_storniert_am) return { ok: true } // idempotent

  // 1) gfa-Storno-Felder setzen (schliesst sie dauerhaft aus der Faellig-View aus).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const writer = db.from('gutachter_finder_anfragen') as any
  const { error } = await writer
    .update({
      abrechnung_storniert_am: new Date().toISOString(),
      abrechnung_storno_grund: grund.trim(),
      abrechnung_storno_durch_user_id: auth.user?.id ?? null,
    })
    .eq('id', anfrageId)
  if (error) return { ok: false, error: error.message }

  let warnung: string | undefined

  // 2) Bereits abgerechnet → Rechnung behandeln.
  if (row.abrechnung_id) {
    const { count: positionsCount } = await db
      .from('embed_abrechnung_positionen')
      .select('id', { count: 'exact', head: true })
      .eq('abrechnung_id', row.abrechnung_id)
    const { data: abr } = await db
      .from('abrechnungen')
      .select('id, status')
      .eq('id', row.abrechnung_id)
      .maybeSingle()

    const istBezahlt = (abr?.status as string | null) === 'bezahlt'
    if ((positionsCount ?? 0) <= 1 && !istBezahlt) {
      // Einzelposten-Rechnung → komplett stornieren.
      const { error: abrErr } = await db
        .from('abrechnungen')
        .update({
          status: 'storniert',
          storniert_am: new Date().toISOString(),
          storno_grund: `Monika-Embed-Storno: ${grund.trim()}`,
        })
        .eq('id', row.abrechnung_id)
      if (abrErr) warnung = `gfa storniert, aber Rechnung ${row.abrechnung_id} nicht: ${abrErr.message}`
    } else {
      warnung = istBezahlt
        ? `Rechnung ${row.abrechnung_id} ist bereits bezahlt — Gutschrift manuell erstellen.`
        : `Rechnung ${row.abrechnung_id} enthaelt weitere Positionen — Position manuell korrigieren.`
    }
  }

  revalidatePath('/admin/embed-billing')
  revalidatePath('/admin/finance')
  return { ok: true, warnung }
}
