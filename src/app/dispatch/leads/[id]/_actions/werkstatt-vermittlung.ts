'use server'

// AAR Werkstatt-Vermittlung (Phase 1, Task 4): Ein Dispatcher/Admin weist
// einem Lead ODER einem Claim eine Reparatur-Werkstatt zu. Die Zuweisung
// landet in den vier reparatur_werkstatt_*-Spalten (leads bzw. claims) mit
// quelle='dispatcher'. Beim Lead -> Claim-Uebergang propagiert
// convert-lead-to-claim.ts die Felder weiter (Task 6).
//
// Write-Path-Haertung: Mutation NUR fuer dispatch/admin (requireRole). Eine
// ungeschuetzte Werkstatt-Zuweisung waere ein Manipulationsvektor (fremde
// Reparauftraege umlenken).
//
// Hinweis Type-Lag: Die generierten DB-Types (database.types.ts) kennen die
// reparatur_werkstatt_*-Spalten noch nicht. Daher das Update-Objekt als
// Record-Cast (AGENTS.md §Supabase-Plugin Schritt 6 — Types duerfen der DB
// hinterherhinken).

import { requireRole } from '@/lib/auth/guards'
import { revalidatePath } from 'next/cache'
import { buildZuweisungPatch } from './werkstatt-vermittlung-patch'
import { findWerkstaetten } from '@/lib/werkstatt/finder'
import type { WerkstattFinderRow } from '@/lib/werkstatt/finder'

export type VermittleWerkstattInput = {
  target: 'lead' | 'claim'
  id: string
  werkstattId: string
}

export async function vermittleWerkstatt(
  input: VermittleWerkstattInput,
): Promise<{ ok: boolean; error?: string }> {
  // Write-Path-Haertung: nur dispatch/admin duerfen vermitteln.
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }
  const { supabase, user } = guard

  const table = input.target === 'lead' ? 'leads' : 'claims'
  const patch = buildZuweisungPatch(input.werkstattId, user.id)

  // `as never` wie an anderen Type-Lag-Stellen (z.B. gutachter/team/actions.ts):
  // die generierten Update-Types kennen die reparatur_werkstatt_*-Spalten noch
  // nicht, und der dynamische Tabellenname macht den Union-Typ unsound.
  const { error } = await supabase
    .from(table)
    .update(patch as never)
    .eq('id', input.id)
  if (error) return { ok: false, error: error.message }

  // ─── Non-critical: Benachrichtigungen ──────────────────────────────────────
  // Ein Send-Fehler darf die Zuweisung NICHT zuruecknehmen (Status-Update bleibt
  // atomar). Daher in try/catch gekapselt.
  try {
    // Werkstatt-Stammdaten fuer die Kunden-Nachricht laden.
    const { data: werkstatt } = await supabase
      .from('werkstaetten')
      .select('name, adresse_strasse, adresse_plz, adresse_ort, telefon')
      .eq('id', input.werkstattId)
      .maybeSingle()
    const w = (werkstatt ?? null) as {
      name: string | null
      adresse_strasse: string | null
      adresse_plz: string | null
      adresse_ort: string | null
      telefon: string | null
    } | null

    // Kunden-Account (fuer In-App) + Kontakt (fuer WhatsApp/Email).
    // Lead: kunde_id + Kontakt DIREKT aus dem Lead — ein frischer Lead hat oft KEINEN
    // Account, ist dann nur ueber lead.telefon/email erreichbar. Claim:
    // geschaedigter_user_id + Kontakt aus dem Profil des Geschaedigten.
    let kundeUserId: string | null = null
    let kundeKontakt: { vorname: string | null; telefon: string | null; email: string | null } = {
      vorname: null,
      telefon: null,
      email: null,
    }
    if (input.target === 'lead') {
      const { data: lead } = await supabase
        .from('leads')
        .select('kunde_id, vorname, telefon, email')
        .eq('id', input.id)
        .maybeSingle()
      const l = (lead ?? null) as {
        kunde_id: string | null
        vorname: string | null
        telefon: string | null
        email: string | null
      } | null
      kundeUserId = l?.kunde_id ?? null
      kundeKontakt = { vorname: l?.vorname ?? null, telefon: l?.telefon ?? null, email: l?.email ?? null }
    } else {
      const { data: claim } = await supabase
        .from('claims')
        .select('geschaedigter_user_id')
        .eq('id', input.id)
        .maybeSingle()
      kundeUserId = (claim as { geschaedigter_user_id: string | null } | null)?.geschaedigter_user_id ?? null
      if (kundeUserId) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('vorname, telefon, email')
          .eq('id', kundeUserId)
          .maybeSingle()
        const p = (profile ?? null) as {
          vorname: string | null
          telefon: string | null
          email: string | null
        } | null
        kundeKontakt = { vorname: p?.vorname ?? null, telefon: p?.telefon ?? null, email: p?.email ?? null }
      }
    }

    const adresse = w
      ? [w.adresse_strasse, [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')]
          .filter(Boolean)
          .join(', ')
      : ''

    // (a) In-App-Mitteilung — nur wenn ein Account existiert (vor der Konversion
    // hat ein frischer Lead oft noch keinen kunde_id; dann greift nur (b)).
    if (kundeUserId && w?.name) {
      const inhalt = [
        `Deine Werkstatt: ${w.name}`,
        adresse ? `Adresse: ${adresse}` : null,
        w.telefon ? `Telefon: ${w.telefon}` : null,
      ]
        .filter(Boolean)
        .join('\n')
      const { createMitteilung } = await import('@/lib/mitteilungen/create-mitteilung')
      await createMitteilung({
        empfaenger_id: kundeUserId,
        empfaenger_rolle: 'kunde',
        kategorie: 'update',
        titel: 'Deine Reparatur-Werkstatt steht fest',
        inhalt,
        kontext_typ: input.target === 'lead' ? 'lead' : 'fall',
        kontext_id: input.id,
      })
    }

    // (b) Kanal-Versand WhatsApp + Email an den Kunden — der EINZIGE Kanal fuer
    // Leads ohne Portal-Account. Jeder Kanal ist im Helper non-critical gekapselt.
    if (w?.name && (kundeKontakt.telefon || kundeKontakt.email)) {
      const { notifyKundeWerkstattVermittlung } = await import('@/lib/werkstatt/notify-kunde-vermittlung')
      await notifyKundeWerkstattVermittlung({
        kunde: kundeKontakt,
        werkstatt: { name: w.name, adresse, telefon: w.telefon },
        fallId: input.target === 'claim' ? input.id : null,
      })
    }

    // TODO Werkstatt-Notify ("Neuer Reparaturauftrag"): sobald cfefdf75s #3263
    // (EmpfaengerRolle 'werkstatt' in src/lib/mitteilungen/types.ts + Werkstatt-
    // Portal-Inbox) in staging ist, hier die Werkstatt (werkstaetten.user_id) via
    // createMitteilung benachrichtigen — analog notify-freigabe.ts.
  } catch (err) {
    console.warn('[vermittleWerkstatt] Benachrichtigung fehlgeschlagen (non-fatal):', err)
  }

  if (input.target === 'lead') {
    revalidatePath(`/dispatch/leads/${input.id}`)
    revalidatePath('/dispatch/leads')
  } else {
    // Geteilte Fallakte (admin/dispatch/kb/kanzlei) — vgl. autoRouteUrl.
    revalidatePath(`/faelle/${input.id}`)
  }
  return { ok: true }
}

