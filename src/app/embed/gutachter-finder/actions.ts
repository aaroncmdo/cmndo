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
import { planeTerminMitFallback, ladeDeadPinFallback, bucheDeadPinTermin, type DeadPinOeffentlich } from '@/lib/sv-matching-modul'
import { createAdminClient } from '@/lib/supabase/admin'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { notifyTeamWhatsApp } from '@/lib/whatsapp/team-notify'

export type EmbedBuchungInput = {
  vorname: string
  nachname: string
  telefon: string
  email: string
  schadentyp: string
  ort: { adresse: string; lat: number; lng: number }
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
// (#2735, b2) sind gelandet → beide ECHT verdrahtet. `ladeEmbedDeadPinFallback` ruft
// `ladeDeadPinFallback`, `bucheEmbedDeadPin` ruft `bucheDeadPinTermin` (write-only →
// `dispatch_pending` sv_lead-Termin in die Dispatch-Queue). Kunde+Team-Bestätigung macht
// der Embed (Vertrag Gap-2: der sv_lead wird NIE benachrichtigt).
// ─────────────────────────────────────────────────────────────────────────────

/** Lite-Dead-Pin-Fallback (leak-safe) für den Besichtigungsort — wenn 0 buchbare Partner. */
export async function ladeEmbedDeadPinFallback(
  input: { lat: number; lng: number },
): Promise<DeadPinOeffentlich[]> {
  try {
    return await ladeDeadPinFallback({ lat: input.lat, lng: input.lng })
  } catch (err) {
    console.error('[ladeEmbedDeadPinFallback] Fallback-Matching fehlgeschlagen (nicht kritisch):', (err as Error).message)
    return []
  }
}

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
