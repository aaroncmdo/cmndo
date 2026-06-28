'use server'

// Rueckruf-Termin fuer einen BESTEHENDEN Lead (schaden-melden-Bestaetigungsseite).
// Anders als erstelleOeffentlichenRueckruf (oeffentliches Formular) wird KEIN neuer
// Lead angelegt — der Kunde hat schon einen. Legt nur den admin_termine (typ='rueckruf')
// am bestehenden Lead + dem zugewiesenen Dispatcher an + eine Mitteilung.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'

const ZEITFENSTER_LABELS: Record<string, string> = {
  jetzt: 'So schnell wie möglich',
  vormittags: 'Heute Vormittag',
  nachmittags: 'Heute Nachmittag',
  abends: 'Heute Abend',
  morgen: 'Morgen',
}

export async function bucheRueckrufFuerLead(
  leadId: string,
  zeitfenster: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!leadId) return { ok: false, error: 'Vorgang fehlt.' }
  const admin = createAdminClient()

  const { data: lead } = await admin
    .from('leads')
    .select('id, vorname, nachname, telefon, zugewiesen_an')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Vorgang nicht gefunden.' }

  // Empfaenger/Ersteller: der zugewiesene Dispatcher; Fallback erster aktiver dispatch.
  let dispatcherId = (lead.zugewiesen_an as string | null) ?? null
  if (!dispatcherId) {
    const { data: d } = await admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'dispatch')
      .eq('aktiv', true)
      .limit(1)
      .maybeSingle()
    dispatcherId = (d?.id as string | null) ?? null
  }
  if (!dispatcherId) return { ok: false, error: 'Aktuell ist kein Berater erreichbar.' }

  const zfLabel = ZEITFENSTER_LABELS[zeitfenster] ?? zeitfenster
  const name = [lead.vorname, lead.nachname].filter(Boolean).join(' ') || 'Kunde'
  const startZeit = new Date(Date.now() + 5 * 60_000).toISOString()
  const endZeit = new Date(new Date(startZeit).getTime() + 30 * 60_000).toISOString()

  const { error: terminErr } = await admin.from('admin_termine').insert({
    typ: 'rueckruf',
    titel: `Rückruf (Kundenwunsch): ${name}`,
    beschreibung: `Wunschzeit: ${zfLabel}\nQuelle: schaden-melden Bestätigungsseite`,
    start_zeit: startZeit,
    end_zeit: endZeit,
    status: 'offen',
    lead_id: leadId,
    erstellt_von: dispatcherId,
    erinnerung_min_vorher: 10,
  })
  if (terminErr) return { ok: false, error: terminErr.message }

  // Mitteilung an den Dispatcher (non-critical).
  try {
    await admin.from('mitteilungen').insert({
      empfaenger_id: dispatcherId,
      empfaenger_rolle: 'dispatch',
      kategorie: 'anruf',
      titel: `Rückrufwunsch: ${name}`,
      inhalt: `Tel: ${lead.telefon ?? '—'} · Wunschzeit: ${zfLabel}`,
      prioritaet: 'hoch',
      icon: '📞',
      route_url: `/dispatch/leads/${leadId}`,
    })
  } catch {
    /* non-critical */
  }

  // Dedup: den redundanten KB-Auto-Beratungstermin dieses Leads stornieren — der Kunde
  // hat jetzt AKTIV einen Rueckruf gewaehlt (sonst zwei Anrufe: KB-Auto-Termin +
  // Kunden-Rueckruf). Best-effort, non-critical (der Rueckruf ist schon gebucht). Bucht
  // der Kunde NICHTS, bleibt der KB-Auto-Termin als Safety-Net bestehen.
  try {
    await admin
      .from('gutachter_termine')
      .update({ status: 'storniert', cancelled_at: new Date().toISOString() })
      .eq('lead_id', leadId)
      .eq('typ', 'kb_beratung')
      .in('status', ['reserviert', 'bestaetigt', 'verlegt', 'verlegung_pending'])
  } catch {
    /* non-critical */
  }

  revalidatePath('/dispatch/dashboard')
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/dispatch/leads')
  return { ok: true }
}
