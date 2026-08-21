'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { upsertSvLead } from '@/lib/sv-leads/upsert'
import { importSvLeads } from '@/lib/sv-leads/bulk-import'
import { ladeSvLeadEinladung } from '@/lib/sv-leads/claim-einladung'
import { syncSvLeadsFromSource } from '@/lib/sv-leads/sources/sync'
import { datStubSource } from '@/lib/sv-leads/sources/dat-stub'
import { revalidatePath } from 'next/cache'
import type { SvLeadRow, SvLeadSeite } from './types'
import {
  ENTDECKT_QUELLEN,
  PRO_SEITE,
  leseFilter,
  seitenAnzahl,
  seitenBereich,
  sortierSpalte,
  suchAusdruck,
  type SvLeadFilter,
} from '@/lib/sv-leads/liste-filter'

/**
 * Die drei Filter-Methoden des Supabase-Query-Builders, die hier gebraucht
 * werden.
 *
 * ⚠ Nötig, weil dieselben Bedingungen auf ZWEI Abfragen angewandt werden
 * (Zählung und Zeilen) und deren Rückgabetypen sich unterscheiden. Ein
 * gemeinsamer Aufsatz hält beide zwingend gleich — driften sie auseinander,
 * zählt die Kopfzeile etwas anderes, als die Tabelle zeigt.
 */
type Filterbar = {
  in: (spalte: string, werte: string[]) => Filterbar
  or: (ausdruck: string) => Filterbar
  eq: (spalte: string, wert: string) => Filterbar
}

async function requireAdmin(): Promise<{ id: string } | null> {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null
  const { data: p } = await supabase.from('profiles').select('id, rolle').eq('id', user.id).single()
  return p?.rolle === 'admin' ? { id: user.id } : null
}

export async function createSvLead(
  formData: FormData,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen SV-Leads anlegen.' }

  const name = String(formData.get('name') ?? '').trim()
  const firma = String(formData.get('firma') ?? '').trim() || null
  const adresse = String(formData.get('adresse') ?? '').trim()
  const plz = String(formData.get('plz') ?? '').trim() || null
  const ort = String(formData.get('ort') ?? '').trim() || null
  const telefon = String(formData.get('telefon') ?? '').trim() || null
  const email = String(formData.get('email') ?? '').trim() || null
  const dat_expert_nr = String(formData.get('dat_expert_nr') ?? '').trim() || null
  const dat_id = String(formData.get('dat_id') ?? '').trim() || null

  const latRaw = formData.get('lat')
  const lngRaw = formData.get('lng')
  const lat = latRaw !== null && latRaw !== '' ? Number(latRaw) : NaN
  const lng = lngRaw !== null && lngRaw !== '' ? Number(lngRaw) : NaN

  const qualifikationenRaw = String(formData.get('qualifikationen') ?? '').trim()
  const qualifikationen = qualifikationenRaw
    ? qualifikationenRaw.split(',').map(q => q.trim()).filter(Boolean)
    : null

  const paketRaw = formData.get('paket_umkreis_km')
  const paket_umkreis_km =
    paketRaw !== null && paketRaw !== '' ? Number(paketRaw) : 15

  if (!name) {
    return { ok: false, error: 'Name ist ein Pflichtfeld.' }
  }
  if (!adresse || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { ok: false, error: 'Standort ist Pflicht — bitte Adresse über die Suche auswählen.' }
  }

  const result = await upsertSvLead({
    name,
    adresse,
    lat,
    lng,
    firma,
    plz,
    ort,
    telefon,
    email,
    dat_id: dat_id || null,
    dat_expert_nr,
    qualifikationen,
    paket_umkreis_km,
    quelle: 'admin',
    ist_aktiv: true,
  })

  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, id: result.id }
}

export async function importSvLeadsAction(csvText: string): Promise<
  | { ok: true; importiert: number; fehler: string[] }
  | { ok: false; error: string }
> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen SV-Leads importieren.' }

  const result = await importSvLeads(csvText)
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, importiert: result.importiert, fehler: result.fehler }
}

const SV_LEAD_SPALTEN =
  'id, name, firma, ort, plz, telefon, email, ist_aktiv, claim_status, ' +
  'konvertiert_zu_sv_id, quelle, aktualisiert_am, website_url, levelup_letzter_score'

