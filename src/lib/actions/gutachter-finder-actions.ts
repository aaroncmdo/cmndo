'use server'

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { revalidatePath } from 'next/cache'
import { checkAndCacheAvailability } from '@/lib/whatsapp/availability'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import { istInterneIdentitaet } from '@/lib/testdaten/interne-identitaet'
import { getConsentedGaClientId, trackServerConversion, buildSaSignedEvent } from '@/lib/analytics/ga4-conversions'
import { getPartnerRangBatch } from '@/lib/partner-rang/get'
import { herkunftAusRequest } from '@/lib/analytics/herkunft'
import { ladeZahlendeSvSet } from '@/lib/netzwerk/entitlement'
import type { Tier } from '@/lib/partner-rang/types'

// Privacy-by-default: nur Geokoordinaten + ID. Tier-3 sv_leads (Excel-Import,
// keine Pakete, keine Reviews) sind auf der Marketing-Karte komplett
// anonymisierte Dead-Pins — keine Firma, keine Adresse, keine Kontaktdaten,
// kein Vorname dürfen auf den anonymen Client.
export type SvLeadPublic = {
  id: string
  lat: number
  lng: number
}

// Tier-1 SVs (sachverstaendige). 2026-06-02 (Aaron "die Profile sollen public
// sein"): JEDER verifizierte, aktive SV (RLS-gegated auf verifiziert+map_ready)
// bekommt ein klickbares anonymes Profil-Popup (Sterne, Specs, Region, Initiale)
// — nicht mehr nur paket='standard'. `paket` bleibt im Typ für künftige
// Differenzierung. Felder werden für alle zurückgegebenen Zeilen befüllt.
export type AktiverSVPublic = {
  id: string
  standort_lat: number
  standort_lng: number
  /** Optional: die Loader-Ausgabe hat es immer, der Finder-Client-Payload strippt es
   * aber (die Union wird server-seitig vorberechnet -> page.tsx). Siehe FinderMap. */
  isochrone_polygon?: unknown
  paket: string
  vorname_initiale: string | null
  /** Vorname des SV — NUR bei aktiven, verifizierten Partnern öffentlich gezeigt (Aaron 12.06.).
   * Kein Nachname. Dead-Pins (sv_leads) bleiben anonym (eigener DeadPinProfilePopup). */
  vorname: string | null
  /** AAR-369: Selbstgeschriebener Profiltext (Bio) — oeffentliches Trust-Signal. */
  profilbeschreibung: string | null
  stadt: string | null
  // Anonyme Trust-Signale (Profil-Anreicherung, AAR-956 WS2-Glass). KEINE Identitaet:
  // gutachter_typ + Umkreis + Qualifikationen + Specs + Schadenarten + Credential-
  // Presence. KEIN Firmenname/Adresse/Kontakt/Mitglieds-NUMMER/Kammer.
  gutachter_typ: string | null
  umkreis_km: number | null
  qualifikationen: string[]
  spezifikationen_top3: string[]
  spezifikationen_alle: string[]
  schadenarten: string[]
  oeffentlich_bestellt: boolean
  mitgliedschaften: string[]
  bewertungs_durchschnitt: number | null
  bewertungs_anzahl: number | null
  /** Partner-Tier-Rang (Bronze/Silber/Gold) aus partner_rang; null = kein oeffentlicher Rang. */
  rang: Tier | null
  /** Komponenten-ehrlicher Sinnsatz zum Rang (nie eine Fallzahl). */
  rangSinnsatz: string | null
  /** 13b: zahlender Netzwerkpartner (Abo-Praedikat). Global-Badge auf der Finder-Karte/Popup.
   *  Ueberlebt den coverageUnion-Trim (page.tsx strippt nur isochrone_polygon). */
  istNetzwerkpartner: boolean
  /** P2-T7 (K11, relational): Freund des INJIZIERTEN Owners UND zahlend. Ohne Owner-Injektion
   *  (blanker anon-Finder) immer false. Getrennt vom globalen istNetzwerkpartner. */
  imNetzwerk: boolean
}

