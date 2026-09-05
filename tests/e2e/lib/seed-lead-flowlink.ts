// Lead + FlowLink per Service-Role seeden — der realistische AUSGANGSZUSTAND, den ein vorgelagerter
// Schritt (Finder, /schaden-melden, Dispatcher) erzeugt haette. Alles danach ist echter UI-Klick (Regel 4).
// Shape wie ein self_service-Finder-Lead (identisch zu smoke-kundenfunnel-szenarien-prod.spec.ts).
//
// Sicherheit: telefon bleibt NULL (keine SMS/WhatsApp), die Email ist eine Abnahme-Adresse
// (abnahme+<tag>@claimondo.de -> Identitaet intern, Zustellung erlaubt). Aufraeumen ueber
// loescheLeadMitAnhang in test.afterEach (NICHT in finally — bei Test-Timeout laeuft finally nicht).

import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

export const KOELN = { adresse: 'Hansaring 30, 50670 Köln', lat: 50.9460795, lng: 6.9457681 }

export function serviceClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Seed braucht NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY')
  return createClient(url, key, { auth: { persistSession: false } })
}

export async function seedeLeadUndFlowLink(
  db: SupabaseClient,
  opts: { email: string; vorname?: string; nachname?: string },
): Promise<{ leadId: string; token: string }> {
  const { data: lead, error: leadErr } = await db
    .from('leads')
    .insert({
      vorname: opts.vorname ?? 'Abnahme',
      nachname: opts.nachname ?? 'Mailbox',
      email: opts.email,
      telefon: null,
      service_typ: 'komplett',
      source_channel: 'self_service',
      status: 'neu',
      qualifizierungs_phase: 'erstkontakt',
      schadentyp: 'auffahrunfall',
      sprache: 'de',
      fahrzeug_standort_adresse: KOELN.adresse,
      fahrzeug_standort_lat: KOELN.lat,
      fahrzeug_standort_lng: KOELN.lng,
      besichtigungsort_adresse: KOELN.adresse,
      besichtigungsort_lat: KOELN.lat,
      besichtigungsort_lng: KOELN.lng,
    })
    .select('id')
    .single()
  if (leadErr || !lead) throw new Error(`Lead-Seed fehlgeschlagen: ${leadErr?.message}`)
  const token = randomBytes(16).toString('hex')
  const { error: flErr } = await db.from('flow_links').insert({
    token,
    lead_id: lead.id,
    service_typ: 'komplett',
    sprache: 'de',
    status: 'aktiv',
    expires_at: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(),
  })
  if (flErr) throw new Error(`FlowLink-Seed fehlgeschlagen: ${flErr.message}`)
  return { leadId: lead.id as string, token }
}

/**
 * Lead samt Anhang loeschen. Reihenfolge nach den FK-Regeln auf prod (05.09.2026): tasks.lead_id ist
 * NO ACTION (zuerst weg), email_log.lead_id waere SET NULL (wir loeschen die Test-Mails ueber den
 * Empfaenger, damit kein Log-Muell bleibt), admin_termine SET NULL, flow_links/timeline/lead_historie CASCADE.
 * Jeder Write prueft error — ein stiller Fehlschlag liesse Residue stehen (J2-Seed-Vorfall 16.08.).
 */
export async function loescheLeadMitAnhang(db: SupabaseClient, leadId: string, email?: string): Promise<void> {
  const fehler: string[] = []
  const { error: tErr } = await db.from('tasks').delete().eq('lead_id', leadId)
  if (tErr) fehler.push(`tasks: ${tErr.message}`)
  if (email) {
    const { error: mErr } = await db.from('email_log').delete().eq('empfaenger', email)
    if (mErr) fehler.push(`email_log: ${mErr.message}`)
  }
  const { error: rErr } = await db.from('admin_termine').delete().eq('lead_id', leadId)
  if (rErr) fehler.push(`admin_termine: ${rErr.message}`)
  const { error: lErr, count } = await db.from('leads').delete({ count: 'exact' }).eq('id', leadId)
  if (lErr) fehler.push(`leads: ${lErr.message}`)
  else if (count === 0) fehler.push(`leads: 0 Zeilen geloescht (${leadId})`)
  if (fehler.length > 0) throw new Error(`Cleanup unvollstaendig: ${fehler.join(' · ')}`)
}
