'use server'

import { createAdminClient } from '@/lib/supabase/admin'
// C2/§9-#5 (Ein Intake): der Rueckruf-Lead laeuft ueber `createCase` statt roh ueber
// `createLead` — dadurch bekommt er einen garantierten FlowLink (Begruendung am Aufruf).
import { createCase } from '@/lib/intake/create-case'
import { notifyNewLead } from '@/lib/leads/notify-new-lead'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { getLocaleCookie } from '@/lib/i18n/locale-cookie'
import { revalidatePath } from 'next/cache'

export type RueckrufInput = {
  name: string
  telefon: string
  email?: string | null
  zeitfenster?: string | null  // Freitext z.B. "vormittags" oder ISO-Zeit
  startZeit?: string | null    // ISO-Timestamp wenn Modal eine konkrete Zeit liefert
  nachricht?: string | null
  quelle: string
  // Makler-Anfrage (makler-anfrage): Attribution + optionaler Standort-Prefill.
  promotionCodeId?: string | null
  standortPlz?: string | null
  standortOrt?: string | null
  // Standort mit Koordinaten (Place-Picker) — analog flowlink-Zweig. Werden nur als
  // Paar (lat+lng) geschrieben, damit Kunde-Flow-Prefill + SV-Matching konsistent sind.
  standortLat?: number | null
  standortLng?: number | null
  standortPlaceId?: string | null
  notiz?: string | null
  serviceTyp?: string | null
  // Optionaler Owner (Round-Robin-Dispatcher) — sonst erster Dispatch-User.
  zugewiesenAn?: string | null
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
  const erstellerId = input.zugewiesenAn ?? dispatchUser[0].id

  // Name split: "Max Mustermann" → vorname="Max", nachname="Mustermann"
  const parts = name.split(/\s+/)
  const vorname = parts.shift() ?? name
  const nachname = parts.join(' ') || null

  // Standort-Koordinaten: nur als Paar (lat+lng) verwerten — Prefill + SV-Matching
  // brauchen beide. place_id ist eine unabhaengige Referenz (mirror flowlink-Zweig).
  const koordLat = typeof input.standortLat === 'number' && Number.isFinite(input.standortLat) ? input.standortLat : null
  const koordLng = typeof input.standortLng === 'number' && Number.isFinite(input.standortLng) ? input.standortLng : null
  const hatKoords = koordLat != null && koordLng != null
  const koordPlaceId = input.standortPlaceId?.trim() || null

  // 2. Lead anlegen — via `createCase` (C2/§9-#5 „Ein Intake"), identisch zum bereits
  // gehobenen Aircall- und matelso-Webhook. Der Lead-Teil ist unveraendert (createCase
  // ruft intern dasselbe createLead auf, Writer-Konsistenz + leads-Audit 15.05.2026
  // bleiben); status='rueckruf' konsistent zu qualifizierungs_phase, source_channel =
  // Marketing-Quelle, zugewiesen_an = Dispatch-Empfaenger.
  //
  // Der Gewinn ist der garantierte FlowLink: Hier meldet sich ein ECHTER Interessent
  // ueber ein oeffentliches Formular. Blieb der Rueckruf aus, hatte er bisher keinerlei
  // Kanal zurueck in seinen Vorgang — derselbe Befund wie beim Anrufer-Lead. Der Link
  // wird nur ANGELEGT (nicht versendet); Dispatch kann ihn dem Kunden reichen.
  //
  // mode='lead-first': ein Rueckruf-Wunsch ist noch kein Fall — die Konversion passiert
  // spaeter ueber /flow. KEIN dedup-Key: der generische ist ohne Kennzeichen unbrauchbar
  // (`dedupKeyIsUsable`), und ein Dedup waere hier eine Verhaltensaenderung (zwei
  // Rueckruf-Wuensche = heute bewusst zwei Leads).
  const sprache = await getLocaleCookie()
  const serviceTyp = input.serviceTyp ?? null
  const created = await createCase(admin, {
    mode: 'lead-first',
    base: {
      source_channel: input.quelle?.trim() || 'rueckruf',
      status: 'rueckruf',
      vorname,
      nachname,
      telefon,
      email: input.email?.trim() || null,
    },
    extra: {
      qualifizierungs_phase: 'rueckruf',
      zugewiesen_an: erstellerId,
      sprache,
      ...(input.promotionCodeId ? { promotion_code_id: input.promotionCodeId } : {}),
      ...(input.standortPlz ? { fahrzeug_standort_plz: input.standortPlz } : {}),
      ...(input.standortOrt ? { fahrzeug_standort_adresse: input.standortOrt } : {}),
      ...(hatKoords ? { fahrzeug_standort_lat: koordLat, fahrzeug_standort_lng: koordLng } : {}),
      ...(koordPlaceId ? { fahrzeug_standort_place_id: koordPlaceId } : {}),
      ...(input.notiz ? { notiz: input.notiz } : {}),
      ...(serviceTyp ? { service_typ: serviceTyp } : {}),
    },
    flowLink: { serviceTyp, sprache },
  })
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

  // 5. Email + WhatsApp ans Team via shared notifyNewLead (Aaron-Direktive 2026-05-20).
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

  // 6. Bestaetigungs-WhatsApp an den Kunden (Aaron 12.06.: "eine Nachricht an den
  //    Geschaedigten per Baileys"). Gilt fuer ALLE Rueckruf-Formulare (Aaron-Entscheid
  //    12.06.). Non-critical: telefon ist oben validiert (>=5 Zeichen); ein Baileys-Fail
  //    (z.B. keine WA-Nummer) wird nur geloggt und bricht die Rueckruf-Anlage nie.
  try {
    const kundeText = [
      '✅ Wir haben Ihre Anfrage erhalten',
      '',
      `Hallo ${vorname},`,
      input.zeitfenster
        ? `danke für Ihre Rückruf-Anfrage. Unser Team meldet sich ${input.zeitfenster.toLowerCase()} bei Ihnen.`
        : 'danke für Ihre Rückruf-Anfrage. Unser Team meldet sich in Kürze bei Ihnen.',
      '',
      'Ihr Claimondo-Team',
    ].join('\n')
    const r = await sendWhatsAppText(telefon, kundeText)
    if (!r.ok) console.error('[public-rueckruf] Kunde-Bestaetigungs-WA fehlgeschlagen:', r.code, r.error)
  } catch (err) {
    console.error('[public-rueckruf] Kunde-WA-Block fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }

  revalidatePath('/dispatch/dashboard')
  revalidatePath('/dispatch/rueckrufe')
  revalidatePath('/dispatch/leads')
  return { ok: true, leadId: lead.id, terminId: termin.id }
}