// ─────────────────────────────────────────────────────────────────────────────
// Phase 1, Task 5a: nahe Partner-Werkstaetten zu einem Lead/Claim laden.
// Standort-Anker (Design §Claim-Standort): Lead -> besichtigungsort_lat/lng,
// sonst unfallort_lat/lng, sonst kunde_plz/halter_plz (identisch zur Dispatch-
// Karte, src/lib/dispatch/karte/triage-leads.ts). Claim -> schadenort_lat/lng,
// sonst schadenort_plz. findWerkstaetten rankt nach Distanz (Haversine) bzw.
// faellt bei nur-PLZ auf Name-Sortierung zurueck.

export type GetWerkstaettenNahInput = {
  target: 'lead' | 'claim'
  id: string
}

export async function getWerkstaettenNah(
  input: GetWerkstaettenNahInput,
): Promise<
  | { ok: true; werkstaetten: WerkstattFinderRow[] }
  | { ok: false; error: string }
> {
  // Read-Path-Haertung: gleiche Rollen wie die Mutation (dispatch/admin).
  const guard = await requireRole(['dispatch', 'admin'])
  if (!guard.success) return { ok: false, error: guard.error }
  const { supabase } = guard

  let lat: number | undefined
  let lng: number | undefined
  let plz: string | undefined

  if (input.target === 'lead') {
    const { data: lead } = await supabase
      .from('leads')
      .select(
        'besichtigungsort_lat, besichtigungsort_lng, unfallort_lat, unfallort_lng, kunde_plz, halter_plz',
      )
      .eq('id', input.id)
      .maybeSingle()
    const l = (lead ?? null) as {
      besichtigungsort_lat: number | null
      besichtigungsort_lng: number | null
      unfallort_lat: number | null
      unfallort_lng: number | null
      kunde_plz: string | null
      halter_plz: string | null
    } | null
    if (l) {
      if (l.besichtigungsort_lat != null && l.besichtigungsort_lng != null) {
        lat = l.besichtigungsort_lat
        lng = l.besichtigungsort_lng
      } else if (l.unfallort_lat != null && l.unfallort_lng != null) {
        lat = l.unfallort_lat
        lng = l.unfallort_lng
      }
      plz = l.kunde_plz ?? l.halter_plz ?? undefined
    }
  } else {
    const { data: claim } = await supabase
      .from('claims')
      .select('schadenort_lat, schadenort_lng, schadenort_plz')
      .eq('id', input.id)
      .maybeSingle()
    const c = (claim ?? null) as {
      schadenort_lat: number | null
      schadenort_lng: number | null
      schadenort_plz: string | null
    } | null
    if (c) {
      if (c.schadenort_lat != null && c.schadenort_lng != null) {
        lat = c.schadenort_lat
        lng = c.schadenort_lng
      }
      plz = c.schadenort_plz ?? undefined
    }
  }

  const werkstaetten = await findWerkstaetten({ lat, lng, plz, limit: 12 })
  return { ok: true, werkstaetten }
}
