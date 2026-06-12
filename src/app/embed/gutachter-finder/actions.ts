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
import {
  planeTerminMitFallback,
  ladeDeadPinFallback,
  bucheDeadPinTermin,
  type SlotVorschlag,
  type PlaneTerminMitFallbackResult,
} from '@/lib/sv-matching-modul'
import { bucheTerminFlow } from '@/app/flow/[token]/self-service-actions'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'
import { berlinWallClockToUtc } from '@/lib/google-calendar/timezone'

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
}

export async function starteEmbedBuchung(
  input: EmbedBuchungInput,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
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
  })
  if (!gfa.ok) return { ok: false, error: gfa.error }

  // 2) gfa → lead → flow_link (Service-Role, idempotent). send:true = Flowlink-WA an den
  //    Kunden raus (Aaron 11.06.: beim Absenden des Kontaktformulars muss die WhatsApp raus)
  //    + Self-Service-Einstieg. Der Nutzer bucht zusätzlich inline weiter (FlowSlotStep).
  const issued = await issueCanonicalFlowLinkForAnfrage(gfa.id, { send: true })
  if (!issued.ok) return { ok: false, error: issued.error }

  return { ok: true, token: issued.token }
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
    // Request-Modell (Aaron 12.06.): bei GESETZTEM Wunschtermin bietet JEDER Gutachter (Partner
    // UND Dead-Pin) 3 ZEITEN an — die Wunschzeit (Badge) + 2 Alternativen (±2h, gleicher Tag,
    // 8–18 Uhr, chronologisch). Die Reservierung ist eine Anfrage auf die gewählte Zeit; der
    // Dispatcher (Lead-Owner) bestätigt. Ohne Wunschtermin: unverändert (Partner = echte Engine-
    // Slots, Dead-Pin = generische).
    const dreiZeiten = ((): SlotVorschlag[] => {
      if (!wunschterminIso || !input.wunschterminLokal) return []
      const [datum, zeit] = input.wunschterminLokal.split('T')
      const H = parseInt((zeit ?? '10:00').split(':')[0] ?? '10', 10)
      if (!datum || Number.isNaN(H)) return []
      // Wunschstunde + ±2h-Alternativen, geclamped 8–18, eindeutig, chronologisch, max 3.
      const stunden = [...new Set([H, H + 2, H - 2, H + 4, H - 4].filter((h) => h >= 8 && h <= 18))]
        .slice(0, 3)
        .sort((a, b) => a - b)
      const out: SlotVorschlag[] = []
      for (const h of stunden) {
        try {
          const start = berlinWallClockToUtc(`${datum}T${String(h).padStart(2, '0')}:00`)
          const end = new Date(new Date(start).getTime() + 90 * 60_000).toISOString()
          out.push({ start, end, matchType: h === H ? 'wunschtermin' : 'nahe' })
        } catch {
          /* ungültige Stunde überspringen */
        }
      }
      return out
    })()
    const mitZeiten = <T extends { slots: SlotVorschlag[] }>(items: T[]): T[] =>
      dreiZeiten.length ? items.map((it) => ({ ...it, slots: dreiZeiten })) : items

    if (input.forceFallback) {
      const deadPins = await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
      return { kind: 'fallback', deadPins: mitZeiten(deadPins) }
    }
    const res = await planeTerminMitFallback({ lat: input.lat, lng: input.lng, wunschterminIso })
    if (res.kind === 'partner') return { kind: 'partner', svs: mitZeiten(res.svs) }
    return { kind: 'fallback', deadPins: mitZeiten(res.deadPins) }
  } catch (err) {
    console.error('[ladeEmbedMatching] Matching fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return { kind: 'fallback', deadPins: [] }
  }
}

