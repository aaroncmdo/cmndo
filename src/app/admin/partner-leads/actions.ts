'use server'

// Server-Actions fuer das Partner-Vertriebsdashboard (/admin/partner-leads).
// Alle Actions liefern ein Result-Object ({ ok, error? }) — kein throw (AGENTS
// §Server-Actions). Zugriff: admin/dispatch/leadbearbeiter (RLS-Gate
// partner_leads_staff_all). KEINE const/type-Exports hier (AAR-664) → types.ts.

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { convertPartnerLead } from '@/lib/partner/convert-partner-lead'
import { geocodePartnerLead } from '@/lib/partner/geocode-partner-lead'
import { revalidatePath } from 'next/cache'
import type { PartnerRolle } from '@/lib/partner/policy'
import type { PartnerCsvLead, CsvZielFeld } from '@/lib/partner/csv-import'
import { heuristischesMapping, parseLlmMapping, CSV_ZIEL_FELDER } from '@/lib/partner/csv-import'
import {
  scrapeGooglePlaces,
  filterGegenBestand,
  dedupeInBatch,
  type ScrapeKandidat,
  type BestandsLead,
} from '@/lib/partner/scraping'
import { ladeBestandsPartner } from '@/lib/partner/bestands-partner'
import { reichereAusWebsite, type LeadEnrichment } from '@/lib/vertrieb/lead-website-enrichment'
import { enrolleLeads } from '@/app/admin/vertrieb/_actions/cold-mail-sequenzen'
import {
  sendMaklerWelcome,
  sendWillkommenWerkstatt,
  sendSvBasicClaimLink,
  sendePartnerOnboardingEinladung,
} from '@/lib/email/google/flows'
import { createMeetEvent } from '@/lib/google-calendar/events'
import { geocodeMitFallback } from '@/lib/termine/engine/geocode'
import type { OnboardingTerminInput } from '@/lib/partner/onboarding-termin'
import { erstellePartnerOnboardingTermin } from '@/lib/partner/beratungs-booking'
import Anthropic from '@anthropic-ai/sdk'
import { AI_MODELS } from '@/lib/ai/models'
import { logAiUsage } from '@/lib/ai/usage-log'

const VERTRIEB_ROLLEN = ['admin', 'dispatch', 'leadbearbeiter']
const PARTNER_ROLLEN: PartnerRolle[] = ['sachverstaendiger', 'werkstatt', 'makler']
const STATUS_WERTE = [
  'neu',
  'kontaktiert',
  'qualifiziert',
  'onboarding',
  'aktiv',
  'abgelehnt',
  'kein_interesse',
]
const EINSTUFUNG_WERTE = ['heiss', 'warm', 'kalt']
// Typen, die Nutzer manuell protokollieren duerfen. status_aenderung/einstufung
// werden ausschliesslich systemisch (Auto-Log) geschrieben.
const AKTIVITAET_TYP_MANUELL = ['anruf', 'notiz', 'email', 'sonstiges']

// Deutsche Status-/Einstufungs-Labels fuer die Auto-Log-Texte (backend, aber
// der Text landet im UI-Timeline → Umlaute). Klein gehalten, nicht aus types.ts
// importiert (das ist ein reines Typen-/Client-Modul, keine 'use server'-Grenze,
// aber wir halten actions.ts self-contained fuer die Log-Formatierung).
const STATUS_LABEL: Record<string, string> = {
  neu: 'Neu',
  kontaktiert: 'Kontaktiert',
  qualifiziert: 'Qualifiziert',
  onboarding: 'Onboarding',
  aktiv: 'Aktiv',
  abgelehnt: 'Abgelehnt',
  kein_interesse: 'Kein Interesse',
}
const EINSTUFUNG_LABEL: Record<string, string> = {
  heiss: 'Heiß',
  warm: 'Warm',
  kalt: 'Kalt',
}

/**
 * Auth-Guard: eingeloggt + Rolle admin/dispatch/leadbearbeiter. Gibt die
 * User-Id zurueck oder null. Der DB-Enum hat leadbearbeiter bereits (Sub-1),
 * der TS-UserRolle-Typ hinkt hinterher (Types duerfen der DB nachlaufen) —
 * daher String-Vergleich statt Enum.
 */