const LEER: SvLeadSeite = { zeilen: [], gesamt: 0, seite: 1, seiten: 1, proSeite: PRO_SEITE }

/**
 * Eine Seite der SV-Leads — gefiltert, sortiert, gezählt.
 *
 * ⚠ Bis zum 21.08.2026 lud diese Funktion hart `.limit(200)` nach zuletzt
 * geändert, ohne Filter und ohne Gesamtzahl. Solange der Bestand aus 62
 * gepflegten Leads bestand, fiel das nicht auf. Nach dem Deutschland-Scrape
 * standen 4.644 Leads in der Tabelle — die Ansicht zeigte 200, davon 200 frisch
 * entdeckte und KEINEN der 62 gepflegten. Der Vertrieb sah seine eigene
 * Arbeitsliste nicht mehr, und nichts an der Oberfläche deutete darauf hin.
 *
 * ⭐ Der Fix ist nicht „Limit höher", sondern TRENNEN und ZÄHLEN: Filter je
 * Bestand, Suche, Blättern — und `gesamt` immer mitliefern, damit ein Deckel
 * nie wieder unsichtbar ist.
 *
 * Audit 2026-08-04: der Guard bleibt. Ein service-role-Read auf sv_leads-PII
 * war für jeden eingeloggten Nutzer als POST-Endpunkt erreichbar; ohne
 * Admin-Rolle gibt es eine leere Seite, keine Daten.
 */
export async function getSvLeads(filter: SvLeadFilter = leseFilter()): Promise<SvLeadSeite> {
  const gate = await requireAdmin()
  if (!gate) return LEER

  const admin = createAdminClient()

  /**
   * Die Bedingungen des Filters — einmal beschrieben, zweimal angewandt.
   *
   * ⚠ Erst ZÄHLEN, dann laden. Der Bereich einer Seite lässt sich ohne die
   * Gesamtzahl nicht klemmen: `?seite=999` lieferte sonst leere Zeilen, während
   * die Kopfzeile „Seite 93 von 93" behauptet — eine Ansicht, die sich selbst
   * widerspricht. Zwei Abfragen sind hier der ehrliche Weg; die erste holt mit
   * `head: true` nur die Zahl, keine Daten.
   */
  const mitFilter = <T>(q: T): T => {
    let a = q as unknown as Filterbar

    if (filter.bestand === 'entdeckt') {
      a = a.in('quelle', [...ENTDECKT_QUELLEN])
    } else if (filter.bestand === 'gepflegt') {
      // ⚠ `.not('quelle','in',…)` allein verwirft Zeilen mit `quelle IS NULL` —
      // in SQL ist `NULL NOT IN (…)` niemals wahr. Ein handgepflegter Lead ohne
      // Quellenangabe verschwände damit aus genau der Liste, für die er gedacht
      // ist. Deshalb der ODER-Zweig auf NULL.
      a = a.or(`quelle.is.null,quelle.not.in.(${ENTDECKT_QUELLEN.join(',')})`)
    }

    if (filter.status) a = a.eq('claim_status', filter.status)

    const suche = suchAusdruck(filter.suche)
    if (suche) a = a.or(suche)

    return a as unknown as T
  }

  const { count, error: zaehlFehler } = await mitFilter(
    admin.from('sv_leads').select('id', { count: 'exact', head: true }),
  )

  if (zaehlFehler) {
    console.error('[getSvLeads] Zaehlung fehlgeschlagen:', zaehlFehler.message)
    return LEER
  }

  const gesamt = count ?? 0
  const { von, bis, seite } = seitenBereich(filter.seite, gesamt)
  const { spalte, aufsteigend } = sortierSpalte(filter.sortierung)

  const { data, error } = await mitFilter(admin.from('sv_leads').select(SV_LEAD_SPALTEN))
    // ⚠ `nullsFirst: false` — ein Lead OHNE Score ist nicht der mit dem größten
    // Nachholbedarf, sondern der ungemessene. Er gehört ans Ende, sonst füllen
    // tausende ungemessene Betriebe die erste Seite der Score-Sortierung.
    .order(spalte, { ascending: aufsteigend, nullsFirst: false })
    // Zweitschlüssel: ohne ihn ist die Reihenfolge bei gleichem Wert
    // undefiniert, und dieselbe Zeile kann auf zwei Seiten erscheinen — oder
    // auf keiner.
    .order('id', { ascending: true })
    .range(von, bis)

  if (error) {
    console.error('[getSvLeads] Fehler beim Laden:', error.message)
    return LEER
  }

  return {
    zeilen: (data ?? []) as unknown as SvLeadRow[],
    gesamt,
    seite,
    seiten: seitenAnzahl(gesamt),
    proSeite: PRO_SEITE,
  }
}

