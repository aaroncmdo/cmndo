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

// Termin-Typen, die eine (telefonische/Video-)Beratung sind statt einer SV-Vor-Ort-Besichtigung.
// Default (nicht enthalten) = Besichtigung — bewahrt das deployte SV-Framing fuer sv_begutachtung
// + Legacy-null. Kuenftige Beratungs-Typen (Kanzlei/Werkstatt, SP3/4) werden hier additiv ergaenzt.
const BERATUNGS_TYPEN = new Set(['kb_beratung'])
function istBeratung(typ: string | null | undefined): boolean {
  return typ != null && BERATUNGS_TYPEN.has(typ)
}

/**
 * Event-Titel. Besichtigung (SV, vor Ort): Fahrzeug (+Kennzeichen) — Ort · Claim-Nr.
 * Beratung (KB, telefonisch/Video): "Beratungstermin — {Kunde}" · Claim-Nr, ohne Vor-Ort-Ort. Pure.
 */
export function buildSummary(f: KontextFelder, location: string | null, typ?: string | null): string {
  const ref = f.claimNummer ? ` · ${f.claimNummer}` : ''
  if (istBeratung(typ)) {
    const head = f.kundeName ? `Beratungstermin — ${f.kundeName}` : 'Beratungstermin'
    return `${head}${ref}`.trim()
  }
  const auto = [f.fahrzeugHersteller, f.fahrzeugModell].filter(Boolean).join(' ')
  const kennz = f.kennzeichen ? ` (${f.kennzeichen})` : ''
  const head = auto ? `${auto}${kennz}` : 'Schadenbesichtigung'
  const ort = location ?? f.schadenortAdresse ?? ''
  return `${head}${ort ? ' — ' + ort : ''}${ref}`.trim()
}

/** Event-Beschreibung (Kunde/Telefon/Fahrzeug/Adresse/Fallakte-Link). Pure. */
export function buildDescription(f: KontextFelder, location: string | null, appUrl: string, typ?: string | null): string {
  const beratung = istBeratung(typ)
  const lines: string[] = [beratung ? 'Claimondo — Beratungstermin' : 'Claimondo-Auftrag — Schadenbesichtigung', '']
  if (f.kundeName) lines.push(`Kunde: ${f.kundeName}`)
  if (f.kundeTelefon) lines.push(`Telefon: ${f.kundeTelefon}`)
  if (f.kennzeichen) lines.push(`Kennzeichen: ${f.kennzeichen}`)
  const auto = [f.fahrzeugHersteller, f.fahrzeugModell].filter(Boolean).join(' ')
  if (auto) lines.push(`Fahrzeug: ${auto}`)
  const adresse = location ?? f.schadenortAdresse
  // Beratung ist telefonisch/Video → keine Vor-Ort-Adresse (waere im KB-Kalender irrefuehrend).
  if (!beratung && adresse) lines.push(`Adresse: ${adresse}`)
  if (f.fallId) {
    lines.push('')
    lines.push(`Fallakte: ${appUrl}/gutachter/fall/${f.fallId}`)
  }
  return lines.join('\n')
}

/**
 * Normalisiert den Event-bezug eines Termins: explizites bezug_typ/bezug_id hat
 * Vorrang; fehlt es (Legacy-/Direkt-Buchungen, die kein bezug gesetzt haben),
 * faellt sie auf das CMM-49-kanonische termin.claim_id zurueck, dann lead_id.
 * Faelle-frei — KEIN fall-Fallback. So baut der externe-Kalender-Sync auch fuer
 * bezuglose, aber claim-/lead-verankerte Termine reichen Kontext (Fahrzeug/Kunde/
 * Claim-Nr) statt auf den generischen "Schadenbesichtigung"-Titel zu degradieren.
 * Pure (testbar). Verifiziert gegen Prod 08.06.: 9/13 aktive Termine ohne bezug,
 * davon 3 mit claim_id (→ rich via Fallback), 6 voellig bezuglos (SV-Eigentermine).
 */