async function requireVertriebStaff(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .maybeSingle()
  const rolle = (p?.rolle as string | undefined) ?? ''
  return VERTRIEB_ROLLEN.includes(rolle) ? { id: user.id } : null
}

export type CreatePartnerLeadInput = {
  rolle: string
  firma: string
  ansprechpartner_vorname?: string
  ansprechpartner_nachname?: string
  email: string
  telefon?: string
  plz?: string
  ort?: string
  rollen_details?: Record<string, unknown>
}

export async function createPartnerLead(
  input: CreatePartnerLeadInput,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Prospects anlegen.' }

  const rolle = (input.rolle ?? '').trim()
  const firma = (input.firma ?? '').trim()
  const email = (input.email ?? '').trim().toLowerCase()

  if (!PARTNER_ROLLEN.includes(rolle as PartnerRolle)) {
    return { ok: false, error: 'Bitte eine gültige Rolle wählen (SV, Werkstatt oder Makler).' }
  }
  if (!firma) {
    return { ok: false, error: 'Firma ist ein Pflichtfeld.' }
  }
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
  }

  // Geocoding (best-effort): Fehler brechen den Insert NICHT (Lead nie verlieren).
  const plz = (input.plz ?? '').trim() || null
  const ort = (input.ort ?? '').trim() || null
  // createPartnerLead hat kein strasse-Feld im Input-Typ → undefined (helper behandelt das).
  let geoFields: { lat?: number; lng?: number; google_place_id?: string | null } = {}
  try {
    const geo = await geocodePartnerLead({ plz, ort })
    if (geo.ok) {
      geoFields = { lat: geo.lat, lng: geo.lng, google_place_id: geo.place_id }
    }
  } catch (geoErr) {
    console.error('[createPartnerLead] Geocoding fehlgeschlagen (non-critical):', geoErr)
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('partner_leads')
    .insert({
      rolle,
      status: 'neu',
      source_channel: 'admin',
      firma,
      ansprechpartner_vorname: (input.ansprechpartner_vorname ?? '').trim() || null,
      ansprechpartner_nachname: (input.ansprechpartner_nachname ?? '').trim() || null,
      email,
      telefon: (input.telefon ?? '').trim() || null,
      plz,
      ort,
      rollen_details: input.rollen_details ?? {},
      zugewiesen_an: staff.id,
      ...geoFields,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner-leads')
  return { ok: true, id: data.id as string }
}

export type UpdatePartnerLeadInput = {
  status?: string
  zugewiesen_an?: string | null
  notiz?: string | null
  einstufung?: string | null
  email?: string | null
  telefon?: string | null
  ansprechpartner_vorname?: string | null
  ansprechpartner_nachname?: string | null
  ansprechpartner_position?: string | null
  ansprechpartner_email?: string | null
  ansprechpartner_telefon?: string | null
}

export async function updatePartnerLead(
  id: string,
  patch: UpdatePartnerLeadInput,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Prospects bearbeiten.' }

  const admin = createAdminClient()

  // Ist-Stand laden (nur fuer Auto-Log-Diff bei status/einstufung noetig).
  const { data: vorher, error: loadErr } = await admin
    .from('partner_leads')
    .select('status, einstufung')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!vorher) return { ok: false, error: 'Prospect nicht gefunden.' }

  const updates: Record<string, unknown> = { aktualisiert_am: new Date().toISOString() }

  if (patch.status !== undefined) {
    if (!STATUS_WERTE.includes(patch.status)) {
      return { ok: false, error: 'Ungültiger Status.' }
    }
    updates.status = patch.status
  }
  if (patch.einstufung !== undefined) {
    if (patch.einstufung !== null && !EINSTUFUNG_WERTE.includes(patch.einstufung)) {
      return { ok: false, error: 'Ungültige Einstufung.' }
    }
    updates.einstufung = patch.einstufung || null
  }
  if (patch.zugewiesen_an !== undefined) {
    updates.zugewiesen_an = patch.zugewiesen_an || null
  }
  if (patch.notiz !== undefined) {
    updates.notiz = (patch.notiz ?? '').trim() || null
  }
  if (patch.email !== undefined) {
    const email = (patch.email ?? '').trim().toLowerCase()
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return { ok: false, error: 'Bitte eine gültige E-Mail-Adresse angeben.' }
    }
    updates.email = email || null
  }
  if (patch.telefon !== undefined) {
    updates.telefon = (patch.telefon ?? '').trim() || null
  }
  if (patch.ansprechpartner_vorname !== undefined) {
    updates.ansprechpartner_vorname = (patch.ansprechpartner_vorname ?? '').trim() || null
  }
  if (patch.ansprechpartner_nachname !== undefined) {
    updates.ansprechpartner_nachname = (patch.ansprechpartner_nachname ?? '').trim() || null
  }
  if (patch.ansprechpartner_position !== undefined) {
    updates.ansprechpartner_position = (patch.ansprechpartner_position ?? '').trim() || null
  }
  if (patch.ansprechpartner_email !== undefined) {
    updates.ansprechpartner_email = (patch.ansprechpartner_email ?? '').trim() || null
  }
  if (patch.ansprechpartner_telefon !== undefined) {
    updates.ansprechpartner_telefon = (patch.ansprechpartner_telefon ?? '').trim() || null
  }

  const { error } = await admin.from('partner_leads').update(updates).eq('id', id)
  if (error) return { ok: false, error: error.message }

  // Auto-Log: Status- bzw. Einstufungs-Wechsel als Aktivitaet festhalten (Historie).
  // Non-critical: ein Log-Fehler bricht den Status-Update nicht (try/catch, AGENTS
  // §Server-Actions — atomarer Status-Write hat Vorrang).
  const autoLogs: { typ: string; text: string }[] = []
  const altStatus = (vorher.status as string | null) ?? null
  if (patch.status !== undefined && patch.status !== altStatus) {
    autoLogs.push({
      typ: 'status_aenderung',
      text: `Status: ${STATUS_LABEL[altStatus ?? ''] ?? altStatus ?? '—'} → ${STATUS_LABEL[patch.status] ?? patch.status}`,
    })
  }
  const altEinstufung = (vorher.einstufung as string | null) ?? null
  const neuEinstufung = patch.einstufung || null
  if (patch.einstufung !== undefined && neuEinstufung !== altEinstufung) {
    autoLogs.push({
      typ: 'einstufung',
      text: `Einstufung: ${altEinstufung ? EINSTUFUNG_LABEL[altEinstufung] : 'uneingestuft'} → ${neuEinstufung ? EINSTUFUNG_LABEL[neuEinstufung] : 'uneingestuft'}`,
    })
  }
  if (autoLogs.length > 0) {
    try {
      const { error: logErr } = await admin.from('partner_lead_aktivitaeten').insert(
        autoLogs.map((l) => ({
          partner_lead_id: id,
          typ: l.typ,
          text: l.text,
          erstellt_von: staff.id,
        })),
      )
      if (logErr) console.error('[updatePartnerLead] Auto-Log fehlgeschlagen (non-fatal):', logErr.message)
    } catch (err) {
      console.error('[updatePartnerLead] Auto-Log-Insert warf (non-fatal):', err)
    }
  }

  revalidatePath('/admin/partner-leads')
  return { ok: true }
}

