'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'

export type RueckrufInput = {
  name: string
  telefon: string
  email?: string | null
  zeitfenster?: string | null  // Freitext z.B. "vormittags" oder ISO-Zeit
  startZeit?: string | null    // ISO-Timestamp wenn Modal eine konkrete Zeit liefert
  nachricht?: string | null
  quelle: string
}

// Rückruf-Anfrage von einer öffentlichen Marketing-Seite.
// Legt drei Sachen an damit Dispatcher den Rückruf vollständig sieht:
//   1. leads-Zeile (qualifizierungs_phase='rueckruf')
//   2. admin_termine (typ='rueckruf', status='offen', lead_id) — erscheint
//      auf /dispatch/rueckrufe + im Admin-Kalender
//   3. mitteilungen für jeden Dispatch-User — Inbox-Notification mit Bell + Link
export async function erstelleOeffentlichenRueckruf(
  input: RueckrufInput,
): Promise<{ ok: true; leadId: string; terminId: string } | { ok: false; error: string }> {
  const name = input.name.trim()
  const telefon = input.telefon.trim()
  if (!name || name.length < 2) return { ok: false, error: 'Name fehlt' }
  if (!telefon || telefon.length < 5) return { ok: false, error: 'Telefon fehlt' }

  const admin = createAdminClient()

  // 1. Dispatch-User ermitteln (für erstellt_von + Mitteilungs-Empfänger)
  const { data: dispatchUser } = await admin
    .from('profiles')
    .select('id')
    .eq('rolle', 'dispatch')
  if (!dispatchUser || dispatchUser.length === 0) {
    return { ok: false, error: 'Aktuell ist kein Dispatch-Mitarbeiter erreichbar.' }
  }
  const erstellerId = dispatchUser[0].id

  // Name split: "Max Mustermann" → vorname="Max", nachname="Mustermann"
  const parts = name.split(/\s+/)
  const vorname = parts.shift() ?? name
  const nachname = parts.join(' ') || null

  // 2. Lead anlegen.
  // Writer-Konsistenz (leads-Audit 15.05.2026): das Basis-Feld-Set, das ein
  // Lead aus JEDEM Eintrittspunkt mitbringen muss — sonst entstehen NULL-Leads
  // (kein source_channel/status/zugewiesen_an), die der Dispatcher in
  // /dispatch/leads unvollständig sieht. Referenz: dispatch-fall-actions.ts.
  //   - status='rueckruf'        konsistent zu qualifizierungs_phase
  //   - source_channel           Marketing-Quelle (Fallback 'rueckruf')
  //   - zugewiesen_an            der Dispatch-User der den Rückruf bekommt
  const { data: lead, error: leadErr } = await admin.from('leads').insert({
    vorname,
    nachname,
    telefon,
    email: input.email?.trim() || null,
    status: 'rueckruf',
    source_channel: input.quelle?.trim() || 'rueckruf',
    qualifizierungs_phase: 'rueckruf',
    zugewiesen_an: erstellerId,
  }).select('id').single()
  if (leadErr || !lead) {
    return { ok: false, error: `Lead-Anlage fehlgeschlagen: ${leadErr?.message ?? 'unbekannt'}` }
  }

  // 3. admin_termine-Zeile — typ='rueckruf', status='offen'
  // start_zeit: konkreter Zeitpunkt aus Modal, sonst now() + 5min als Hint für ASAP
  const startZeit = input.startZeit ?? new Date(Date.now() + 5 * 60_000).toISOString()
  const endZeit = new Date(new Date(startZeit).getTime() + 30 * 60_000).toISOString()
  const beschreibung = [
    input.zeitfenster ? `Wunschzeit: ${input.zeitfenster}` : null,
    input.nachricht ? `Nachricht: ${input.nachricht}` : null,
    `Quelle: ${input.quelle}`,
  ].filter(Boolean).join('\n')

  const { data: termin, error: terminErr } = await admin.from('admin_termine').insert({
    typ: 'rueckruf',
    titel: `Rückruf: ${name}`,
    beschreibung,
    start_zeit: startZeit,
    end_zeit: endZeit,
    status: 'offen',
    lead_id: lead.id,
    erstellt_von: erstellerId,
    erinnerung_min_vorher: 10,
  }).select('id').single()
  if (terminErr || !termin) {
    // Lead bleibt — Dispatcher findet ihn trotzdem via /dispatch/leads
    return { ok: false, error: `Termin-Anlage fehlgeschlagen: ${terminErr?.message ?? 'unbekannt'}` }
  }

  // 4. Mitteilungen für alle Dispatch-User
  const inhalt = [
    `Tel: ${telefon}`,
    input.zeitfenster ? `Zeit: ${input.zeitfenster}` : null,
    input.nachricht ? `Nachricht: ${input.nachricht}` : null,
    `Quelle: ${input.quelle}`,
  ].filter(Boolean).join(' · ')

  const mitteilungen = (dispatchUser ?? []).map((u: { id: string }) => ({
    empfaenger_id: u.id,
    empfaenger_rolle: 'dispatch' as const,
    kategorie: 'anruf' as const,
    titel: `Rückrufwunsch: ${name}`,
    inhalt,
    prioritaet: 'hoch' as const,
    icon: '📞',
    route_url: `/dispatch/rueckrufe?open=${termin.id}`,
  }))
  await admin.from('mitteilungen').insert(mitteilungen)  // non-critical, ignore error

  revalidatePath('/dispatch/dashboard')
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/dispatch/leads')
  return { ok: true, leadId: lead.id, terminId: termin.id }
}
