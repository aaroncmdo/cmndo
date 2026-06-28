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

    // Kunden-Account je nach Ziel: Lead -> kunde_id, Claim -> geschaedigter_user_id.
    let kundeUserId: string | null = null
    if (input.target === 'lead') {
      const { data: lead } = await supabase
        .from('leads')
        .select('kunde_id')
        .eq('id', input.id)
        .maybeSingle()
      kundeUserId = (lead as { kunde_id: string | null } | null)?.kunde_id ?? null
    } else {
      const { data: claim } = await supabase
        .from('claims')
        .select('geschaedigter_user_id')
        .eq('id', input.id)
        .maybeSingle()
      kundeUserId = (claim as { geschaedigter_user_id: string | null } | null)?.geschaedigter_user_id ?? null
    }

    // Kunde nur benachrichtigen, wenn ein Account existiert (vor der Konversion
    // hat ein frischer Lead oft noch keinen kunde_id). In-App-Mitteilung im
    // Kunde-Portal; der Kanal-Versand (WhatsApp/Email) folgt separat.
    if (kundeUserId && w?.name) {
      const adresse = [w.adresse_strasse, [w.adresse_plz, w.adresse_ort].filter(Boolean).join(' ')]
        .filter(Boolean)
        .join(', ')
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
    // TODO Kanal-Versand: WhatsApp/Email an den Kunden ("Deine Werkstatt: …")
    // ueber sendCommunication/sendNachricht, sobald ein Template existiert.
    //
    // TODO Werkstatt-Notify ("Neuer Reparaturauftrag"): createMitteilung
    // unterstuetzt empfaenger_rolle 'werkstatt' (noch) NICHT (EmpfaengerRolle in
    // src/lib/mitteilungen/types.ts). Sobald die Rolle dort + im Werkstatt-Portal
    // eine Inbox hat, hier die Werkstatt (werkstaetten.user_id) benachrichtigen.
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