/**
 * Protokolliert eine manuelle Aktivitaet (Anruf/Notiz/E-Mail/Sonstiges) zum Lead.
 * status_aenderung/einstufung sind hier bewusst NICHT erlaubt — die entstehen
 * ausschliesslich via Auto-Log in updatePartnerLead.
 */
export async function protokolliereAktivitaet(
  leadId: string,
  typ: string,
  text: string,
): Promise<{ ok: boolean; error?: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Aktivitäten protokollieren.' }

  if (!AKTIVITAET_TYP_MANUELL.includes(typ)) {
    return { ok: false, error: 'Ungültiger Aktivitätstyp.' }
  }
  const trimmed = (text ?? '').trim()
  if (!trimmed) {
    return { ok: false, error: 'Bitte einen Text eingeben.' }
  }

  const admin = createAdminClient()
  const { error } = await admin.from('partner_lead_aktivitaeten').insert({
    partner_lead_id: leadId,
    typ,
    text: trimmed,
    erstellt_von: staff.id,
  })
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner-leads')
  return { ok: true }
}

export async function konvertierePartnerLead(
  id: string,
): Promise<{ ok: true; userId: string; partnerId: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf konvertieren.' }

  // Convert-Guard: convertPartnerLead → anlegePartnerKern legt einen Auth-User an
  // und braucht dafuer zwingend eine E-Mail (die 62 DAT-Import-Leads haben keine).
  // Fehlt sie, hier frueh abbrechen statt in der Account-Anlage zu scheitern.
  const admin = createAdminClient()
  const { data: lead, error: loadErr } = await admin
    .from('partner_leads')
    .select('rolle, firma, ansprechpartner_vorname, email')
    .eq('id', id)
    .maybeSingle()
  if (loadErr) return { ok: false, error: loadErr.message }
  if (!lead) return { ok: false, error: 'Prospect nicht gefunden.' }
  const email = (lead.email as string | null)?.trim()
  if (!email) {
    return { ok: false, error: 'E-Mail fehlt — bitte erst Kontakt ergänzen, dann konvertieren.' }
  }

  const result = await convertPartnerLead(id, { durchUserId: staff.id })
  if (!result.ok) return { ok: false, error: result.error }

  // Login-/Willkommens-Mail an den frisch konvertierten Partner (best-effort, non-critical).
  // Ohne sie haette der neue Account zwar Random-PW + force_password_change, aber KEINEN
  // Weg hinein. Die rollen-spezifischen Welcome-Flows generieren jeweils selbst einen
  // Recovery-Magic-Link (Passwort-Setzen). Ein Send-Fehler bricht die Konvertierung nicht.
  try {
    const rolle = lead.rolle as string
    const firma = ((lead.firma as string | null) ?? '').trim()
    const vorname = ((lead.ansprechpartner_vorname as string | null) ?? '').trim()
    if (rolle === 'makler') {
      const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'https://claimondo.de'
      await sendMaklerWelcome({ to: email, firma, vorname, landeseiteUrl: base })
    } else if (rolle === 'werkstatt') {
      await sendWillkommenWerkstatt({ to: email, werkstattName: firma })
    } else if (rolle === 'sachverstaendiger') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
      const { data: linkData } = await admin.auth.admin.generateLink({
        type: 'recovery',
        email,
        options: { redirectTo: `${appUrl}/passwort-zuruecksetzen` },
      })
      const actionUrl = linkData?.properties?.action_link
      if (actionUrl) await sendSvBasicClaimLink({ to: email, vorname: vorname || null, actionUrl })
    }
  } catch (err) {
    console.error('[konvertierePartnerLead] Login-Willkommens-Mail fehlgeschlagen (non-critical):', err)
  }

  // Onboarding-Drip enrollen (non-critical) — werkstaetten.status='aktiv' ist bereits ueber
  // convertPartnerLead -> anlegePartnerKern gesetzt. Nur fuer rolle=werkstatt relevant;
  // idempotent (DB-UNIQUE werkstatt_id), ein Fehler hier darf die Konvertierung nicht brechen.
  if (lead.rolle === 'werkstatt') {
    try {
      const { enrolleWerkstatt } = await import('@/lib/werkstatt-onboarding/enroll')
      await enrolleWerkstatt(admin, result.partnerId)
    } catch (e) {
      console.error('[enroll] werkstatt-onboarding', e)
    }
  }

  revalidatePath('/admin/partner-leads')
  return { ok: true, userId: result.userId, partnerId: result.partnerId }
}