export type GutachterFinderPayload = {
  vorname: string
  nachname: string
  email: string
  telefon?: string
  kennzeichen?: string
  fahrzeug_beschreibung?: string
  schadentyp: string
  schadenort?: string
  schadenort_lat?: number
  schadenort_lng?: number
  wunschtermin?: string
  zugeordneter_sv_id?: string
  zugeordneter_sv_lead_id?: string
  matching_typ?: string
  sa_signatur_data_url?: string
  // Z35-Wahl: vollstaendig (Anwalt + alle Positionen) vs. nur_gutachten (Selbst-Regulierung)
  regulierungs_modus?: 'vollstaendig' | 'nur_gutachten'
  // Aaron 10.05.: Vor-Ort-Routing am Funnel-Anfang. JA-Pfad fuehrt in Foto-Wizard
  // statt klassischer Termin-Buchung.
  am_unfallort_flag?: boolean
  aufnahme_fotos?: string[] // Base64-Data-URLs aus dem Foto-Wizard
  // AAR-956 Werkstatt: vermittelnde Werkstatt (QR-Einstieg), fliesst gfa->lead->claim.
  werkstatt_id?: string | null
  // Anspruch-pruefen: Session-ID der Schaetzung (Fotos + Inputs), wird beim Promoter auf Lead uebertragen.
  schaetzung_session_id?: string | null
  // Anspruch-pruefen (Aaron 04.07.): Erstzulassungs-Jahr nativ auf die GFA, damit die EZ
  // ueber gfa.fahrzeug_baujahr -> lead.fahrzeug_baujahr -> vehicles kanonisch mitfliesst
  // (2. Pfad neben dem anspruch_schaetzungen-Side-Lookup in issue-canonical-flowlink).
  fahrzeug_baujahr?: number | null
}

// Extrahiert die Stadt aus einer typischen Adresse:
//   "Schützenstraße 68-70, 42853 Remscheid" → "Remscheid"
//   "Mediapark 5, 50670 Köln" → "Köln"
// Privacy-Note: Stadt ist anonym genug (Köln hat 200+ Gutachter). Straße +
// Hausnummer kämen NICHT zum Client — die liegen nur in der Server-Action.
function extractStadt(adresse: string | null | undefined): string | null {
  if (!adresse) return null
  const match = adresse.match(/,\s*\d{5}\s+(.+?)$/)
  if (match?.[1]) return match[1].trim()
  // Fallback: letzter Komma-Teil, PLZ-Prefix abschneiden
  const parts = adresse.split(',').map((p) => p.trim()).filter(Boolean)
  if (parts.length > 0) return parts[parts.length - 1].replace(/^\d{5}\s+/, '')
  return null
}

function firstInitial(name: string | null | undefined): string | null {
  if (!name) return null
  const trimmed = name.trim()
  return trimmed.length > 0 ? trimmed.charAt(0).toUpperCase() : null
}

export async function ladeSvLeads(): Promise<{ ok: true; data: SvLeadPublic[] } | { ok: false; error: string }> {
  // Privacy: sv_leads sind Tier-3 Excel-Importe ohne Pakete. Auf der Karte
  // erscheinen sie als Dead-Pins ohne Popup — wir reichen daher KEINE
  // identifizierenden Felder raus (kein name, firma, adresse, telefon, email).
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('sv_leads')
    .select('id,lat,lng')
    .eq('ist_aktiv', true)
  if (error) return { ok: false, error: error.message }
  return { ok: true, data: data as SvLeadPublic[] }
}

