// P2.5 — Event-Kontext fuer externe Kalender-Syncs, assignee-/bezug-generisch.
// resolveTerminKontext baut Summary/Description/Location aus dem bezug (claim/fall/lead)
// + dem in P2.3b gecachten termin.besichtigungsort_adresse. Pure Builder sind testbar.
import type { SupabaseClient } from '@supabase/supabase-js'

export interface KontextFelder {
  claimNummer: string | null
  fahrzeugHersteller: string | null
  fahrzeugModell: string | null
  kennzeichen: string | null
  kundeName: string | null
  kundeTelefon: string | null
  schadenortAdresse: string | null
  fallId: string | null // fuer den Fallakte-Deep-Link; null bei reinem Lead
}

export interface TerminKontext {
  summary: string
  description: string
  location: string | undefined
}

const LEER: KontextFelder = {
  claimNummer: null, fahrzeugHersteller: null, fahrzeugModell: null, kennzeichen: null,
  kundeName: null, kundeTelefon: null, schadenortAdresse: null, fallId: null,
}

/** Event-Titel: Fahrzeug (+Kennzeichen) — Ort · Claim-Nr. Pure. */
export function buildSummary(f: KontextFelder, location: string | null): string {
  const auto = [f.fahrzeugHersteller, f.fahrzeugModell].filter(Boolean).join(' ')
  const kennz = f.kennzeichen ? ` (${f.kennzeichen})` : ''
  const head = auto ? `${auto}${kennz}` : 'Schadenbesichtigung'
  const ort = location ?? f.schadenortAdresse ?? ''
  const ref = f.claimNummer ? ` · ${f.claimNummer}` : ''
  return `${head}${ort ? ' — ' + ort : ''}${ref}`.trim()
}

/** Event-Beschreibung (Kunde/Telefon/Fahrzeug/Adresse/Fallakte-Link). Pure. */
export function buildDescription(f: KontextFelder, location: string | null, appUrl: string): string {
  const lines: string[] = ['Claimondo-Auftrag — Schadenbesichtigung', '']
  if (f.kundeName) lines.push(`Kunde: ${f.kundeName}`)
  if (f.kundeTelefon) lines.push(`Telefon: ${f.kundeTelefon}`)
  if (f.kennzeichen) lines.push(`Kennzeichen: ${f.kennzeichen}`)
  const auto = [f.fahrzeugHersteller, f.fahrzeugModell].filter(Boolean).join(' ')
  if (auto) lines.push(`Fahrzeug: ${auto}`)
  const adresse = location ?? f.schadenortAdresse
  if (adresse) lines.push(`Adresse: ${adresse}`)
  if (f.fallId) {
    lines.push('')
    lines.push(`Fallakte: ${appUrl}/gutachter/fall/${f.fallId}`)
  }
  return lines.join('\n')
}

async function ladeKunde(
  db: SupabaseClient, leadId: string | null, kundeId: string | null,
): Promise<{ name: string | null; telefon: string | null }> {
  if (leadId) {
    const { data: lead } = await db.from('leads').select('vorname, nachname, telefon').eq('id', leadId).maybeSingle()
    if (lead) return { name: [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null, telefon: (lead.telefon as string | null) ?? null }
  }
  if (kundeId) {
    const { data: p } = await db.from('profiles').select('vorname, nachname, telefon').eq('id', kundeId).maybeSingle()
    if (p) return { name: [p.vorname, p.nachname].filter(Boolean).join(' ') || null, telefon: (p.telefon as string | null) ?? null }
  }
  return { name: null, telefon: null }
}

async function ladeFallFelder(db: SupabaseClient, fallId: string): Promise<KontextFelder> {
  const { data: fall } = await db
    .from('faelle')
    .select('id, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, lead_id, kunde_id, claims:claim_id(claim_nummer, schadenort_adresse, schadenort_ort)')
    .eq('id', fallId)
    .maybeSingle()
  if (!fall) return { ...LEER, fallId }
  const claim = Array.isArray(fall.claims) ? fall.claims[0] : fall.claims
  const kunde = await ladeKunde(db, (fall.lead_id as string | null) ?? null, (fall.kunde_id as string | null) ?? null)
  return {
    claimNummer: (claim?.claim_nummer as string | null) ?? null,
    fahrzeugHersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
    fahrzeugModell: (fall.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (fall.kennzeichen as string | null) ?? null,
    kundeName: kunde.name,
    kundeTelefon: kunde.telefon,
    schadenortAdresse: (claim?.schadenort_adresse as string | null) ?? (claim?.schadenort_ort as string | null) ?? null,
    fallId,
  }
}

async function ladeLeadFelder(db: SupabaseClient, leadId: string): Promise<KontextFelder> {
  const { data: lead } = await db
    .from('leads')
    .select('vorname, nachname, telefon, kennzeichen, fahrzeug_hersteller, fahrzeug_modell, besichtigungsort_adresse')
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return LEER
  return {
    claimNummer: null,
    fahrzeugHersteller: (lead.fahrzeug_hersteller as string | null) ?? null,
    fahrzeugModell: (lead.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (lead.kennzeichen as string | null) ?? null,
    kundeName: [lead.vorname, lead.nachname].filter(Boolean).join(' ') || null,
    kundeTelefon: (lead.telefon as string | null) ?? null,
    schadenortAdresse: (lead.besichtigungsort_adresse as string | null) ?? null,
    fallId: null,
  }
}

/**
 * Baut den Event-Kontext aus dem bezug des Termins. Location bevorzugt das
 * (in P2.3b gecachte) termin.besichtigungsort_adresse, sonst den Schadenort.
 * claim-bezug geht ueber die faelle-Bridge (claim_id) fuer Fahrzeug/Kunde,
 * sonst minimal aus claims.
 */
export async function resolveTerminKontext(
  termin: { bezug_typ: string | null; bezug_id: string | null; besichtigungsort_adresse: string | null },
  db: SupabaseClient,
): Promise<TerminKontext> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  let felder: KontextFelder = LEER
  if (termin.bezug_id) {
    if (termin.bezug_typ === 'fall') {
      felder = await ladeFallFelder(db, termin.bezug_id)
    } else if (termin.bezug_typ === 'lead') {
      felder = await ladeLeadFelder(db, termin.bezug_id)
    } else if (termin.bezug_typ === 'claim') {
      const { data: bridge } = await db.from('faelle').select('id').eq('claim_id', termin.bezug_id).maybeSingle()
      if (bridge?.id) {
        felder = await ladeFallFelder(db, bridge.id as string)
      } else {
        const { data: c } = await db.from('claims').select('claim_nummer, schadenort_adresse, schadenort_ort').eq('id', termin.bezug_id).maybeSingle()
        felder = { ...LEER, claimNummer: (c?.claim_nummer as string | null) ?? null, schadenortAdresse: (c?.schadenort_adresse as string | null) ?? (c?.schadenort_ort as string | null) ?? null }
      }
    }
  }
  const location = termin.besichtigungsort_adresse ?? felder.schadenortAdresse ?? null
  return {
    summary: buildSummary(felder, location),
    description: buildDescription(felder, location, appUrl),
    location: location ?? undefined,
  }
}