/**
 * Bulk-Import geparster CSV-Leads fuer EINE Rolle (Slice C). Die Zeilen werden
 * clientseitig aus dem CSV gemappt (mapCsvZuLeads) und hier nur noch validiert +
 * gebuendelt eingefuegt. status='neu', source_channel='csv_import', einstufung=null,
 * zugewiesen_an=staff.id. E-Mail wird (falls vorhanden) auf lowercase normalisiert
 * und leer → null. Zeilen ohne firma werden defensiv verworfen (Client filtert
 * bereits, aber der Server vertraut dem Input nicht).
 */
export async function importCsvLeads(
  rolle: string,
  leads: PartnerCsvLead[],
): Promise<{ ok: true; angelegt: number } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf importieren.' }

  const r = (rolle ?? '').trim()
  if (!PARTNER_ROLLEN.includes(r as PartnerRolle)) {
    return { ok: false, error: 'Bitte eine gültige Rolle wählen (SV, Werkstatt oder Makler).' }
  }
  if (!Array.isArray(leads) || leads.length === 0) {
    return { ok: false, error: 'Keine importierbaren Zeilen gefunden.' }
  }

  const validLeads = leads.filter((l) => (l?.firma ?? '').trim().length > 0)

  if (validLeads.length === 0) {
    return { ok: false, error: 'Keine gültigen Zeilen (Firma fehlt überall).' }
  }

  // Geocoding mit Concurrency-Limit 5 (Google-Rate-Limit vermeiden).
  // Best-effort: Fehler je Row brechen den Import NICHT — Lead ohne Koordinaten anlegen.
  const CONCURRENCY = 5
  const geoResults: Array<{ lat?: number; lng?: number; google_place_id?: string | null }> =
    new Array(validLeads.length).fill({})
  for (let i = 0; i < validLeads.length; i += CONCURRENCY) {
    const batch = validLeads.slice(i, i + CONCURRENCY)
    const batchGeo = await Promise.all(
      batch.map(async (l) => {
        try {
          const geo = await geocodePartnerLead({
            // PartnerCsvLead hat kein strasse-Feld → undefined (helper akzeptiert null/undefined).
            plz: (l.plz ?? '').trim() || null,
            ort: (l.ort ?? '').trim() || null,
          })
          if (geo.ok) return { lat: geo.lat, lng: geo.lng, google_place_id: geo.place_id }
        } catch (geoErr) {
          console.error('[importCsvLeads] Geocoding-Fehler (non-critical):', geoErr)
        }
        return {}
      }),
    )
    batchGeo.forEach((g, j) => {
      geoResults[i + j] = g
    })
  }

  const rows = validLeads.map((l, idx) => {
    const email = (l.email ?? '').trim().toLowerCase()
    return {
      rolle: r,
      status: 'neu',
      source_channel: 'csv_import',
      einstufung: null,
      firma: l.firma.trim(),
      ansprechpartner_vorname: (l.ansprechpartner_vorname ?? '').trim() || null,
      ansprechpartner_nachname: (l.ansprechpartner_nachname ?? '').trim() || null,
      email: email || null,
      telefon: (l.telefon ?? '').trim() || null,
      plz: (l.plz ?? '').trim() || null,
      ort: (l.ort ?? '').trim() || null,
      rollen_details: l.rollen_details ?? {},
      zugewiesen_an: staff.id,
      ...geoResults[idx],
    }
  })

  const admin = createAdminClient()
  const { data, error } = await admin.from('partner_leads').insert(rows).select('id')
  if (error) return { ok: false, error: error.message }

  revalidatePath('/admin/partner-leads')
  return { ok: true, angelegt: data?.length ?? rows.length }
}