export async function ladeAktiveSVs(
  // P2-T7 (K11): Owner wird INJIZIERT (Attribution: Makler-/Werkstatt-Einstieg), nie
  // session-abgeleitet — der anon-Finder hat keinen auth-Owner. Ohne Owner kein
  // relationaler Boost (nur das globale istNetzwerkpartner-Badge).
  opts?: { ownerProfilId?: string | null },
): Promise<{ ok: true; data: AktiverSVPublic[] } | { ok: false; error: string }> {
  // Read 1 (Service-Role, AAR-956): Geo + paket + spezifikationen. Test-/Demo-Accounts
  // filtert jetzt das kanonische ist_testaccount-Flag DIREKT in der Query (Befund #6 /
  // #3438) — kein firmenname-Read + keine App-seitige ILIKE-Heuristik mehr.
  //
  // AAR-956 (05.07.): Läuft über den Service-Role-Client mit EXPLIZITEM map-ready-
  // Filter statt über den RLS-Client. Grund: die map-ready-Sichtbarkeit war per RLS
  // NUR an `anon` gegrantet (sachverstaendige_anon_select_map_ready). Ein eingeloggter
  // Nicht-Admin (Kunde/Makler/Werkstatt/Kanzlei/fremder SV) bekam die restriktive
  // authenticated-Policy (admin/dispatch ODER eigene Zeile) → 0 Partner auf der Karte
  // + Route/Abdeckung brach ab. Service-Role ist auth-unabhängig (anon, Kunde, Admin
  // sehen dieselbe öffentliche Menge). Read 2 nutzt ohnehin schon Service-Role; die
  // Privacy-Grenze ist die Projektion unten (kein Firmenname/Adresse/Kontakt verlässt
  // die Function), NICHT die DB-Rolle. Das explizite Prädikat spiegelt die anon-RLS-
  // Policy `sachverstaendige_anon_select_map_ready` 1:1 → anon-Ergebnis unverändert.
  const admin = createAdminClient()
  const { data: allRows, error } = await admin
    .from('sachverstaendige')
    .select('id,paket,profile_id,standort_lat,standort_lng,standort_adresse,spezifikationen,isochrone_polygon')
    .eq('verifiziert', true)
    .eq('ist_aktiv', true)
    .eq('portal_zugang_freigeschaltet', true)
    .eq('ist_testaccount', false)
    .is('geloescht_am', null)
    .is('gesperrt_seit', null)
    .not('standort_lat', 'is', null)
    .not('standort_lng', 'is', null)
    .not('isochrone_polygon', 'is', null)
  if (error) {
    console.error('[ladeAktiveSVs] Partner-Read fehlgeschlagen:', error.message)
    return { ok: false, error: error.message }
  }
  const rows = allRows ?? []
  if (rows.length === 0) return { ok: true, data: [] }

  // Read 2 (Service-Role): Vorname-Initiale + Google-Reviews + Profil-Anreicherung.
  // profiles + google_bewertungen_cache sind anon-RLS-blocked; die Anreicherungs-
  // Spalten auf sachverstaendige (qualifikationen_neu, schadenarten, paket_umkreis_km,
  // gutachter_typ, Credential-Flags) sind NICHT in den 9 anon-Grants. Wir lesen ALLES
  // intern via Service-Role NUR für die bereits anon-gegateten Zeilen (Read 1 = RLS-
  // gefiltert auf verifiziert+ist_aktiv+map_ready) und projizieren ausschliesslich
  // anonyme Trust-Signale (kein Firmenname/Adresse/Kontakt/Mitglieds-Nummer/Kammer).
  const profilRows = rows.filter((r) => r.profile_id)
  const profileIds = Array.from(new Set(profilRows.map((r) => r.profile_id as string)))
  const svIds = rows.map((r) => r.id as string)

  const vornameByProfileId = new Map<string, string | null>()
  // AAR-369: Anzeigename (Vorrang vor Vorname) + Profiltext (Bio) fuer den Finder.
  const anzeigenameByProfileId = new Map<string, string | null>()
  const beschreibungByProfileId = new Map<string, string | null>()
  const bewertungByProfileId = new Map<string, { durchschnitt: number; anzahl: number }>()
  type SvEnrich = {
    gutachter_typ: string | null
    umkreis_km: number | null
    qualifikationen: string[]
    schadenarten: string[]
    oeffentlich_bestellt: boolean
    mitgliedschaften: string[]
  }
  const enrichBySvId = new Map<string, SvEnrich>()

  // `admin` (Service-Role) wird bereits in Read 1 erzeugt und hier wiederverwendet.
  const [profilesRes, bewRes, enrichRes, rangBySvId, zahlendeSvSet] = await Promise.all([
    admin.from('profiles').select('id,vorname,anzeigename,profilbeschreibung').in('id', profileIds),
    admin
      .from('google_bewertungen_cache')
      .select('profile_id,durchschnitt,anzahl_bewertungen')
      .in('profile_id', profileIds),
    admin
      .from('sachverstaendige')
      .select(
        'id,gutachter_typ,paket_umkreis_km,qualifikationen_neu,schadenarten,oeffentlich_bestellt,bvsk_mitgliedsnummer,ihk_zertifikat_nummer,oebuv_bestellungsnummer,dat_nummer',
      )
      .in('id', svIds),
    // AAR-956 Partner-Tier: verdienter Rang je SV (partner_rang, cron-berechnet).
    getPartnerRangBatch(admin, 'sachverstaendiger', svIds),
    // 13b (K10): Netzwerkpartner-Abo-Praedikat fuers Badge, EIN Batch fuer alle Kandidaten.
    ladeZahlendeSvSet(admin, svIds),
  ])
  if (profilesRes.data) {
    for (const p of profilesRes.data as Array<{ id: string; vorname: string | null; anzeigename: string | null; profilbeschreibung: string | null }>) {
      vornameByProfileId.set(p.id, p.vorname)
      anzeigenameByProfileId.set(p.id, p.anzeigename ?? null)
      beschreibungByProfileId.set(p.id, p.profilbeschreibung ?? null)
    }
  }
  if (bewRes.data) {
    for (const b of bewRes.data) {
      bewertungByProfileId.set(b.profile_id, {
        durchschnitt: Number(b.durchschnitt),
        anzahl: b.anzahl_bewertungen ?? 0,
      })
    }
  }
  if (enrichRes.data) {
    for (const e of enrichRes.data) {
      const mitgliedschaften: string[] = []
      if (e.bvsk_mitgliedsnummer) mitgliedschaften.push('BVSK')
      if (e.ihk_zertifikat_nummer) mitgliedschaften.push('IHK')
      if (e.oebuv_bestellungsnummer) mitgliedschaften.push('öbuv')
      if (e.dat_nummer) mitgliedschaften.push('DAT')
      enrichBySvId.set(e.id, {
        gutachter_typ: e.gutachter_typ ?? null,
        umkreis_km: e.paket_umkreis_km ?? null,
        qualifikationen: Array.isArray(e.qualifikationen_neu) ? (e.qualifikationen_neu as string[]) : [],
        schadenarten: Array.isArray(e.schadenarten) ? (e.schadenarten as string[]) : [],
        oeffentlich_bestellt: e.oeffentlich_bestellt === true,
        mitgliedschaften,
      })
    }
  }

  // P2-T7 (K11): relationaler Boost NUR bei injiziertem Owner. Freund-SVs (sachverstaendige.id)
  // des Owners, geschnitten mit den zahlenden (Gate immer am SV). zahlendeSvSet kommt aus dem
  // Batch oben — hier nur EIN zusaetzlicher Freund-Read (K10). v1-Realitaet: Makler sind kein
  // Graph-Knoten -> ein Makler-Owner hat 0 Freunde -> imNetzwerk bleibt ueberall false (Seam
  // korrekt, aber inert, bis Werkstatt-/Flotte-Attributionen injiziert werden).
  let netzSet = new Set<string>()
  if (opts?.ownerProfilId) {
    const { ladeFreundKandidatIds } = await import('@/lib/netzwerk/freunde')
    const freundSvIds = await ladeFreundKandidatIds(admin, opts.ownerProfilId, 'gutachter')
    netzSet = new Set([...freundSvIds].filter((id) => zahlendeSvSet.has(id)))
  }

  const mapped: AktiverSVPublic[] = rows.map((r) => {
    const profileId = r.profile_id as string | null
    const vorname = profileId ? vornameByProfileId.get(profileId) ?? null : null
    // AAR-369: Anzeigename hat Vorrang vor Vorname fuer die oeffentliche Anzeige.
    const anzeigeName = (profileId ? anzeigenameByProfileId.get(profileId) ?? null : null) || vorname
    const bew = profileId ? bewertungByProfileId.get(profileId) : undefined
    const specsAll = Array.isArray(r.spezifikationen) ? (r.spezifikationen as string[]) : []
    const enrich = enrichBySvId.get(r.id as string)
    return {
      id: r.id,
      standort_lat: Number(r.standort_lat),
      standort_lng: Number(r.standort_lng),
      isochrone_polygon: r.isochrone_polygon,
      paket: r.paket,
      vorname_initiale: firstInitial(anzeigeName),
      vorname: (anzeigeName ?? '').trim() || null,
      stadt: extractStadt(r.standort_adresse as string | null),
      gutachter_typ: enrich?.gutachter_typ ?? null,
      umkreis_km: enrich?.umkreis_km ?? null,
      qualifikationen: enrich?.qualifikationen ?? [],
      spezifikationen_top3: specsAll.slice(0, 3),
      spezifikationen_alle: specsAll,
      schadenarten: enrich?.schadenarten ?? [],
      oeffentlich_bestellt: enrich?.oeffentlich_bestellt ?? false,
      mitgliedschaften: enrich?.mitgliedschaften ?? [],
      bewertungs_durchschnitt: bew ? bew.durchschnitt : null,
      bewertungs_anzahl: bew ? bew.anzahl : null,
      profilbeschreibung: profileId ? beschreibungByProfileId.get(profileId) ?? null : null,
      rang: rangBySvId.get(r.id as string)?.tier ?? null,
      rangSinnsatz: rangBySvId.get(r.id as string)?.sinnsatz ?? null,
      istNetzwerkpartner: zahlendeSvSet.has(r.id as string),
      imNetzwerk: netzSet.has(r.id as string),
    }
  })

  return { ok: true, data: mapped }
}

