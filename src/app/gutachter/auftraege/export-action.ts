'use server'

// CMM-37 (Vorab Option A): Tagesvorbereitungs-Export für SVs.
//
// Ziel: SV öffnet morgens das Portal, wählt einen Datums-Bereich (default:
// heute), lädt eine CSV runter und importiert sie in AutoiXpert / Audatex /
// Excel. Damit hat er die Stammdaten als Vorgangs-Skelett im Gutachten-Tool
// und kann direkt los — keine doppelte Eingabe.
//
// CSV-Format: UTF-8 mit BOM (Excel DE), Semikolon-Trenner (Excel DE), CRLF.
// Spalten in Reihenfolge die ein SV erwartet: Termin oben, Fahrzeug, Kunde,
// Schaden, Notiz.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { LACKFARBE_LABEL, type LackfarbeCode } from '@/lib/fahrzeug/imagin'

type Result =
  | { ok: true; csv: string; filename: string; rowCount: number }
  | { ok: false; error: string }

function fmtDate(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleDateString('de-DE')
  } catch {
    return iso
  }
}

function fmtTime(iso: string | null): string {
  if (!iso) return ''
  try {
    return new Date(iso).toLocaleTimeString('de-DE', {
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}

function csvEscape(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return ''
  const s = String(value)
  if (s.includes(';') || s.includes('"') || s.includes('\n') || s.includes('\r')) {
    return `"${s.replace(/"/g, '""')}"`
  }
  return s
}

const HEADERS = [
  'Termin Datum',
  'Termin Zeit',
  'Auftrags-Nr',
  'Kunde Vorname',
  'Kunde Nachname',
  'Kunde Telefon',
  'Kunde E-Mail',
  'Kennzeichen',
  'FIN',
  'Hersteller',
  'Modell',
  'Baujahr',
  'Lackfarbe',
  'Schadens-Datum',
  'Besichtigungs-Adresse',
  'Schadens-Ursache',
  'SV-Briefing',
] as const

export async function exportTagesvorbereitung({
  von,
  bis,
}: {
  /** YYYY-MM-DD oder ISO-String. Default: heute. */
  von?: string
  /** YYYY-MM-DD oder ISO-String. Default: heute. */
  bis?: string
}): Promise<Result> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { ok: false, error: 'Nicht eingeloggt' }

  const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
  if (!sv) return { ok: false, error: 'Kein SV-Profil gefunden' }

  const heute = new Date()
  heute.setHours(0, 0, 0, 0)
  const morgen = new Date(heute)
  morgen.setDate(morgen.getDate() + 1)

  const vonDate = von ? new Date(von) : heute
  const bisDate = bis ? new Date(bis) : morgen
  if (Number.isNaN(vonDate.getTime()) || Number.isNaN(bisDate.getTime())) {
    return { ok: false, error: 'Ungültiger Datums-Bereich' }
  }
  // bis exklusiv → +1 Tag wenn der Caller einen einzelnen Tag bis-inklusiv liefert
  if (vonDate.getTime() === bisDate.getTime()) {
    bisDate.setDate(bisDate.getDate() + 1)
  }

  const admin = createAdminClient()

  // 1. Termine für den SV im Datums-Bereich
  const { data: termine, error: terminErr } = await admin
    .from('gutachter_termine')
    .select('id, fall_id, start_zeit, status')
    .eq('sv_id', sv.id)
    .in('status', ['bestaetigt', 'reserviert', 'durchgefuehrt'])
    .gte('start_zeit', vonDate.toISOString())
    .lt('start_zeit', bisDate.toISOString())
    .order('start_zeit', { ascending: true })

  if (terminErr) return { ok: false, error: terminErr.message }
  if (!termine || termine.length === 0) {
    return { ok: false, error: 'Keine Termine im Zeitraum.' }
  }

  const fallIds = Array.from(
    new Set(termine.map((t) => t.fall_id as string | null).filter(Boolean) as string[]),
  )
  if (fallIds.length === 0) {
    return { ok: false, error: 'Keine Fälle zum Exportieren gefunden.' }
  }

  // 2. Fall-Stammdaten
  // CMM-44 SP-A2 (Cluster 1): schadentag aus claims (SSoT) via claim_id-Embed.
  // CMM-44 SP-B PR2c: schadens_ursache lebt auf claims (SSoT) — ins Embed.
  // CMM-44 SP-D PR2a: besichtigungsort_adresse aus gutachter_termine (aktueller Termin, SSoT).
  const { data: faelle, error: fallErr } = await admin
    .from('faelle')
    .select(
      'id, lead_id, kennzeichen, fin_vin, fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, lackfarbe_code, sv_briefing_text, claim_id, claims:claim_id(schadentag, claim_nummer, schadens_ursache)',
    )
    .in('id', fallIds)

  if (fallErr) return { ok: false, error: fallErr.message }
  const fallMap = new Map((faelle ?? []).map((f) => [f.id as string, f]))

  // besichtigungsort_adresse: Batch-Fetch aus gutachter_termine (aktueller Termin per claim).
  const exportClaimIds = Array.from(
    new Set((faelle ?? []).map((f) => f.claim_id as string | null).filter(Boolean) as string[]),
  )
  const besichtigungsortMap = new Map<string, string | null>()
  if (exportClaimIds.length) {
    // Fuer jeden Claim den neuesten Termin holen (start_zeit DESC).
    // Supabase unterstuetzt kein DISTINCT ON — wir laden alle und nehmen pro claim_id den ersten.
    const { data: terminLocs } = await admin
      .from('gutachter_termine')
      .select('claim_id, besichtigungsort_adresse')
      .in('claim_id', exportClaimIds)
      .order('start_zeit', { ascending: false })
    for (const t of (terminLocs ?? []) as Array<{ claim_id: string | null; besichtigungsort_adresse: string | null }>) {
      if (t.claim_id && !besichtigungsortMap.has(t.claim_id)) {
        besichtigungsortMap.set(t.claim_id, t.besichtigungsort_adresse)
      }
    }
  }

  // 3. Kunden-Daten
  const leadIds = Array.from(
    new Set(
      (faelle ?? [])
        .map((f) => f.lead_id as string | null)
        .filter(Boolean) as string[],
    ),
  )
  const { data: leads } = leadIds.length
    ? await admin
        .from('leads')
        .select('id, vorname, nachname, telefon, email')
        .in('id', leadIds)
    : { data: [] as Array<{ id: string; vorname: string | null; nachname: string | null; telefon: string | null; email: string | null }> }
  const leadMap = new Map((leads ?? []).map((l) => [l.id as string, l]))

  // 4. Zeilen bauen
  const rows: string[] = []
  rows.push(HEADERS.join(';'))
  for (const t of termine) {
    const fall = fallMap.get(t.fall_id as string)
    if (!fall) continue
    const lead = fall.lead_id ? leadMap.get(fall.lead_id as string) ?? null : null
    const lack = (fall.lackfarbe_code as LackfarbeCode | null) ?? null
    const fallClaim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
    rows.push(
      [
        fmtDate(t.start_zeit as string | null),
        fmtTime(t.start_zeit as string | null),
        (fallClaim?.claim_nummer as string | null) ?? '',
        lead?.vorname ?? '',
        lead?.nachname ?? '',
        lead?.telefon ?? '',
        lead?.email ?? '',
        fall.kennzeichen ?? '',
        fall.fin_vin ?? '',
        fall.fahrzeug_hersteller ?? '',
        fall.fahrzeug_modell ?? '',
        fall.fahrzeug_baujahr ?? '',
        lack ? LACKFARBE_LABEL[lack] : '',
        fmtDate((fallClaim?.schadentag as string | null) ?? null),
        besichtigungsortMap.get((fall.claim_id as string | null) ?? '') ?? '',
        (fallClaim?.schadens_ursache as string | null) ?? '',
        (fall.sv_briefing_text ?? '').replace(/\r?\n/g, ' ').slice(0, 500),
      ]
        .map(csvEscape)
        .join(';'),
    )
  }

  // BOM + CRLF damit Excel DE die Datei direkt korrekt darstellt
  const csv = '﻿' + rows.join('\r\n') + '\r\n'

  const tag = vonDate.toISOString().slice(0, 10)
  const filename = `claimondo_tagesvorbereitung_${tag}.csv`

  return { ok: true, csv, filename, rowCount: termine.length }
}