/**
 * Wie viele Leads es je Bestand gibt — für die Umschalter der Liste.
 *
 * ⚠ Eigene Abfrage mit `head: true`: es werden nur die Zahlen geholt, keine
 * Zeilen. Ohne diese Zahlen wüsste niemand, dass hinter „Entdeckt" 4.582
 * Betriebe liegen — und genau diese Unkenntnis war das Problem.
 */
export async function zaehleSvLeads(): Promise<{ gepflegt: number; entdeckt: number }> {
  const gate = await requireAdmin()
  if (!gate) return { gepflegt: 0, entdeckt: 0 }

  const admin = createAdminClient()
  const liste = ENTDECKT_QUELLEN.join(',')

  const [entdeckt, gepflegt] = await Promise.all([
    admin.from('sv_leads').select('id', { count: 'exact', head: true })
      .in('quelle', [...ENTDECKT_QUELLEN]),
    admin.from('sv_leads').select('id', { count: 'exact', head: true })
      .or(`quelle.is.null,quelle.not.in.(${liste})`),
  ])

  if (entdeckt.error) console.error('[zaehleSvLeads] entdeckt:', entdeckt.error.message)
  if (gepflegt.error) console.error('[zaehleSvLeads] gepflegt:', gepflegt.error.message)

  return { gepflegt: gepflegt.count ?? 0, entdeckt: entdeckt.count ?? 0 }
}

// ─── Task 6: Claim-Einladung (Admin-only, kein Auto-Send) ────────────────────

export async function sendeSvLeadEinladung(
  leadId: string,
): Promise<{ ok: true; gesendet: boolean } | { ok: false; error: string }> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Einladungen senden.' }

  const result = await ladeSvLeadEinladung(leadId)
  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return result
}

// ─── Task 7: DAT-Sync-Trigger (Admin-only) ──────────────────────────────────

export async function datSyncAusfuehren(): Promise<
  | { ok: true; importiert: number; fehler: string[] }
  | { ok: false; error: string }
> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen den DAT-Sync auslösen.' }

  const result = await syncSvLeadsFromSource(datStubSource)
  if (!result.ok) return { ok: false, error: result.error }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, importiert: result.importiert, fehler: result.fehler }
}

export async function sendeAlleOffenenEinladungen(): Promise<
  { ok: true; gesendet: number; uebersprungen: number } | { ok: false; error: string }
> {
  const adminUser = await requireAdmin()
  if (!adminUser) return { ok: false, error: 'Nur Admins dürfen Einladungen senden.' }

  const admin = createAdminClient()
  // Alle offenen Leads mit mindestens einem Kontaktweg laden
  const { data, error } = await admin
    .from('sv_leads')
    .select('id, telefon, email')
    .eq('claim_status', 'offen')
    .is('konvertiert_zu_sv_id', null)
    .or('telefon.not.is.null,email.not.is.null')
    .order('aktualisiert_am', { ascending: false })
    .limit(500)

  if (error) {
    return { ok: false, error: 'Laden der Leads fehlgeschlagen: ' + error.message }
  }

  const leads = (data ?? []) as { id: string; telefon: string | null; email: string | null }[]

  let gesendet = 0
  let uebersprungen = 0

  for (const lead of leads) {
    const result = await ladeSvLeadEinladung(lead.id)
    if (result.ok && result.gesendet) {
      gesendet++
    } else {
      uebersprungen++
    }
  }

  revalidatePath('/admin/vertrieb/sachverstaendige/leads')
  return { ok: true, gesendet, uebersprungen }
}