export async function erstelleGutachterFinderAnfrage(
  payload: GutachterFinderPayload,
): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  // SERVICE-ROLE fuer den gfa-Insert (wie insertAnfrage / gfa-handler). Einziger Aufrufer ist
  // reserviereEmbedTermin (/embed/gutachter-finder + werkstatt-finder-Embed, ANON). Der PII-Leak-Fix
  // (Mig 20260716200848) entzog anon das SELECT-Grant auf gutachter_finder_anfragen -> das
  // .insert(...).select('id') unten (RETURNING) endet fuer anon in "permission denied for table"
  // (42501) -> der Embed-Finder nahm keine Anfragen mehr an. source bleibt NULL (nativer Finder),
  // die anon-INSERT-with_check (source IS NULL) wird damit weiterhin erfuellt.
  const supabase = createAdminClient()

  // GA4-Conversion-Attribution: client_id aus _ga-Cookie (nur bei Consent).
  const gaClientId = await getConsentedGaClientId()

  // Welche SEITE hat die Anfrage gebracht? Bis 21.08.2026 wusste das niemand:
  // von 44 Anfragen trug **eine** eine `page_url`, keine einzige ein utm_*.
  // Die Spalten gibt es seit ihrer Migration — sie wurden nur nie gesetzt.
  // Datensparsam: nur origin+pathname und die fuenf UTM-Parameter, alle uebrigen
  // Query-Parameter werden verworfen (s. lib/analytics/herkunft.ts).
  // ⚠ `source` bleibt bewusst ungesetzt — s. den RLS-Hinweis oben.
  const herkunft = await herkunftAusRequest()

  const { data, error } = await supabase
    .from('gutachter_finder_anfragen')
    .insert({
      ga_client_id: gaClientId,
      ...herkunft,
      vorname: payload.vorname,
      nachname: payload.nachname,
      email: payload.email,
      telefon: payload.telefon ?? null,
      kennzeichen: payload.kennzeichen ?? null,
      fahrzeug_beschreibung: payload.fahrzeug_beschreibung ?? null,
      schadentyp: payload.schadentyp,
      schadenort: payload.schadenort ?? null,
      schadenort_lat: payload.schadenort_lat ?? null,
      schadenort_lng: payload.schadenort_lng ?? null,
      wunschtermin: payload.wunschtermin ?? null,
      zugeordneter_sv_id: payload.zugeordneter_sv_id ?? null,
      zugeordneter_sv_lead_id: payload.zugeordneter_sv_lead_id ?? null,
      matching_typ: payload.matching_typ ?? null,
      sa_signatur_data_url: payload.sa_signatur_data_url ?? null,
      sa_unterzeichnet_am: payload.sa_signatur_data_url ? new Date().toISOString() : null,
      regulierungs_modus: payload.regulierungs_modus ?? null,
      am_unfallort_flag: payload.am_unfallort_flag ?? false,
      aufnahme_fotos: payload.aufnahme_fotos && payload.aufnahme_fotos.length > 0
        ? payload.aufnahme_fotos
        : null,
      aufgenommen_am: payload.aufnahme_fotos && payload.aufnahme_fotos.length > 0
        ? new Date().toISOString()
        : null,
      status: 'neu',
      werkstatt_id: payload.werkstatt_id ?? null,
      schaetzung_session_id: payload.schaetzung_session_id ?? null,
      fahrzeug_baujahr: payload.fahrzeug_baujahr ?? null,
    })
    .select('id')
    .single()

  if (error) return { ok: false, error: error.message }

  const anfrageId = data.id

  // Send-Isolation (interne-identitaet.ts): interne/Test-Anfragen (@claimondo.de, Test-Marker im
  // Namen/Email) loesen KEINEN Dispatch-Task + KEINE Team-WhatsApp aus — sonst spammen die
  // Gruender-Live-Tests das Team (dokumentierter Dauer-Fall). Der gfa/Lead entsteht trotzdem,
  // der Buchungspfad bleibt e2e-testbar.
  const intern = istInterneIdentitaet(payload.email, `${payload.vorname} ${payload.nachname}`)

  // GA4-Conversions (fire-and-forget, consent-respektierend via gaClientId).
  // generate_lead immer; sa_signed wenn die SA direkt im Wizard unterzeichnet wurde.
  void trackServerConversion(gaClientId, { name: 'generate_lead', params: { source: 'gutachter_finder' } })
  if (payload.sa_signatur_data_url) {
    // anfrageId als transaction_id → Ads-Bestell-ID-Dedup. alreadySigned=false:
    // jeder GF-Submit ist eine NEUE Anfrage (kein Re-Entry derselben Entity wie im
    // Flow-Pfad), daher quellseitig nichts zu gaten — der Helper vereinheitlicht nur
    // Event-Shape + transaction_id mit dem Flow-Pfad.
    const saEvent = buildSaSignedEvent({ alreadySigned: false, leadId: anfrageId, source: 'gutachter_finder' })
    if (saEvent) void trackServerConversion(gaClientId, saEvent)
  }

  // WhatsApp-Verfügbarkeit prüfen + cachen (fire-and-forget — VPS-PM2,
  // kein Vercel-Cold-Kill-Risiko). Ergebnis landet in
  // gutachter_finder_anfragen.whatsapp_* — Dispatch sieht im Detail-View
  // ob WA-Send möglich ist bevor er den SV anruft.
  if (payload.telefon) {
    void checkAndCacheAvailability('gfa', anfrageId, payload.telefon).catch((err) => {
      console.error('[whatsapp-check] gfa failed:', err)
    })
  }

  // Dispatch-Task: alle dispatch/admin-User informieren dass ein SV angerufen werden muss
  try {
    const admin = createAdminClient()

    // SV-Name ermitteln für den Task-Text
    let svName = 'Unbekannt'
    let svTelefon: string | null = null

    if (payload.zugeordneter_sv_id) {
      const { data: sv } = await admin
        .from('sachverstaendige')
        .select('firmenname, profiles!sachverstaendige_profile_id_fkey(anzeigename, telefon)')
        .eq('id', payload.zugeordneter_sv_id)
        .single()
      if (sv) {
        const profil = Array.isArray(sv.profiles) ? sv.profiles[0] : sv.profiles
        svName = sv.firmenname ?? (profil as { anzeigename?: string } | null)?.anzeigename ?? 'SV'
        svTelefon = (profil as { telefon?: string } | null)?.telefon ?? null
      }
    } else if (payload.zugeordneter_sv_lead_id) {
      const { data: lead } = await admin
        .from('sv_leads')
        .select('name, telefon')
        .eq('id', payload.zugeordneter_sv_lead_id)
        .single()
      if (lead) {
        svName = lead.name
        svTelefon = lead.telefon
      }
    }

    const wunschterminText = payload.wunschtermin
      ? new Date(payload.wunschtermin).toLocaleString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : 'kein Termin'

    const taskInhalt = [
      `Kunde: ${payload.vorname} ${payload.nachname}`,
      `Schaden: ${payload.schadentyp}`,
      `Wunschtermin: ${wunschterminText}`,
      svTelefon ? `SV-Tel.: ${svTelefon}` : null,
      payload.sa_signatur_data_url ? '✓ SA unterzeichnet' : '⚠ SA noch nicht unterzeichnet',
    ]
      .filter(Boolean)
      .join(' · ')

    // Alle Dispatch-User laden und Task-Mitteilung senden
    const { data: dispatchUser } = await admin
      .from('profiles')
      .select('id')
      .eq('rolle', 'dispatch')

    const mitteilungen = (dispatchUser ?? []).map((u: { id: string }) => ({
      empfaenger_id: u.id,
      empfaenger_rolle: 'dispatch' as const,
      kategorie: 'anruf' as const,
      titel: `SV anrufen: ${svName} — Gutachter-Finder Buchung`,
      inhalt: taskInhalt,
      kontext_typ: null,
      kontext_id: null,
      route_url: `/dispatch/gutachter-finder/${anfrageId}`,
      prioritaet: 'hoch' as const,
      icon: '📞',
    }))

    if (mitteilungen.length > 0 && !intern) {
      await admin.from('mitteilungen').insert(mitteilungen)
    }
  } catch (taskErr) {
    console.error('[GutachterFinder] Dispatch-Task fehlgeschlagen:', taskErr)
  }

  // AAR-956 16.06. (Aaron): Team-WhatsApp bei jeder Gutachter-Finder-Anfrage
  // (Baileys -> Team-Nummern, dieselbe Quelle wie Lead-/Reservierungs-Notify).
  // Non-critical — wirft nie, der gfa-Insert steht bereits.
  try {
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const name = `${payload.vorname} ${payload.nachname}`.trim() || 'Kunde'
    const wann = payload.wunschtermin
      ? new Date(payload.wunschtermin).toLocaleString('de-DE', {
          weekday: 'short', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
        })
      : 'kein Wunschtermin'
    const teamText = [
      '🆕 Neue Anfrage (Gutachter-Finder)',
      '',
      `👤 ${name}`,
      payload.telefon ? `📞 ${payload.telefon}` : null,
      `🔧 Schaden: ${payload.schadentyp}`,
      `🗓️ ${wann}`,
      '',
      `${base}/dispatch/gutachter-finder/${anfrageId}`,
    ]
      .filter(Boolean)
      .join('\n')
    if (!intern) await notifyTeamWhatsApp(teamText)
  } catch (waErr) {
    console.error('[AAR-956] Team-WA (Gutachter-Finder) fehlgeschlagen:', waErr)
  }

  revalidatePath('/admin/faelle')
  revalidatePath('/dispatch/dashboard')
  return { ok: true, id: anfrageId }
}
