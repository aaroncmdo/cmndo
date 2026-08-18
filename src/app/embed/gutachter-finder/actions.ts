'use server'

// AAR-956 WS4 — Embed-Buchungs-Kern. Step-2/3-Submit des Finder-Wizards:
//   gfa anlegen (anon, source=NULL → passt gfa_insert_public-RLS)
//   → issueCanonicalFlowLinkForAnfrage(send:false) promotet gfa→lead→flow_link → token
//   → der Wizard reicht den token an <FlowSlotStep> (Inline-Termin via Engine).
//
// WICHTIG (Aaron 11.06.): der Besichtigungsort (wo steht das Auto) wird ZUERST
// abgefragt und MUSS in die Anfrage/DB, damit die Engine den SV findet. Wir
// schreiben ihn auf gfa.schadenort_lat/lng + schadenort; issueCanonical mappt das
// auf lead.fahrzeug_standort_lat/lng → ladeMatchingFlow hat die Koordinaten →
// Engine-Matching ohne ort_abfragen-Umweg.
//
// KEIN /api/anfrage-from-lp (cross-origin/origin-gated, Monikas Revier) — der
// Embed ist same-origin und nutzt den nativen Anon-Pfad.

import { erstelleGutachterFinderAnfrage } from '@/lib/actions/gutachter-finder-actions'
import { issueCanonicalFlowLinkForAnfrage } from '@/lib/start-link/issue-canonical-flowlink'
import { resolvePromoCodeToId } from '@/lib/makler/resolve-promo-code'
import {
  planeTerminMitFallback,
  ladeDeadPinFallback,
  bucheDeadPinTermin,
  type SlotVorschlag,
  type PlaneTerminMitFallbackResult,
} from '@/lib/sv-matching-modul'
import { baueWunschzeitOption, istWunschzeitFrei } from '@/lib/sv-matching-modul/wunschzeit-optionen'
import { bucheTerminFlow } from '@/app/flow/[token]/self-service-actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { istInterneIdentitaet } from '@/lib/testdaten/interne-identitaet'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'
import { upsertReservierungsRueckruf } from '@/lib/embed/reservierungs-rueckruf'

export type EmbedBuchungInput = {
  vorname: string
  nachname: string
  telefon: string
  email: string
  schadentyp: string
  ort: { adresse: string; lat: number; lng: number }
  /** Wunschtermin (UTC-ISO) — wird auf die gfa/Lead geschrieben, damit der Dispatcher (Lead-
   * Owner) die gewünschte Zeit sieht (Request-Modell, Aaron 12.06.). */
  wunschterminIso?: string | null
  /** AAR-956 (Aaron 14.06.): gewählter Gutachter wird auf die gfa mitgereicht — Partner →
   * zugeordneter_sv_id, Dead-Pin → zugeordneter_sv_lead_id; matching_typ = 'partner'|'deadpin'.
   * Damit sieht der Dispatcher den SV direkt auf der gfa/Lead (nicht nur über den Termin). */
  zugeordneter_sv_id?: string | null
  zugeordneter_sv_lead_id?: string | null
  matching_typ?: string | null
  werkstatt_id?: string | null
  /** Anspruch-pruefen: Session-ID der Schaetzung (Fotos + Inputs), wird beim Promoter auf Lead uebertragen. */
  schaetzungSessionId?: string | null
}

export async function starteEmbedBuchung(
  input: EmbedBuchungInput,
): Promise<{ ok: true; token: string; anfrageId: string } | { ok: false; error: string }> {
  // Blocker 1 fix: schaetzungSessionId is the session_token (anon-visible), but
  // gutachter_finder_anfragen.schaetzung_session_id is a FK to anspruch_schaetzungen(id).
  // Resolve token -> row id here using service-role (anspruch_schaetzungen is RLS deny-all).
  let schaetzungId: string | null = null
  let ezJahr: number | null = null
  if (input.schaetzungSessionId) {
    const svc = createAdminClient()
    const { data: sess } = await svc
      .from('anspruch_schaetzungen')
      .select('id, ez_jahr')
      .eq('session_token', input.schaetzungSessionId)
      .maybeSingle()
    schaetzungId = sess?.id ?? null
    ezJahr = sess?.ez_jahr ?? null
  }

  // 1) gfa (Anfrage) anlegen — Ort landet auf schadenort_* (→ lead.fahrzeug_standort_*).
  const gfa = await erstelleGutachterFinderAnfrage({
    vorname: input.vorname,
    nachname: input.nachname,
    email: input.email,
    telefon: input.telefon,
    schadentyp: input.schadentyp,
    schadenort: input.ort.adresse,
    schadenort_lat: input.ort.lat,
    schadenort_lng: input.ort.lng,
    wunschtermin: input.wunschterminIso ?? undefined,
    // AAR-956 (Aaron 14.06.): gewählten Gutachter mitreichen → gfa.zugeordneter_sv_(lead_)id.
    zugeordneter_sv_id: input.zugeordneter_sv_id ?? undefined,
    zugeordneter_sv_lead_id: input.zugeordneter_sv_lead_id ?? undefined,
    matching_typ: input.matching_typ ?? undefined,
    werkstatt_id: input.werkstatt_id ?? undefined,
    // Use the resolved row id (not the session_token) — FK to anspruch_schaetzungen(id).
    schaetzung_session_id: schaetzungId,
    // Harden EZ carry (Aaron 04.07.): EZ-Jahr nativ auf die GFA -> gfa.fahrzeug_baujahr ->
    // lead.fahrzeug_baujahr -> vehicles (2. kanonischer Pfad neben dem Session-Side-Lookup).
    fahrzeug_baujahr: ezJahr ?? undefined,
  })
  if (!gfa.ok) return { ok: false, error: gfa.error }

  // 2) gfa → lead → flow_link (Service-Role, idempotent). send:true = der Kunde bekommt seinen
  //    Flowlink per WhatsApp (Aaron 27.07.: „der Kunde soll seinen Flowlink wieder per WhatsApp
  //    bekommen" — Reversal der 14.06.-Ruecknahme). Der Kunde bucht zwar inline via FlowSlotStep
  //    weiter, bekommt den Magic-Link aber zusaetzlich als Rueckkehr-/Beleg-Link (WA→SMS→Email).
  const issued = await issueCanonicalFlowLinkForAnfrage(gfa.id, { send: true })
  if (!issued.ok) return { ok: false, error: issued.error }

  // AAR-956 16.06. (Aaron): anfrageId mit zurueckgeben → reserviereEmbedTermin kann
  // gfa.termin_id eindeutig setzen (Anfrage↔Termin als eigene Datenquelle).
  return { ok: true, token: issued.token, anfrageId: gfa.id }
}