type EmbedDispatcher = { vorname: string; avatarUrl: string | null; beschreibung: string | null }

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
  auswahl:
    | { kind: 'partner'; svId: string; svVorname: string; start: string; end: string }
    | { kind: 'deadpin'; deadPinId: string; ort: string | null; start: string }
    | null
}): Promise<
  | { ok: true; svVorname: string | null; ortLabel: string | null; startIso: string | null; dispatcher: EmbedDispatcher | null }
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

  // 1) Lead + Token (idempotent; Lead bekommt Round-Robin-Dispatcher + Flowlink-WA an den Kunden).
  const res = await starteEmbedBuchung({
    vorname: input.vorname,
    nachname: input.nachname,
    telefon: input.telefon,
    email: input.email,
    schadentyp: input.schadentyp,
    ort: input.ort,
    wunschterminIso,
  })
  if (!res.ok) return { ok: false, error: res.error }
  const token = res.token

  // Dem Lead zugewiesener Dispatcher (für die Danke-Seite: Profil-Card + Anruf-Button).
  const dispatcher = await ladeLeadDispatcher(token)

  // 2) Kein Slot waehlbar (0 Verfuegbarkeit) → nur Lead, Team koordiniert.
  if (!input.auswahl) return { ok: true, svVorname: null, ortLabel: null, startIso: null, dispatcher }

  // 3) Reservieren — Partner ODER Dead-Pin.
  if (input.auswahl.kind === 'partner') {
    const b = await bucheTerminFlow(token, input.auswahl.svId, input.auswahl.start, input.auswahl.end)
    // Request-Modell: Kalender-Buchung ist best-effort. Schlägt sie fehl, steht die Anfrage
    // trotzdem (Lead + Dispatcher + Wunschzeit auf der gfa + Bestätigung) — Dispatcher bestätigt.
    if (!b.ok && !requestModus) {
      return { ok: false, error: b.error ?? 'Der gewählte Termin ist nicht mehr verfügbar.', slotWeg: true }
    }
    void sendeEmbedTerminBestaetigung({ token, svVorname: input.auswahl.svVorname, startIso: input.auswahl.start })
    return { ok: true, svVorname: input.auswahl.svVorname, ortLabel: null, startIso: input.auswahl.start, dispatcher }
  }

  const d = await bucheEmbedDeadPin({ token, deadPinId: input.auswahl.deadPinId, startIso: input.auswahl.start })
  if (!d.ok) return { ok: false, error: d.error ?? 'Der gewählte Termin ist nicht mehr verfügbar.', slotWeg: true }
  void sendeEmbedDeadPinBestaetigung({ token, ortLabel: input.auswahl.ort, startIso: input.auswahl.start })
  return { ok: true, svVorname: null, ortLabel: input.auswahl.ort, startIso: input.auswahl.start, dispatcher }
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
    if (telefon.length >= 5) {
      const kundeText = [
        '✅ Ihr Termin ist reserviert',
        '',
        `Hallo ${vorname || name},`,
        `Ihr Kfz-Gutachter ${input.svVorname} ist für ${wann} Uhr reserviert.`,
        '',
        'Wir bestätigen Ihren Termin in Kürze. Bei Rückfragen antworten Sie einfach auf diese Nachricht.',
        '',
        'Ihr Claimondo-Team',
      ].join('\n')
      const r = await sendWhatsAppText(telefon, kundeText)
      if (!r.ok) console.error('[embed-termin-bestaetigung] Kunde-WA fehlgeschlagen:', r.code, r.error)
    }

    // ── ans Team ──
    const base = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'
    const teamText = [
      '📅 Neuer Termin reserviert (Gutachter-Finder)',
      '',
      `👤 ${name}`,
      telefon ? `📞 ${telefon}` : null,
      `🔧 SV: ${input.svVorname}`,
      `🕐 ${wann} Uhr`,
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
        '✅ Ihr Termin ist reserviert',
        '',
        `Hallo ${vorname || name},`,
        `Ihr ${gutachterLabel} ist für ${wann} Uhr vorgemerkt.`,
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