// ─── CSV-Mapping-Vorschlag (KI + Heuristik-Fallback) ──────────────────────

/**
 * Schlaegt ein Spalten-Mapping fuer einen CSV-Import vor. Nutzt das LLM
 * (claude haiku) wenn ANTHROPIC_API_KEY gesetzt ist; faellt deterministisch
 * auf die Header-Alias-Heuristik zurueck (kein harter Fehler).
 *
 * @param header   Erste Zeile der CSV (Spaltennamen).
 * @param sampleRows  Bis zu 5 Datenzeilen zur Kontextualisierung des LLM.
 * @returns { ok: true, mapping, quelle } oder { ok: false, error }.
 */
export async function schlageCsvMappingVor(
  header: string[],
  sampleRows: string[][],
): Promise<
  | { ok: true; mapping: CsvZielFeld[]; quelle: 'ki' | 'heuristik' }
  | { ok: false; error: string }
> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Mapping-Vorschlaege anfragen.' }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return { ok: true, mapping: heuristischesMapping(header), quelle: 'heuristik' }
  }

  try {
    const anthropic = new Anthropic({ apiKey })
    const zielFelderListe = [...CSV_ZIEL_FELDER].join(',')
    const systemPrompt =
      `Ordne jeden CSV-Header genau EINEM Zielfeld aus [${zielFelderListe}] zu. ` +
      'datNr = DAT-Expert-Nummer (Sachverstaendige), ihk = IHK-Registrierungsnummer (Makler). ' +
      'Unklar → ignorieren. Antworte NUR mit JSON {header:zielfeld}.'

    const userContent =
      'Header: ' +
      JSON.stringify(header) +
      '\nBeispielzeilen: ' +
      JSON.stringify(sampleRows.slice(0, 5))

    const resp = await anthropic.messages.create({
      model: AI_MODELS.faq_bot_kunde, // Haiku 4.5 — kurze strukturierte Antwort, Speed > Qualitaet
      max_tokens: 1024,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }],
    })

    // Ersten Text-Block aus der Antwort extrahieren.
    const textBlock = resp.content.find((b) => b.type === 'text')
    const llmText = textBlock?.type === 'text' ? textBlock.text : ''

    // Usage loggen (fire-and-forget, kein fallId-Kontext hier).
    void logAiUsage({
      endpoint: 'partner_csv_mapping',
      model: AI_MODELS.faq_bot_kunde,
      fallId: null,
      usage: resp.usage,
    })

    const parsed = parseLlmMapping(llmText, header)
    const mapping = parsed ?? heuristischesMapping(header)
    return { ok: true, mapping, quelle: 'ki' }
  } catch (err) {
    console.error('[schlageCsvMappingVor] LLM-Fehler (Heuristik-Fallback):', err)
    return { ok: true, mapping: heuristischesMapping(header), quelle: 'heuristik' }
  }
}