/**
 * AAR-956 Reorder (Aaron 12.06.): Termin-Wahl ist jetzt Schritt 2 (vor den Kontaktdaten) —
 * also TOKEN-LOS. Liefert das diskriminierte Engine-Matching NUR aus dem Besichtigungsort
 * (planeTerminMitFallback: Partner mit Slots ODER Dead-Pin-Fallback). Der Nutzer waehlt hier
 * einen Slot; die echte Reservierung passiert erst beim Kontakt-Submit (reserviereEmbedTermin).
 * `wunschterminLokal` (Aaron 12.06.: „der Kunde soll oben seinen Wunschtermin angeben") ist die
 * Berlin-Wall-Clock aus dem <input type="datetime-local"> — wird DST-sicher zu UTC konvertiert und
 * an die Engine gereicht; sie rankt die Partner-Slots danach (matchType 'wunschtermin' → Badge).
 * `forceFallback` (?fallback=1) erzwingt den Dead-Pin-Pfad (Test).
 */
export async function ladeEmbedMatching(input: {
  lat: number
  lng: number
  wunschterminLokal?: string | null
  forceFallback?: boolean
  /** Relationaler Owner-Boost (Ebene 2): profiles.id des attribuierenden Owners (z.B. Werkstatt-
   *  Einstieg /start/werkstatt/[id]). Gesetzt → dessen zahlende Freund-SVs ranken oben. null = keiner. */
  ownerProfilId?: string | null
}): Promise<PlaneTerminMitFallbackResult> {
  try {
    if (typeof input?.lat !== 'number' || typeof input?.lng !== 'number') return { kind: 'fallback', deadPins: [] }
    // Wunschtermin (Berlin-Wall-Clock „YYYY-MM-DDTHH:MM") → UTC-Instant für die Engine.
    let wunschterminIso: string | null = null
    if (input.wunschterminLokal) {
      try {
        wunschterminIso = berlinWallClockToUtc(input.wunschterminLokal)
      } catch {
        wunschterminIso = null
      }
    }
    // Request-Modell (Aaron 12.06.) — korrigiert nach dem Ops-Test 11.08. (RC-1):
    // Der Kunde darf eine Wunschzeit ANFRAGEN, aber die ECHTEN Engine-Slots bleiben
    // fuehrend. Vorher ersetzte ein synthetisches Zeit-Tripel (Wunschstunde +/-2h/+/-4h)
    // die Engine-Slots komplett — ohne Belegung, Arbeitszeit oder Raster. Ergebnis im
    // Test: 12:00 wurde als frei angeboten, obwohl der SV um 12:30 belegt war; die
    // Engine lehnte danach korrekt ab, der Kunde bekam trotzdem "Termin reserviert".
    // Jetzt: die Wunschzeit kommt NUR dazu, wenn sie gegen v_belegung frei ist, und
    // traegt matchType 'wunschtermin_anfrage' (UI: "auf Anfrage", kein Slot-Versprechen).
    const wunschOption = baueWunschzeitOption(input.wunschterminLokal ?? null)

    const mitWunschAnfrage = async <T extends { svId: string; slots: SlotVorschlag[] }>(
      items: T[],
    ): Promise<T[]> => {
      if (!wunschOption) return items
      return Promise.all(
        items.map(async (it) => {
          if (!(await istWunschzeitFrei(it.svId, wunschOption))) return it
          // Deckt sich die Anfrage mit einem echten Raster-Slot, gewinnt der echte Slot.
          if (it.slots.some((s) => s.start === wunschOption.start)) return it
          const anfrage: SlotVorschlag = {
            start: wunschOption.start,
            end: wunschOption.end,
            matchType: 'wunschtermin_anfrage',
          }
          return { ...it, slots: [anfrage, ...it.slots] }
        }),
      )
    }

    // Dead-Pins (unclaimte sv_leads) haben keinen verbundenen Kalender — ihre Verfuegbarkeit
    // ist nicht pruefbar. Sie bekommen daher KEINE Wunsch-Anfrage-Option; ihre generischen
    // Zeiten bleiben und werden UI-seitig als Anfrage beschriftet.
    if (input.forceFallback) {
      const deadPins = await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
      return { kind: 'fallback', deadPins }
    }
    const res = await planeTerminMitFallback({ lat: input.lat, lng: input.lng, wunschterminIso, ownerProfilId: input.ownerProfilId ?? null })
    if (res.kind === 'partner') return { kind: 'partner', svs: await mitWunschAnfrage(res.svs) }
    return { kind: 'fallback', deadPins: res.deadPins }
  } catch (err) {
    console.error('[ladeEmbedMatching] Matching fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return { kind: 'fallback', deadPins: [] }
  }
}

type EmbedDispatcher = { vorname: string; avatarUrl: string | null; beschreibung: string | null }
type EmbedGutachterProfil = {
  vorname: string
  avatarUrl: string | null
  firma: string | null
  googleDurchschnitt: number | null
  googleAnzahl: number | null
  googleAktualisiertAm: string | null
}

// AAR-956 (Aaron 16.06.): öffentliches Profil des gewählten Gutachters für die Danke-Seite —
// Foto/Name/Firma + Google-Bewertung (analog zum /flow-Lookup in page.tsx), per sv_id. Non-critical.
async function ladeGutachterProfil(svId: string): Promise<EmbedGutachterProfil | null> {
  try {
    const admin = createAdminClient()
    const { data: sv } = await admin
      .from('sachverstaendige')
      .select('profile_id, profiles!sachverstaendige_profile_id_fkey(vorname, avatar_url, firma)')
      .eq('id', svId)
      .maybeSingle()
    if (!sv) return null
    const profile = sv.profiles as
      | { vorname: string | null; avatar_url: string | null; firma: string | null }
      | { vorname: string | null; avatar_url: string | null; firma: string | null }[]
      | null
    const p = Array.isArray(profile) ? profile[0] : profile
    if (!p?.vorname) return null
    const svProfileId = sv.profile_id as string | null | undefined
    let googleDurchschnitt: number | null = null
    let googleAnzahl: number | null = null
    let googleAktualisiertAm: string | null = null
    if (svProfileId) {
      const { data: gb } = await admin
        .from('google_bewertungen_cache')
        .select('durchschnitt, anzahl_bewertungen, zuletzt_aktualisiert_am')
        .eq('profile_id', svProfileId)
        .maybeSingle()
      if (gb) {
        googleDurchschnitt = (gb.durchschnitt as number | null) ?? null
        googleAnzahl = (gb.anzahl_bewertungen as number | null) ?? null
        googleAktualisiertAm = (gb.zuletzt_aktualisiert_am as string | null) ?? null
      }
    }
    return {
      vorname: p.vorname,
      avatarUrl: (p.avatar_url ?? null) || null,
      firma: (p.firma ?? null) || null,
      googleDurchschnitt,
      googleAnzahl,
      googleAktualisiertAm,
    }
  } catch (err) {
    console.error('[ladeGutachterProfil] fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return null
  }
}

/**
 * Liefert das ÖFFENTLICHE Profil des dem Lead zugewiesenen Dispatchers (leads.zugewiesen_an →
 * profiles). Öffentlich (Danke-Seite, Aaron 12.06.): NUR der Vorname (kein Nachname) + das
 * Profilbild (avatar_url, public avatare-Bucket) + die Profilbeschreibung — alles in der DB
 * gespeichert + im Portal unter /mitarbeiter/profil editierbar (AvatarUpload + Profiltext). Der
 * Dispatcher wird bei der Lead-Erstellung Round-Robin gesetzt (issueCanonicalFlowLinkForAnfrage).
 */
async function ladeLeadDispatcher(token: string): Promise<EmbedDispatcher | null> {
  try {
    const admin = createAdminClient()
    const { data: fl } = await admin.from('flow_links').select('lead_id').eq('token', token).maybeSingle()
    const leadId = (fl?.lead_id as string | null) ?? null
    if (!leadId) return null
    const { data: lead } = await admin.from('leads').select('zugewiesen_an').eq('id', leadId).maybeSingle()
    const dispId = (lead?.zugewiesen_an as string | null) ?? null
    if (!dispId) return null
    const { data: p } = await admin
      .from('profiles')
      .select('vorname, avatar_url, profilbeschreibung')
      .eq('id', dispId)
      .maybeSingle()
    const vorname = ((p?.vorname as string | null) ?? '').trim()
    if (!vorname) return null
    return {
      vorname,
      avatarUrl: ((p?.avatar_url as string | null) ?? null) || null,
      beschreibung: (((p?.profilbeschreibung as string | null) ?? '').trim()) || null,
    }
  } catch (err) {
    console.error('[ladeLeadDispatcher] fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return null
  }
}

/**
 * AAR-956 Reorder + Request-Modell (Aaron 12.06.): finaler Submit (Kontakt = letzter Schritt).
 * Legt Lead+Token an (starteEmbedBuchung — der Lead bekommt via createLead einen Round-Robin-
 * Dispatcher als `zugewiesen_an`) und reserviert DANN den gewählten Termin — Partner
 * (bucheTerminFlow) oder Dead-Pin (bucheDeadPinTermin → dispatch_pending).
 *
 * `wunschterminLokal` gesetzt = Request-Modell: der Kunde hat eine konkrete Wunschzeit gewählt.
 * Sie wird auf die gfa/Lead geschrieben (Dispatcher sieht sie) und beim Partner als „weiche"
 * Reservierung versucht — schlägt die Kalender-Buchung fehl (SV zu der Zeit belegt), ist das KEIN
 * Fehler für den Kunden: Lead + Dispatcher + Wunschzeit + Bestätigung stehen, der Dispatcher
 * bestätigt die genaue Zeit. OHNE Wunschtermin (Verfügbarkeits-Modell, echter Slot) bleibt die
 * Buchung hart (Slot weg → Client wählt neu).
 *
 * `auswahl: null` = 0 Verfügbarkeit → nur Lead, Team koordiniert telefonisch.
 */
export async function reserviereEmbedTermin(input: {
  vorname: string
  nachname: string
  telefon: string
  email: string
  schadentyp: string
  ort: { adresse: string; lat: number; lng: number }
  wunschterminLokal?: string | null
  werkstatt_id?: string | null
  promotion_code_id?: string | null
  /** Makler-Code (`m`) aus der Funnel-URL — server-seitig zu promotion_code_id aufgeloest,
   * falls promotion_code_id nicht explizit gesetzt ist (Funnel Tool -> Finder). */
  maklerCode?: string | null
  schaetzungSessionId?: string | null
  auswahl:
    | { kind: 'partner'; svId: string; svVorname: string; start: string; end: string }
    | { kind: 'deadpin'; deadPinId: string; ort: string | null; start: string }
    | null
}): Promise<
  | {
      ok: true
      /** Ops-Test RC-1: true = es steht ein Termin in der DB. false = unbestaetigte Anfrage
       *  (Lead + Wunschzeit stehen, Dispatch bestaetigt). Der Consumer MUSS unterscheiden —
       *  vorher wurde ein fehlgeschlagener Buchungsversuch als Erfolg gemeldet. */
      bestaetigt: boolean
      token: string; leadId: string | null; svVorname: string | null; ortLabel: string | null
      startIso: string | null; dispatcher: EmbedDispatcher | null; gutachter: EmbedGutachterProfil | null
    }
  | { ok: false; error: string; slotWeg?: boolean }
> {
  // Wunschtermin (Berlin-Wall-Clock) → UTC-Instant für die gfa/Lead.
  let wunschterminIso: string | null = null
  if (input.wunschterminLokal) {
    try {
      wunschterminIso = berlinWallClockToUtc(input.wunschterminLokal)
    } catch {
      wunschterminIso = null
    }
  }
  const requestModus = wunschterminIso != null

  // Send-Isolation (interne-identitaet.ts): interne/Test-Bucher (@claimondo.de, Test-Marker) loesen
  // keine Team-/Dispatcher-Benachrichtigung (Rueckruf-Task, Kunde-/Team-WhatsApp) aus. Lead + Termin
  // entstehen trotzdem -> der Buchungspfad bleibt e2e-testbar, ohne echtes Personal zu stoeren.
  const intern = istInterneIdentitaet(input.email, `${input.vorname} ${input.nachname}`)

  // 1) Lead + Token (idempotent; Lead bekommt Round-Robin-Dispatcher + Flowlink-WA an den Kunden).
  const res = await starteEmbedBuchung({
    vorname: input.vorname,
    nachname: input.nachname,
    telefon: input.telefon,
    email: input.email,
    schadentyp: input.schadentyp,
    ort: input.ort,
    wunschterminIso,
    // AAR-956 (Aaron 14.06.): gewählten Gutachter aus der Auswahl mitreichen (Partner|Dead-Pin).
    zugeordneter_sv_id: input.auswahl?.kind === 'partner' ? input.auswahl.svId : null,
    zugeordneter_sv_lead_id: input.auswahl?.kind === 'deadpin' ? input.auswahl.deadPinId : null,
    matching_typ: input.auswahl?.kind ?? null,
    werkstatt_id: input.werkstatt_id ?? null,
    schaetzungSessionId: input.schaetzungSessionId ?? null,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const token = res.token
  const anfrageId = res.anfrageId

  // Dem Lead zugewiesener Dispatcher (für die Danke-Seite: Profil-Card + Anruf-Button).
  const dispatcher = await ladeLeadDispatcher(token)

  // lead_id für die Conversion-Dedupe (Transaction-ID im gf_anfrage_submit-Event) auflösen.
  let leadId: string | null = null
  try {
    const { data: flx } = await createAdminClient().from('flow_links').select('lead_id').eq('token', token).maybeSingle()
    leadId = (flx?.lead_id as string | null) ?? null
  } catch {
    leadId = null
  }

  // Makler-Vermittlung: Promo-Code des vermittelnden Maklers auf den Lead (Attribution).
  // Prioritaet: expliziter promotion_code_id-Input (Werkstatt-/Makler-Embed) vor dem aus der
  // Funnel-URL durchgereichten Makler-Code (`m`), den wir hier server-seitig aufloesen.
  // convert-lead-to-claim loest promotion_code_id -> makler_id -> claims.makler_id (DB-Trigger -> Provision).
  const resolvedPromoId = input.promotion_code_id ?? (await resolvePromoCodeToId(input.maklerCode))
  if (leadId && resolvedPromoId) {
    try {
      // Am promotion_code steht die Makler-Zuordnung und damit die Provision (DB-Trigger).
      // Das try faengt den Write nicht.
      const { error: promoFehler } = await createAdminClient().from('leads').update({ promotion_code_id: resolvedPromoId }).eq('id', leadId)
      if (promoFehler) {
        console.error(`[reserviereEmbedTermin] promotion_code_id nicht gesetzt (Lead ${leadId}) — Provisions-Zuordnung fehlt:`, promoFehler.message)
      }
    } catch (err) {
      console.error('[reserviereEmbedTermin] promotion_code_id setzen fehlgeschlagen (nicht kritisch):', (err as Error).message)
    }
  }

  // AAR-956: Auto-Rückruf — jede Reservierung erzeugt GENAU EINEN Rückruf-Task beim
  // Dispatcher (auch bei 0-Verfügbarkeit, auswahl=null). Non-critical: bricht die
  // Reservierung nie. Die Danke-Seite (bucheRueckrufBeimDispatcher) aktualisiert
  // später DIESELBE Zeile via Upsert (kein zweiter Rückruf). ASAP-Hinweis (now+5min).
  // Send-Isolation: interne/Test-Bucher erzeugen keinen Dispatcher-Rueckruf-Task.
  if (leadId && !intern) {
    try {
      await upsertReservierungsRueckruf({
        leadId,
        startIso: new Date(Date.now() + 5 * 60_000).toISOString(),
        vonKunde: false,
      })
    } catch (err) {
      console.error('[reserviereEmbedTermin] Auto-Rückruf fehlgeschlagen (nicht kritisch):', (err as Error).message)
    }
  }

  // 2) Kein Slot waehlbar (0 Verfuegbarkeit) → nur Lead, Team koordiniert. Nie bestaetigt.
  if (!input.auswahl) return { ok: true, bestaetigt: false, token, leadId, svVorname: null, ortLabel: null, startIso: null, dispatcher, gutachter: null }

  // 3) Reservieren — Partner ODER Dead-Pin.
  if (input.auswahl.kind === 'partner') {
    const b = await bucheTerminFlow(token, input.auswahl.svId, input.auswahl.start, input.auswahl.end)
    // AAR-956 16.06. (Aaron): bei erfolgreicher Buchung den Termin eindeutig an die Anfrage
    // haengen (gfa.termin_id) — vorher blieb die Zuordnung null und /flow musste ueber
    // lead_id/bezug raten. Non-critical: ein Fehler hier aendert den Buchungs-Status nicht.
    if (b.ok && b.terminId && anfrageId) {
      try {
        await createAdminClient()
          .from('gutachter_finder_anfragen')
          .update({ termin_id: b.terminId })
          .eq('id', anfrageId)
      } catch (err) {
        console.error('[reserviereEmbedTermin] gfa.termin_id setzen fehlgeschlagen:', err)
      }
    }
    // Request-Modell: Kalender-Buchung ist best-effort. Schlaegt sie fehl, steht die Anfrage
    // trotzdem (Lead + Dispatcher + Wunschzeit auf der gfa) — Dispatcher bestaetigt die Zeit.
    // Ops-Test RC-1: der Ausgang wird jetzt DURCHGEREICHT statt verschluckt. Vorher deutete
    // requestModus ein b.ok===false in Erfolg um -> der Kunde bekam "Ihr Termin ist
    // reserviert" per WhatsApp, obwohl kein gutachter_termine-Eintrag existierte
    // (prod-verifiziert: gfa.termin_id NULL, 0 Termine). Ohne Wunschtermin bleibt der
    // harte Abbruch (Verfuegbarkeits-Modell: echter Slot weg -> Kunde waehlt neu).
    if (!b.ok && !requestModus) {
      return { ok: false, error: b.error ?? 'Der gewählte Termin ist nicht mehr verfügbar.', slotWeg: true }
    }
    const bestaetigt = b.ok === true
    if (!bestaetigt) {
      console.warn('[reserviereEmbedTermin] Wunschzeit nicht buchbar, laeuft als Anfrage:', b.error)
    }
    if (!intern) void sendeEmbedTerminBestaetigung({ token, svVorname: input.auswahl.svVorname, startIso: input.auswahl.start, bestaetigt })
    const gutachter = await ladeGutachterProfil(input.auswahl.svId)
    return { ok: true, bestaetigt, token, leadId, svVorname: input.auswahl.svVorname, ortLabel: null, startIso: input.auswahl.start, dispatcher, gutachter }
  }

  // Dead-Pin: erzeugt einen dispatch_pending-Termin zur MANUELLEN Koordination —
  // nie eine Bestaetigung gegenueber dem Kunden.
  const d = await bucheEmbedDeadPin({ token, deadPinId: input.auswahl.deadPinId, startIso: input.auswahl.start })
  if (!d.ok) return { ok: false, error: d.error ?? 'Der gewählte Termin ist nicht mehr verfügbar.', slotWeg: true }
  if (!intern) void sendeEmbedDeadPinBestaetigung({ token, ortLabel: input.auswahl.ort, startIso: input.auswahl.start })
  return { ok: true, bestaetigt: false, token, leadId, svVorname: null, ortLabel: input.auswahl.ort, startIso: input.auswahl.start, dispatcher, gutachter: null }
}

/**
 * AAR-956 WS5: Bestaetigungs-WhatsApp NACH der Termin-Reservierung (Aaron 12.06.:
 * "auch eine bei der Termin-Reservierung"). Getriggert aus FinderWizard.onGebucht,
 * sobald <FlowSlotStep> einen Slot reserviert hat. Resolved flow_links-Token → Lead
 * → telefon/name und schickt zwei Nachrichten:
 *   - an den Kunden: Termin-Bestaetigung ("Ihr Termin ist reserviert …")
 *   - ans Team: Reservierungs-Notiz (notifyTeamWhatsApp, dieselben Empfaenger wie Leads)
 *
 * Fire-and-forget / non-critical: der Termin ist zu diesem Zeitpunkt bereits race-safe
 * in der DB reserviert (bucheTerminFlow via Engine) — ein Baileys-Fail aendert daran
 * nichts und wird nur geloggt. KEIN Eingriff in bucheTerminFlow (geteilt mit dem
 * echten /flow-Pfad); der Reservierungs-Send haengt embed-seitig am onGebucht-Callback.
 */
export async function sendeEmbedTerminBestaetigung(input: {
  token: string
  svVorname: string
  startIso: string
  /** Ops-Test RC-1: true = Termin steht in der DB -> Bestaetigung. false = Wunschzeit
   *  konnte nicht gebucht werden -> Anfrage-Wortlaut. Nie eine Zusage ohne Termin. */
  bestaetigt: boolean
}): Promise<void> {
  try {
    if (!input.token || !input.startIso) return
    const admin = createAdminClient()

    // flow_links-Token → Lead (service_role; identisch zu resolveFlowLead im /flow-Pfad).
    const { data: flowLink } = await admin
      .from('flow_links')
      .select('lead_id')
      .eq('token', input.token)
      .maybeSingle()
    const leadId = (flowLink?.lead_id as string | null) ?? null
    if (!leadId) return

    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', leadId)
      .maybeSingle()
    if (!lead) return

    const vorname = ((lead.vorname as string | null) ?? '').trim()
    const name =
      [vorname, ((lead.nachname as string | null) ?? '').trim()].filter(Boolean).join(' ').trim() || 'Kunde'
    const telefon = ((lead.telefon as string | null) ?? '').trim()

    // Server laeuft UTC → explizite Berlin-TZ, sonst 2h-Versatz. Matcht das Format
    // der On-Screen-"Termin reserviert"-Bestaetigung im Wizard.
    const wann = new Date(input.startIso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    // ── an den Kunden ──
    // Ops-Test RC-1: der Wortlaut folgt dem tatsaechlichen Buchungs-Ausgang. Vorher ging
    // "Ihr Termin ist reserviert" auch raus, wenn gar kein Termin entstanden war.
    if (telefon.length >= 5) {
      const kundeText = input.bestaetigt
        ? [
            '✅ Ihr Termin ist bestätigt',
            '',
            `Hallo ${vorname || name},`,
            `Ihr Kfz-Gutachter ${input.svVorname} kommt am ${wann} Uhr.`,
            '',
            'Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
            '',
            'Ihr Claimondo-Team',
          ].join('\n')
        : [
            '📩 Ihre Terminanfrage ist eingegangen',
            '',
            `Hallo ${vorname || name},`,
            `Sie haben ${wann} Uhr bei ${input.svVorname} angefragt. Diese Zeit ist noch nicht bestätigt — wir prüfen sie und melden uns kurzfristig mit einer festen Zusage.`,
            '',
            'Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
            '',
            'Ihr Claimondo-Team',
          ].join('\n')
      const r = await sendWhatsAppText(telefon, kundeText)
      if (!r.ok) console.error('[embed-termin-bestaetigung] Kunde-WA fehlgeschlagen:', r.code, r.error)
    }

    // ── ans Team ──
    // Bei einer unbestaetigten Anfrage MUSS der Dispatcher sehen, dass nichts gebucht ist —
    // sonst verlaesst sich niemand auf die Zeit und der Kunde faellt hinten runter.
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const teamText = [
      input.bestaetigt
        ? '📅 Neuer Termin gebucht (Gutachter-Finder)'
        : '⚠️ Terminanfrage OHNE Buchung (Gutachter-Finder) — bitte Zeit klären',
      '',
      `👤 ${name}`,
      telefon ? `📞 ${telefon}` : null,
      `🔧 SV: ${input.svVorname}`,
      input.bestaetigt ? `🕐 ${wann} Uhr (gebucht)` : `🕐 ${wann} Uhr — NICHT gebucht (SV zu der Zeit belegt)`,
      '',
      `${base}/dispatch/leads/${leadId}`,
    ]
      .filter(Boolean)
      .join('\n')
    await notifyTeamWhatsApp(teamText)
  } catch (err) {
    console.error('[embed-termin-bestaetigung] fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }
}

/**
 * AAR-956 WS3-Follow-up (Aaron 12.06.): den für einen Besichtigungsort empfohlenen SV
 * aus dem ECHTEN Engine-Ranking liefern — `planeTerminOeffentlich` (GLOBAL, findBestSV
 * + 2+1), NICHT ein client-seitiger Distanz-Proxy. Es ist exakt dieselbe Funktion +
 * derselbe Top-SV, den der Buchungs-Step (`ladeMatchingFlow` → `planeTerminOeffentlich`)
 * als #1 zeigt → die Karten-Route/-Profil-Empfehlung und die tatsächlich buchbare
 * Empfehlung stimmen überein (vorher konnten sie divergieren).
 *
 * Anon-sicher (CONTRACT.md): `planeTerminOeffentlich` projiziert via
 * `toOeffentlichesSvProfil` (kein Score-/ETA-/PII-Leak). Zurück geht NUR das opake
 * `svId`-Buchungs-Handle — es matcht `AktiverSVPublic.id` (beides `sachverstaendige.id`),
 * der Client findet damit den Pin + das angereicherte Profil. Liefert `null` (→ Client
 * fällt auf den nächstgelegenen Pin zurück), wenn die Engine nichts findet.
 */
// Empfohlenes Route-Ziel für die Karte — diskriminiert Partner vs. Dead-Pin (Aaron 12.06.:
// die Route soll im Fallback zum Dead-Pin gehen, nicht zum fernen Partner).
//   partner  → ≥1 buchbarer Partner (planeTerminOeffentlich, svs[0]=Top, in aktiveSVs findbar)
//   deadpin  → 0 buchbare Partner → ALLE deckenden Dead-Pins (15-km-Ghost-Isochrone); Route zum nächsten
//   none     → weder Partner noch Dead-Pin → flyTo (kein Route-Ziel)
// `forceFallback` (?fallback=1) überspringt den Partner-Match → erzwingt den Dead-Pin (Test).
//
// Engine-Konsistenz (Aaron 12.06.): die Partner-vs-Dead-Pin-Diskriminierung ist jetzt IN DER
// ENGINE verankert (`planeTerminMitFallback`, sv-matching-modul). empfehleSvFuerOrt ist nur noch
// ein dünner Adapter: Engine-Result → Route-Ziel-Shape (svId bzw. Dead-Pin-Liste fürs Rendering).
type EmbedRouteZiel =
  | { kind: 'partner'; svId: string }
  | { kind: 'deadpin'; deadPins: Array<{ deadPinId: string; lat: number; lng: number; ort: string | null }> }
  | { kind: 'none' }

export async function empfehleSvFuerOrt(input: {
  lat: number
  lng: number
  forceFallback?: boolean
}): Promise<EmbedRouteZiel> {
  try {
    if (typeof input?.lat !== 'number' || typeof input?.lng !== 'number') return { kind: 'none' }
    // forceFallback (?fallback=1, Test): Partner-Check überspringen → direkt die Dead-Pins.
    if (input.forceFallback) {
      const deadPins = await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
      return deadPins.length > 0
        ? { kind: 'deadpin', deadPins: deadPins.map((d) => ({ deadPinId: d.deadPinId, lat: d.lat, lng: d.lng, ort: d.ort })) }
        : { kind: 'none' }
    }
    // Engine-verankerte Diskriminierung (planeTerminMitFallback = EINE Quelle für Karte + Buchung).
    //   partner  → svs[0] = engine-ranked Top (= Buchungs-Vorschlag #1)
    //   fallback → alle Dead-Pins, deren 15-km-Ghost-Isochrone den Ort deckt (nächste zuerst);
    //              die Karte zeigt GENAU diese (statt aller 62 Pins) + routet zum nächsten.
    const res = await planeTerminMitFallback({ lat: input.lat, lng: input.lng })
    if (res.kind === 'partner') return { kind: 'partner', svId: res.svs[0].svId }
    return res.deadPins.length > 0
      ? { kind: 'deadpin', deadPins: res.deadPins.map((d) => ({ deadPinId: d.deadPinId, lat: d.lat, lng: d.lng, ort: d.ort })) }
      : { kind: 'none' }
  } catch (err) {
    console.error('[empfehleSvFuerOrt] fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return { kind: 'none' }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// AAR-956 Dead-Pin-Fallback — Consumer-Aktionen (12.06.). MATCHING (#2729) + BUCHUNG
// (#2735, b2) sind gelandet → beide ECHT verdrahtet. Das Matching (Partner ODER Dead-Pin)
// läuft über `ladeEmbedMatching`/`planeTerminMitFallback`; `bucheEmbedDeadPin` ruft
// `bucheDeadPinTermin` (write-only → `dispatch_pending` sv_lead-Termin in die Dispatch-Queue).
// Kunde+Team-Bestätigung macht der Embed (Vertrag Gap-2: der sv_lead wird NIE benachrichtigt).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Reserviert einen generischen Dead-Pin-Slot → `dispatch_pending` sv_lead-Termin (b2 #2735,
 * write-only). Der Termin landet in der Dispatch-Queue (`status='dispatch_pending' AND
 * assignee_typ='sv_lead'`) zur MANUELLEN Koordination; KEINE Exclusion-Constraint (exempt).
 * Bei Erfolg schickt FinderWizard die Kunde+Team-Bestätigung (`sendeEmbedDeadPinBestaetigung`,
 * generisches Label) — der sv_lead wird NIE benachrichtigt.
 */
export async function bucheEmbedDeadPin(
  input: { token: string; deadPinId: string; startIso: string },
): Promise<{ ok: boolean; error?: string }> {
  const r = await bucheDeadPinTermin({
    token: input.token,
    deadPinId: input.deadPinId,
    startIso: input.startIso,
  })
  return r.ok ? { ok: true } : { ok: false, error: r.error }
}

/**
 * Kunde+Team-Bestätigung NACH einer Dead-Pin-Reservierung (Vertrag Gap-2: der Embed
 * macht den Notify, der sv_lead wird NIE benachrichtigt). Generisches Label
 * „Kfz-Gutachter in {ort}" (KEIN SV-Name — leak-safe). Spiegelt
 * `sendeEmbedTerminBestaetigung`, nur ohne svVorname + mit Dispatch-Hinweis im Team-Text.
 * Non-critical fire-and-forget; getriggert aus FinderWizard nach erfolgreicher Buchung.
 */
export async function sendeEmbedDeadPinBestaetigung(input: {
  token: string
  ortLabel: string | null
  startIso: string
}): Promise<void> {
  try {
    if (!input.token || !input.startIso) return
    const admin = createAdminClient()
    const { data: flowLink } = await admin
      .from('flow_links')
      .select('lead_id')
      .eq('token', input.token)
      .maybeSingle()
    const leadId = (flowLink?.lead_id as string | null) ?? null
    if (!leadId) return

    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', leadId)
      .maybeSingle()
    if (!lead) return

    const vorname = ((lead.vorname as string | null) ?? '').trim()
    const name =
      [vorname, ((lead.nachname as string | null) ?? '').trim()].filter(Boolean).join(' ').trim() || 'Kunde'
    const telefon = ((lead.telefon as string | null) ?? '').trim()
    const gutachterLabel = input.ortLabel ? `Kfz-Gutachter in ${input.ortLabel}` : 'Kfz-Gutachter in Ihrer Nähe'
    const wann = new Date(input.startIso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'long',
      day: '2-digit',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
    })

    // ── an den Kunden ──
    if (telefon.length >= 5) {
      const kundeText = [
        '📩 Ihre Terminanfrage ist eingegangen',
        '',
        `Hallo ${vorname || name},`,
        `Sie haben ${wann} Uhr bei einem ${gutachterLabel} angefragt. Wir prüfen die Zeit und bestätigen sie in Kürze.`,
        '',
        'Wir bestätigen Ihren Termin in Kürze. Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
        '',
        'Ihr Claimondo-Team',
      ].join('\n')
      const r = await sendWhatsAppText(telefon, kundeText)
      if (!r.ok) console.error('[embed-deadpin-bestaetigung] Kunde-WA fehlgeschlagen:', r.code, r.error)
    }

    // ── ans Team (Dispatch koordiniert den Dead-Pin manuell — kein verifizierter Partner) ──
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const teamText = [
      '📞 Neue Dead-Pin-Reservierung — bitte koordinieren',
      '',
      `👤 ${name}`,
      telefon ? `📞 ${telefon}` : null,
      `🔧 ${gutachterLabel} (sv_lead, nicht verifiziert)`,
      `🕐 ${wann} Uhr`,
      '',
      `${base}/dispatch/leads/${leadId}`,
    ]
      .filter(Boolean)
      .join('\n')
    await notifyTeamWhatsApp(teamText)
  } catch (err) {
    console.error('[embed-deadpin-bestaetigung] fehlgeschlagen (nicht kritisch):', (err as Error).message)
  }
}

/**
 * AAR-956 (Aaron 12.06.): Rückruf/Beratungsgespräch beim dem Lead zugewiesenen Dispatcher buchen —
 * von der Danke-Seite aus. Der Lead existiert schon (token), wir kennen Name/Telefon — der Kunde
 * gibt NUR die Wunschzeit ein. Legt einen `admin_termine` (typ='rueckruf') auf den BESTEHENDEN Lead
 * an, `zugewiesen_an`=Dispatcher (erscheint auf /dispatch/rueckrufe), + Mitteilung an den Dispatcher
 * + WhatsApp-Bestätigung an den Kunden. KEIN neuer Lead (anders als erstelleOeffentlichenRueckruf).
 */
export async function bucheRueckrufBeimDispatcher(
  input: { token: string; wunschzeitLokal: string },
): Promise<{ ok: boolean; error?: string }> {
  try {
    if (!input.token || !input.wunschzeitLokal) return { ok: false, error: 'Bitte eine Wunschzeit wählen.' }
    let startIso: string
    try {
      startIso = berlinWallClockToUtc(input.wunschzeitLokal)
    } catch {
      return { ok: false, error: 'Ungültige Wunschzeit.' }
    }
    const admin = createAdminClient()
    const { data: fl } = await admin.from('flow_links').select('lead_id').eq('token', input.token).maybeSingle()
    const leadId = (fl?.lead_id as string | null) ?? null
    if (!leadId) return { ok: false, error: 'Die Sitzung ist abgelaufen. Bitte starten Sie neu.' }
    const { data: lead } = await admin
      .from('leads')
      .select('vorname, nachname, telefon')
      .eq('id', leadId)
      .maybeSingle()
    if (!lead) return { ok: false, error: 'Anfrage nicht gefunden.' }

    // AAR-956: kundengewählte Wunschzeit → DENSELBEN Reservierungs-Rückruf aktualisieren
    // (Auto-Anlage aus reserviereEmbedTermin). Der Upsert garantiert: kein zweiter Rückruf,
    // resolved den Dispatcher und revalidiert /dispatch/rueckrufe + /dispatch/dashboard.
    const r = await upsertReservierungsRueckruf({ leadId, startIso, vonKunde: true })
    if (!r.ok || !r.terminId || !r.dispId) {
      return { ok: false, error: r.error ?? 'Der Rückruf konnte nicht gebucht werden.' }
    }

    const vorname = ((lead.vorname as string | null) ?? '').trim()
    const name = [vorname, ((lead.nachname as string | null) ?? '').trim()].filter(Boolean).join(' ').trim() || 'Kunde'
    const telefon = ((lead.telefon as string | null) ?? '').trim()
    const wann = new Date(startIso).toLocaleString('de-DE', {
      timeZone: 'Europe/Berlin',
      weekday: 'short',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })

    // Mitteilung an den Dispatcher (non-critical).
    try {
      await admin.from('mitteilungen').insert({
        empfaenger_id: r.dispId,
        empfaenger_rolle: 'dispatch',
        kategorie: 'anruf',
        titel: `Beratungs-Rückruf: ${name}`,
        inhalt: `Tel: ${telefon} · Wunschzeit: ${wann} Uhr`,
        prioritaet: 'hoch',
        icon: '📞',
        route_url: `/dispatch/rueckrufe?open=${r.terminId}`,
      })
    } catch (err) {
      console.error('[rueckruf-dispatcher] Mitteilung fehlgeschlagen (nicht kritisch):', (err as Error).message)
    }

    // WhatsApp-Bestätigung an den Kunden (non-critical; lokal ohne Baileys nur geloggt).
    if (telefon.length >= 5) {
      const text = [
        '✅ Ihr Beratungsgespräch ist vereinbart',
        '',
        `Hallo ${vorname || name},`,
        `wir rufen Sie am ${wann} Uhr für Ihr persönliches Beratungsgespräch zurück.`,
        '',
        'Ihr Claimondo-Team',
      ].join('\n')
      const waRes = await sendWhatsAppText(telefon, text)
      if (!waRes.ok) console.error('[rueckruf-dispatcher] Kunde-WA fehlgeschlagen:', waRes.code, waRes.error)
    }

    return { ok: true }
  } catch (err) {
    console.error('[bucheRueckrufBeimDispatcher] fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return { ok: false, error: 'Es ist ein Fehler aufgetreten. Bitte erneut versuchen.' }
  }
}
