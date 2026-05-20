'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
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

  // 2. Lead anlegen — via zentrale createLead() (Writer-Konsistenz, leads-Audit
  // 15.05.2026). status='rueckruf' konsistent zu qualifizierungs_phase;
  // source_channel = Marketing-Quelle; zugewiesen_an = Dispatch-Empfänger.
  const created = await createLead(
    admin,
    {
      source_channel: input.quelle?.trim() || 'rueckruf',
      status: 'rueckruf',
      vorname,
      nachname,
      telefon,
      email: input.email?.trim() || null,
    },
    {
      qualifizierungs_phase: 'rueckruf',
      zugewiesen_an: erstellerId,
    },
  )
  if (!created.ok) {
    return { ok: false, error: `Lead-Anlage fehlgeschlagen: ${created.error}` }
  }
  const lead = { id: created.leadId }

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

  // 5. Email + WhatsApp via shared notifyNewLead (Aaron-Direktive 2026-05-20).
  await notifyNewLead({
    leadId: lead.id,
    source: `Rueckruf-Form (${input.quelle})`,
    name,
    phone: telefon,
    email: input.email ?? null,
    extraFields: [
      { label: 'Wunschzeit', value: input.zeitfenster },
      { label: 'Nachricht', value: input.nachricht },
      { label: 'Start-Zeit (Termin)', value: startZeit },
    ],
  })

  revalidatePath('/dispatch/dashboard')
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/dispatch/leads')
  return { ok: true, leadId: lead.id, terminId: termin.id }
}