// ─── Lead-Scraping (Google Places) ─────────────────────────────────────────

/** Laedt den Bestand (partner_leads einer Rolle) im Minimal-Shape fuer die Dubletten-Pruefung. */
async function ladeBestandsLeads(rolle: string): Promise<BestandsLead[]> {
  const admin = createAdminClient()
  const { data } = await admin
    .from('partner_leads')
    .select('firma, telefon, plz, rollen_details')
    .eq('rolle', rolle)
  return (data ?? []).map((row) => ({
    firma: (row.firma as string | null) ?? null,
    telefon: (row.telefon as string | null) ?? null,
    plz: (row.plz as string | null) ?? null,
    google_place_id:
      (row.rollen_details as { google_place_id?: string } | null)?.google_place_id ?? null,
  }))
}

/**
 * Scraping-Vorschau: findet Prospects via Google Places, filtert Dubletten gegen
 * den Bestand (partner_leads derselben Rolle) heraus und liefert die NEUEN
 * Kandidaten zur Bestaetigung zurueck (KEIN Insert). Aaron: Vorschau + Dubletten filtern.
 */
export async function scrapePartnerLeadsVorschau(
  rolle: string,
  region: string,
  limit: number,
): Promise<
  | { ok: true; neu: ScrapeKandidat[]; dublettenCount: number; gefunden: number }
  | { ok: false; error: string }
> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur das Vertriebs-Team darf Leads scrapen.' }

  const r = (rolle ?? '').trim()
  if (!PARTNER_ROLLEN.includes(r as PartnerRolle)) {
    return { ok: false, error: 'Bitte eine gültige Rolle wählen (SV, Werkstatt oder Makler).' }
  }

  const scrape = await scrapeGooglePlaces({ rolle: r as PartnerRolle, region, limit })
  if (!scrape.ok) return scrape

  // Dedup gegen Leads UND Bestands-Partner derselben Rolle (Aaron: "keine Dupes").
  const [bestandLeads, bestandPartner] = await Promise.all([ladeBestandsLeads(r), ladeBestandsPartner(r)])
  const bestehende = [...bestandLeads, ...bestandPartner]
  const { neu, dubletten } = filterGegenBestand(scrape.kandidaten, bestehende)
  return { ok: true, neu, dublettenCount: dubletten.length, gefunden: scrape.kandidaten.length }
}

/**
 * Importiert bestaetigte (ggf. bearbeitete) Scraping-Kandidaten als partner_leads.
 * Re-filtert Dubletten gegen den AKTUELLEN Bestand (Race-Sicherheit zwischen Vorschau
 * und Bestaetigung) + Batch-Dedup. status='neu', source_channel='scraping',
 * einstufung=null (muessen eingestuft werden), zugewiesen_an=staff.
 */
export async function importScrapedLeads(
  rolle: string,
  kandidaten: ScrapeKandidat[],
): Promise<
  | { ok: true; angelegt: number; uebersprungen: number; angereichert: number; aufgenommen: number }
  | { ok: false; error: string }
> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur das Vertriebs-Team darf importieren.' }

  const r = (rolle ?? '').trim()
  if (!PARTNER_ROLLEN.includes(r as PartnerRolle)) {
    return { ok: false, error: 'Bitte eine gültige Rolle wählen.' }
  }
  if (!Array.isArray(kandidaten) || kandidaten.length === 0) {
    return { ok: false, error: 'Keine Kandidaten zum Importieren.' }
  }

  // Re-Dedup gegen aktuellen Bestand (Race Vorschau→Import) + innerhalb der Auswahl.
  // Dedup gegen Leads UND Bestands-Partner derselben Rolle (Aaron: "keine Dupes").
  const [bestandLeads, bestandPartner] = await Promise.all([ladeBestandsLeads(r), ladeBestandsPartner(r)])
  const bestehende = [...bestandLeads, ...bestandPartner]
  const { neu } = filterGegenBestand(kandidaten, bestehende)
  const zuAnlegen = dedupeInBatch(neu).filter((k) => (k.firma ?? '').trim().length > 0)
  const uebersprungen = kandidaten.length - zuAnlegen.length
  if (zuAnlegen.length === 0) {
    return { ok: false, error: 'Alle ausgewählten Kandidaten sind bereits vorhanden (Dubletten).' }
  }

  // Geocoding mit Concurrency-Limit 5 (best-effort — ScrapeKandidat hat kein lat/lng).
  const SCRAPE_CONCURRENCY = 5
  const scrapeGeoResults: Array<{ lat?: number; lng?: number; google_place_id?: string | null }> =
    new Array(zuAnlegen.length).fill({})
  for (let i = 0; i < zuAnlegen.length; i += SCRAPE_CONCURRENCY) {
    const batch = zuAnlegen.slice(i, i + SCRAPE_CONCURRENCY)
    const batchGeo = await Promise.all(
      batch.map(async (k) => {
        try {
          const geo = await geocodePartnerLead({
            strasse: k.strasse,
            plz: (k.plz ?? '').trim() || null,
            ort: (k.ort ?? '').trim() || null,
          })
          if (geo.ok) return { lat: geo.lat, lng: geo.lng, google_place_id: geo.place_id }
        } catch (geoErr) {
          console.error('[importScrapedLeads] Geocoding-Fehler (non-critical):', geoErr)
        }
        return {}
      }),
    )
    batchGeo.forEach((g, j) => {
      scrapeGeoResults[i + j] = g
    })
  }

  // Auto-Anreicherung (Aaron: "ich moechte dass die Leads angereichert ankommen ... ich
  // moechte sie nicht manuell anreichern muessen"): Ansprechpartner + Kontakt aus dem
  // Impressum/Kontakt der Firmen-Website ziehen, damit ein frisch gescrapter Lead SOFORT
  // anschreibbar ist. Ohne das hat kein Lead eine ansprechpartner_email -> der Cold-Mailer
  // haette niemanden zum Anschreiben (auf prod belegt: 0 von 63 Leads hatten eine).
  //
  // Best-effort, exakt wie das Geocoding daneben: schlaegt die Anreicherung fehl (keine
  // Website, Timeout, kein Impressum), wird der Lead TROTZDEM angelegt — nur ohne
  // Ansprechpartner. Der manuelle "Von Website anreichern"-Button bleibt als Fallback.
  const anreicherungen: Array<LeadEnrichment | null> = new Array(zuAnlegen.length).fill(null)
  for (let i = 0; i < zuAnlegen.length; i += SCRAPE_CONCURRENCY) {
    const batch = zuAnlegen.slice(i, i + SCRAPE_CONCURRENCY)
    const batchEnr = await Promise.all(
      batch.map(async (k) => {
        if (!k.website) return null // ohne Website kein Impressum
        try {
          return await reichereAusWebsite(k.website, k.firma)
        } catch (enrErr) {
          console.error('[importScrapedLeads] Anreicherung fehlgeschlagen (non-critical):', enrErr)
          return null
        }
      }),
    )
    batchEnr.forEach((e, j) => {
      anreicherungen[i + j] = e
    })
  }
  const angereichert = anreicherungen.filter((e) => e?.email || e?.vorname || e?.nachname).length

  const rows = zuAnlegen.map((k, idx) => ({
    rolle: r,
    status: 'neu',
    source_channel: 'scraping',
    einstufung: null,
    firma: k.firma.trim(),
    telefon: (k.telefon ?? '').trim() || null,
    plz: (k.plz ?? '').trim() || null,
    ort: (k.ort ?? '').trim() || null,
    strasse: k.strasse ?? null,
    // Aus dem Impressum gezogen (best-effort) — leer, wenn keine Website/kein Treffer.
    ansprechpartner_vorname: anreicherungen[idx]?.vorname ?? null,
    ansprechpartner_nachname: anreicherungen[idx]?.nachname ?? null,
    ansprechpartner_position: anreicherungen[idx]?.position ?? null,
    ansprechpartner_email: anreicherungen[idx]?.email ?? null,
    ansprechpartner_telefon: anreicherungen[idx]?.telefon ?? null,
    rollen_details: {
      google_place_id: k.google_place_id,
      website: k.website ?? null,
      strasse: k.strasse ?? null,
      quelle: 'google_places',
    },
    zugewiesen_an: staff.id,
    ...scrapeGeoResults[idx],
  }))

  const admin = createAdminClient()
  const { data, error } = await admin.from('partner_leads').insert(rows).select('id')
  if (error) return { ok: false, error: error.message }

  // Auto-Aufnahme in die Sequenz (Spec §6): existiert fuer diese Rolle eine AKTIVE
  // Sequenz mit auto_enroll, landen die frisch importierten Leads sofort darin — sonst
  // muesste man jeden Lead von Hand aufnehmen und der Cold-Mailer liefe faktisch nie an.
  // Damit schliesst sich die Kette: scrapen -> anreichern -> aufnehmen -> Sequenz sendet.
  //
  // Bewusst ueber enrolleLeads() statt eigener Insert-Logik: dort haengen die Gates
  // (keine Email / abgemeldet / schon drin) — die duerfen hier nicht umgangen werden.
  // Best-effort: scheitert die Aufnahme, sind die Leads trotzdem angelegt.
  let aufgenommen = 0
  const neueIds = (data ?? []).map((z) => z.id as string)
  if (neueIds.length > 0) {
    try {
      const { data: seq } = await admin
        .from('cold_mail_sequenzen')
        .select('id')
        .eq('rolle', r)
        .eq('aktiv', true)
        .eq('auto_enroll', true)
        .maybeSingle()
      if (seq) {
        const enr = await enrolleLeads(neueIds, seq.id as string)
        if (enr.ok) aufgenommen = enr.aufgenommen
      }
    } catch (enrErr) {
      console.error('[importScrapedLeads] Auto-Aufnahme fehlgeschlagen (non-critical):', enrErr)
    }
  }

  revalidatePath('/admin/partner-leads')
  return {
    ok: true,
    angelegt: data?.length ?? rows.length,
    uebersprungen,
    angereichert,
    aufgenommen,
  }
}

export async function legePartnerOnboardingTermin(
  leadId: string,
  input: OnboardingTerminInput,
): Promise<{ ok: true; warnung?: string } | { ok: false; error: string }> {
  const staff = await requireVertriebStaff()
  if (!staff) return { ok: false, error: 'Nur Vertriebs-Team darf Termine anlegen.' }

  const kanal = input.kanal
  if (kanal !== 'online' && kanal !== 'vor_ort') {
    return { ok: false, error: 'Bitte einen Kanal wählen (online oder vor Ort).' }
  }

  // Kern (Termin + Meet + Einladung + Log) ist nach lib/partner/beratungs-booking
  // extrahiert — geteilt mit der Prospect-Selbstbuchung (/beratung/[leadId]).
  // Host = Bearbeiter (Meet aus SEINEM verbundenen Google-Konto, wie bisher).
  const res = await erstellePartnerOnboardingTermin(createAdminClient(), {
    leadId,
    hostId: staff.id,
    erstelltVon: staff.id,
    startIso: input.startIso,
    kanal,
    treffpunktAdresse: input.treffpunktAdresse,
  })
  if (!res.ok) return res

  revalidatePath('/admin/partner-leads')
  return res.warnung ? { ok: true, warnung: res.warnung } : { ok: true }
}