export function normalisiereBezug(t: {
  bezug_typ: string | null
  bezug_id: string | null
  claim_id?: string | null
  lead_id?: string | null
}): { typ: string | null; id: string | null } {
  if (t.bezug_typ && t.bezug_id) return { typ: t.bezug_typ, id: t.bezug_id }
  if (t.claim_id) return { typ: 'claim', id: t.claim_id }
  if (t.lead_id) return { typ: 'lead', id: t.lead_id }
  return { typ: t.bezug_typ, id: t.bezug_id }
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
  // CMM-50: Fahrzeugdaten kommen aus vehicles (SSoT) via v_claim_full statt direkt aus der
  // faelle-Tabelle — der Konvertierungs-Write-Retire (#2830) leert faelle.kennzeichen/fahrzeug_*.
  // vcf ist faelle-frei (sourct kennzeichen/fahrzeug_* aus vehicles) und hat claim_nummer/
  // schadenort_*/lead_id/kunde_id flach (kein claims-Embed mehr). vcf.fall_id == faelle.id.
  // db ist hier service_role (syncTerminToExternalCalendar -> createAdminClient, alle Caller
  // ohne db-Arg) -> .eq('fall_id') ok, KEIN RLS-Leak (gleiches Risikoprofil wie der faelle-Read).
  const { data: fall } = await db
    .from('v_claim_full')
    .select('kennzeichen, fahrzeug_hersteller, fahrzeug_modell, claim_nummer, schadenort_adresse, schadenort_ort, lead_id, kunde_id')
    .eq('fall_id', fallId)
    .maybeSingle()
  if (!fall) return { ...LEER, fallId }
  const kunde = await ladeKunde(db, (fall.lead_id as string | null) ?? null, (fall.kunde_id as string | null) ?? null)
  return {
    claimNummer: (fall.claim_nummer as string | null) ?? null,
    fahrzeugHersteller: (fall.fahrzeug_hersteller as string | null) ?? null,
    fahrzeugModell: (fall.fahrzeug_modell as string | null) ?? null,
    kennzeichen: (fall.kennzeichen as string | null) ?? null,
    kundeName: kunde.name,
    kundeTelefon: kunde.telefon,
    schadenortAdresse: (fall.schadenort_adresse as string | null) ?? (fall.schadenort_ort as string | null) ?? null,
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
  termin: {
    bezug_typ: string | null
    bezug_id: string | null
    besichtigungsort_adresse: string | null
    claim_id?: string | null
    lead_id?: string | null
    typ?: string | null
  },
  db: SupabaseClient,
): Promise<TerminKontext> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
  const bezug = normalisiereBezug(termin)
  let felder: KontextFelder = LEER
  if (bezug.id) {
    if (bezug.typ === 'fall') {
      felder = await ladeFallFelder(db, bezug.id)
    } else if (bezug.typ === 'lead') {
      felder = await ladeLeadFelder(db, bezug.id)
    } else if (bezug.typ === 'claim') {
      // CMM-49: KEIN faelle-Reverse (verbotenes claim_id->fall_id-Daten-Reverse, bricht eh beim Drop).
      // Kontext claim-direkt; Deep-Link = /gutachter/fall/${claimId} — die Route-Eingangs-resolveClaimId
      // (gutachter/fall/[id]/page.tsx:210) nimmt claims.id direkt an. fahrzeug/kennzeichen bleiben null
      // bis CMM-50-Cutover (Kalender-Titel degradiert sauber auf "Schadenbesichtigung").
      const { data: c } = await db
        .from('claims')
        .select('claim_nummer, schadenort_adresse, schadenort_ort, lead_id, geschaedigter_user_id')
        .eq('id', bezug.id)
        .maybeSingle()
      const kunde = await ladeKunde(db, (c?.lead_id as string | null) ?? null, (c?.geschaedigter_user_id as string | null) ?? null)
      felder = {
        ...LEER,
        claimNummer: (c?.claim_nummer as string | null) ?? null,
        schadenortAdresse: (c?.schadenort_adresse as string | null) ?? (c?.schadenort_ort as string | null) ?? null,
        kundeName: kunde.name,
        kundeTelefon: kunde.telefon,
        fallId: bezug.id, // = claimId; /gutachter/fall/${claimId} wird via resolveClaimId aufgeloest
      }
    }
  }
  const location = termin.besichtigungsort_adresse ?? felder.schadenortAdresse ?? null
  return {
    summary: buildSummary(felder, location, termin.typ ?? null),
    description: buildDescription(felder, location, appUrl, termin.typ ?? null),
    location: location ?? undefined,
  }
}
