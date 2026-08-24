import 'server-only'
import { notifyTeamNeuerLead } from '@/lib/leads/notify-team-lead'

// AAR-956 Phase A · Task 3 — anon kanonischer Issue-Pfad.
//
// Verwandelt eine Monika/Self-Service-Anfrage (gutachter_finder_anfragen) konversion-first
// in EINEN lead-gekeyten FlowLink:
//   gfa → Lead (kanonisch via createLead, zugewiesen_an=Dispatcher round-robin)
//       → EIN flow_links-Eintrag (lead_id)
//       → einfacher Initial-Link-Versand (WA bevorzugt, Email-Fallback)
//
// Das ist die Auflösung des „Doppels" (AAR-956): KEIN /anfrage-self_service_token mehr —
// der Kunde bekommt den kanonischen /flow/[token]-Link (flow_links.lead_id).
//
// service_role (createAdminClient), anon-aufrufbar (von der /start-Route nach HMAC-Verify).
// Idempotent: schon konvertiert + gültiger flow_link → reuse (kein zweiter Lead/Token).
//
// Versand (Wrinkle 1, stream8b): NICHT das flowlink_versand-WA-Template (braucht SV-Name
// + Termin = 6 Placeholder, die ein frischer Self-Service-Lead nicht hat). Stattdessen ein
// einfacher Plain-Link (nur URL) — das Termin-Template kommt erst nach dem /flow-Slot-Step.
//
// Picked-SV (§3a): leads hat KEINE zugeordneter_sv_id-Spalte. Der gepickte SV bleibt auf
// der gfa und ist via gfa.konvertiert_zu_lead_id ↔ lead erreichbar. Das datengetriebene
// /flow (cdd8f4f3) liest den Picked-SV über diesen Back-Reference.

import { createAdminClient } from '@/lib/supabase/admin'
import { createLead } from '@/lib/leads/create-lead'
import { pickRoundRobinDispatcher } from './pick-dispatcher'
import { checkAndCacheAvailability } from '@/lib/whatsapp/availability'
import { sendWhatsAppText } from '@/lib/whatsapp/baileys-client'
import { sendPlainSms } from '@/lib/whatsapp/send-sms-plain'
import { sendMiniWizardMagicLink } from '@/lib/email/google/flows'
import { ensureCanonicalFlowLinkForLead } from './ensure-flowlink-for-lead'
import { persistFlowLinkVersand } from './persist-flowlink-versand'
import { getStorageUrl } from '@/lib/storage/url'

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export type IssueKanal = 'whatsapp' | 'sms' | 'email' | 'none'
export type IssueCanonicalResult =
  | { ok: true; token: string; leadId: string; kanal: IssueKanal; wiederverwendet: boolean }
  | { ok: false; error: string }

// leads_schadentyp_check erlaubt nur diese 5 Werte. gfa.schadentyp ist Freitext
// (Marketing-Wizard-Labels wie "Parkschaden"/"Auffahrunfall") → contains-Mapping + Clamp.
const SCHADENTYP_ALLOWED = new Set(['spurwechsel', 'auffahrunfall', 'vorfahrtsverletzung', 'parkplatz', 'sonstiges'])
function clampSchadentyp(raw: string | null): string {
  const v = (raw ?? '').toLowerCase().trim()
  if (SCHADENTYP_ALLOWED.has(v)) return v
  if (v.includes('auffahr')) return 'auffahrunfall'
  if (v.includes('park')) return 'parkplatz'
  if (v.includes('spur')) return 'spurwechsel'
  if (v.includes('vorfahr')) return 'vorfahrtsverletzung'
  return 'sonstiges'
}

function buildText(vorname: string | null, url: string): string {
  const greet = vorname ? `Hallo ${vorname}` : 'Hallo'
  return [
    `${greet}, hier geht es zu Ihrer Schadensregulierung bei Claimondo.`,
    '',
    `Ihr persönlicher Link (gültig 72 Stunden):`,
    url,
    '',
    'Mit wenigen Klicks prüfen wir Ihren Fall, Sie buchen einen Gutachter-Termin und unterschreiben die Vollmacht.',
  ].join('\n')
}

// P4 (Netzwerk): exportiert + anfrageId optional — der SV-Vermittlungs-Flow
// (vermittlePartnerWerkstatt) reused dieselbe Versand-Kaskade (WA > SMS > Email) ohne
// gfa-Anfrage. Ohne anfrageId entfaellt der WA-Verfuegbarkeits-Precheck (= der robustere
// Dispatch/Makler-Pfad, s. Haertungs-Kommentar unten). Verhalten mit anfrageId unveraendert.
export async function sendeInitialLink(opts: {
  anfrageId?: string | null
  leadId: string
  telefon: string | null
  email: string | null
  vorname: string | null
  url: string
}): Promise<IssueKanal> {
  const { anfrageId, leadId, telefon, email, vorname, url } = opts
  // WhatsApp bevorzugt — nur wenn laut 'gfa'-Cache/Lookup verfügbar.
  if (telefon && telefon.trim().length >= 6) {
    try {
      let waVerfuegbar: boolean | null = null
      if (anfrageId) {
        const wa = await checkAndCacheAvailability('gfa', anfrageId, telefon)
        waVerfuegbar = wa.verfuegbar
      }
      // Haertung (Aaron 27.07., FlowLink-Audit): WA auch versuchen, wenn die Verfuegbarkeit
      // UNBEKANNT ist (verfuegbar === null, z.B. Baileys-/check down/timeout) — nur bei explizitem
      // false ueberspringen. Sonst degradierte der Flowlink still auf SMS/Email, sobald der Check
      // nicht antwortete (der Dispatch/Makler-Pfad sendet ganz ohne Precheck = robuster).
      if (waVerfuegbar !== false) {
        const sent = await sendWhatsAppText(telefon, buildText(vorname, url))
        if (sent.ok) return 'whatsapp'
      }
    } catch (err) {
      console.error('[issueCanonicalFlowLink] WA-Send fehlgeschlagen:', err)
    }
  }
  // SMS-Fallback (Twilio): Telefon vorhanden, aber WA nicht verfügbar/fehlgeschlagen.
  // Aaron-Vorgabe: im Self-Service muss IMMER ein Kanal raus (für den Anfang SMS oder Email).
  if (telefon && telefon.trim().length >= 6) {
    try {
      const sms = await sendPlainSms(telefon, buildText(vorname, url))
      if (sms.success) return 'sms'
      console.error('[issueCanonicalFlowLink] SMS-Send fehlgeschlagen:', sms.error)
    } catch (err) {
      console.error('[issueCanonicalFlowLink] SMS-Send fehlgeschlagen:', err)
    }
  }
  // Email-Fallback — saubere react-email-Vorlage (branded + i18n) statt Ad-hoc-HTML.
  // Beim /start ist noch kein SV/Termin disponiert → die Plain-Vorlage (MiniWizardMagicLink),
  // dieselbe wie der Dispatcher-kein-Termin-Versand. Eine Quelle, kein Ad-hoc-Markup mehr.
  if (email && email.includes('@')) {
    try {
      const r = await sendMiniWizardMagicLink(leadId, url)
      if (r.success) return 'email'
      console.error('[issueCanonicalFlowLink] Email-Send fehlgeschlagen:', r.error)
    } catch (err) {
      console.error('[issueCanonicalFlowLink] Email-Send fehlgeschlagen:', err)
    }
  }
  return 'none'
}

/**
 * Konversion-first: gfa-Anfrage → Lead → EIN kanonischer flow_links-FlowLink → Versand.
 * Idempotent. service_role; anon-aufrufbar nach HMAC-Verify (/start-Route).
 */
export async function issueCanonicalFlowLinkForAnfrage(
  anfrageId: string,
  opts?: { send?: boolean },
): Promise<IssueCanonicalResult> {
  if (!anfrageId) return { ok: false, error: 'anfrage_id fehlt' }
  const admin = createAdminClient()

  // gfa laden (select * — eine Zeile, billig; self_service_token-Spalten egal).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: gfaRow, error: gfaErr } = await (admin as any)
    .from('gutachter_finder_anfragen')
    .select('*')
    .eq('id', anfrageId)
    .maybeSingle()
  if (gfaErr || !gfaRow) return { ok: false, error: 'Anfrage nicht gefunden' }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gfa = gfaRow as Record<string, any>

  // 1. Lead (idempotent): schon konvertiert → bestehenden Lead nutzen.
  let leadId = (gfa.konvertiert_zu_lead_id as string | null) ?? null
  if (!leadId) {
    const dispatcherId = await pickRoundRobinDispatcher(admin)
    const extra = {
      zugewiesen_an: dispatcherId,
      qualifizierungs_phase: 'erstkontakt',
      schadentyp: clampSchadentyp(gfa.schadentyp as string | null),
      // AAR-956 (Aaron 14.06.): schadens_hergang = die SCHILDERUNG, NICHT die Unfallart —
      // KEIN Fallback mehr auf schadentyp/schadenort. Im Self-Service wird der Hergang im
      // Lead-Flow sauber beschrieben; bis dahin null (statt irreführend dem Typ-/Ort-Label).
      schadens_hergang: (gfa.schadens_kurzbeschreibung as string | null) ?? null,
      fahrzeug_standort_lat: (gfa.schadenort_lat as number | null) ?? null,
      fahrzeug_standort_lng: (gfa.schadenort_lng as number | null) ?? null,
      fahrzeug_standort_adresse:
        (gfa.besichtigungsort_adresse as string | null) ??
        (gfa.schadenort as string | null) ??
        null,
      // ⚠ DENSELBEN Ort AUCH auf die besichtigungsort_*-Achse schreiben.
      //
      // Der Finder fragt „Wo steht das Fahrzeug?" — und genau dorthin faehrt der
      // Gutachter. Fahrzeugstandort und Besichtigungsort sind hier also dasselbe.
      // Bisher fuellte diese Uebergabe nur `fahrzeug_standort_*`; der Flow legt sein
      // Standort-Feld aber aus `besichtigungsort_adresse` vor. Folge (24.08. am echten
      // Testlead gesehen): der Kunde kam aus dem Finder, hatte Bremerhaven laengst
      // eingegeben, der Termin stand — und im FlowLink klappte trotzdem eine leere
      // Ortsauswahl mit fuenf Vorschlaegen auf. Er musste denselben Ort ein zweites
      // Mal waehlen. `ladeMatchingFlow` hat den Fallback bereits (Zeile ~411), das
      // Formular nicht — deshalb wird der Wert HIER an der Quelle gesetzt, damit
      // jeder Consumer ihn sieht statt jeden einzeln nachzuruesten.
      besichtigungsort_lat: (gfa.schadenort_lat as number | null) ?? null,
      besichtigungsort_lng: (gfa.schadenort_lng as number | null) ?? null,
      besichtigungsort_adresse:
        (gfa.besichtigungsort_adresse as string | null) ??
        (gfa.schadenort as string | null) ??
        null,
      fin: (gfa.fin_vin as string | null) ?? null,
      kennzeichen: (gfa.kennzeichen as string | null) ?? null,
      hsn: (gfa.hsn as string | null) ?? null,
      tsn: (gfa.tsn as string | null) ?? null,
      fahrzeug_hersteller: (gfa.fahrzeug_hersteller as string | null) ?? null,
      fahrzeug_modell: (gfa.fahrzeug_modell as string | null) ?? null,
      fahrzeug_baujahr: (gfa.fahrzeug_baujahr as number | null) ?? null,
      wunschtermin: (gfa.wunschtermin as string | null) ?? null,
      ga_client_id: (gfa.ga_client_id as string | null) ?? null,
    }
    // AAR-956 Werkstatt: werkstatt_id durchreichen (gfa->lead). Record-Cast, da die generierten
    // Lead-Types die frische DB-Spalte noch nicht kennen (Type-Regen aufgeschoben, AGENTS.md §6).
    ;(extra as Record<string, unknown>).werkstatt_id = (gfa.werkstatt_id as string | null) ?? null
    // AAR Werkstatt-KVA: Werkstatt-Kostenvoranschlag durchreichen (gfa->lead). Eigene Spur,
    // NIE der SV-Gutachten-Wert (claims.schadens_hoehe_netto). Record-Cast wg. Type-Lag (AGENTS §6).
    ;(extra as Record<string, unknown>).kostenvoranschlag_netto = (gfa.kostenvoranschlag_netto as number | null) ?? null
    ;(extra as Record<string, unknown>).kostenvoranschlag_brutto = (gfa.kostenvoranschlag_brutto as number | null) ?? null
    // Woher kam dieser Interessent WIRKLICH?
    //
    // Bisher stand hier nur `gfa.source ?? 'self_service'`. `source` ist aber KEIN
    // Attributionsfeld, sondern die RLS-Steuerspalte der Anfrage-Tabelle (die anon-INSERT-
    // Policy lautet `with_check (source IS NULL)`) — bei jeder anonymen Finder-Anfrage ist
    // sie deshalb zwingend NULL, und JEDER Lead landete als `self_service`. Ein ueber einen
    // KI-Deeplink gewonnener Kunde war damit im Lead nicht mehr von einem normalen
    // Website-Besucher zu unterscheiden; die Herkunft stand nur auf der Anfrage.
    //
    // Deshalb: `source` bleibt unangetastet (RLS!), die Herkunft kommt aus `utm_source`.
    // Bewusst per Allowlist statt Durchreichen — sonst schriebe jeder beliebige
    // Kampagnen-Parameter in ein Feld, nach dem intern gefiltert und gezaehlt wird.
    // Der stabile Marker ist `utm_medium='deeplink'` — den setzen WIR selbst bei jeder
    // Buchung ueber einen `?sv=`-Deeplink. `utm_source` traegt nur das Detail: entweder
    // unser generisches 'ki-deeplink' oder, wenn die KI sich selbst nennt, ihren Host
    // ('chatgpt.com'). Eine Allowlist auf utm_source waere die falsche Achse — sie
    // muesste jeden neuen KI-Anbieter kennen, sonst faellt ein echter KI-Lead still auf
    // 'self_service' zurueck. Genau das waere passiert, sobald ChatGPTs eigenes
    // `utm_source=chatgpt.com` durchgereicht wird.
    const istKiDeeplink = ((gfa.utm_medium as string | null) ?? '').trim().toLowerCase() === 'deeplink'
    const utmQuelle = (gfa.utm_source as string | null)?.trim().toLowerCase() || null
    const herkunftsKanal =
      (gfa.source as string | null) ??
      (istKiDeeplink ? (utmQuelle ?? 'ki-deeplink') : null) ??
      'self_service'

    const created = await createLead(
      admin,
      {
        source_channel: herkunftsKanal,
        status: 'neu',
        vorname: (gfa.vorname as string | null) ?? null,
        nachname: (gfa.nachname as string | null) ?? null,
        telefon: (gfa.telefon as string | null) ?? null,
        email: (gfa.email as string | null) ?? null,
      },
      extra,
    )
    if (!created.ok) return { ok: false, error: created.error }
    leadId = created.leadId

    // Team-WA bei NEUEM Lead (Audit 23.08.): bisher ging hier nur der FlowLink
    // an den Kunden raus — das Team erfuhr von der Anfrage nichts. Nur im
    // Neu-Zweig: ein erneut ausgestellter Link zu einem bestehenden Lead ist
    // kein neuer Interessent.
    await notifyTeamNeuerLead({
      leadId,
      quelle: `Start-Link (${herkunftsKanal})`,
      name: [gfa.vorname as string | null, gfa.nachname as string | null].filter(Boolean).join(' '),
      telefon: (gfa.telefon as string | null) ?? null,
      email: (gfa.email as string | null) ?? null,
    })

    // gfa-Marker (read-only Capture): Verweis + Status. Best-effort.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (admin as any)
      .from('gutachter_finder_anfragen')
      .update({
        konvertiert_zu_lead_id: leadId,
        konvertiert_am: new Date().toISOString(),
        status: 'konvertiert',
      })
      .eq('id', anfrageId)
  }

  // Anspruch-pruefen Carry-over: Fotos + Inputs + Schaetzung auf den Lead ziehen.
  if (gfa.schaetzung_session_id) {
    try {
      const { data: sess } = await admin
        .from('anspruch_schaetzungen')
        .select('foto_pfade, fahrbereit, ez_jahr, vision_result')
        .eq('id', gfa.schaetzung_session_id)
        .maybeSingle()
      if (sess) {
        const pfade = Array.isArray(sess.foto_pfade) ? (sess.foto_pfade as string[]) : []
        const vision = sess.vision_result as { beschreibung?: string } | null
        // Blocker 2a fix: resolve bare storage paths to full fall-dokumente public URLs.
        // leads.schadensfoto_urls convention = FULL public URLs; consumers render <img src>.
        const urls = (await Promise.all(pfade.map((p) => getStorageUrl(admin, 'fall-dokumente', p))))
          .filter((u): u is string => Boolean(u))
        const { error: leadErr } = await admin.from('leads').update({
          schadensfoto_urls: urls,
          fahrzeug_fahrbereit: sess.fahrbereit,
          erstzulassung: sess.ez_jahr ? String(sess.ez_jahr) : null,
          fahrzeugschaden_beschreibung: vision?.beschreibung ?? null,
          schaden_sichtbar: urls.length > 0,
        }).eq('id', leadId)
        if (leadErr) console.error('[anspruch] carry-over leads.update failed:', leadErr.message)
        const { error: sessErr } = await admin.from('anspruch_schaetzungen').update({ lead_id: leadId }).eq('id', gfa.schaetzung_session_id)
        if (sessErr) console.error('[anspruch] carry-over session.update failed:', sessErr.message)
      }
    } catch (err) {
      console.error('[anspruch] carry-over failed', err)
    }
  }

  // 2. flow_links (idempotent, EINE Quelle): lead-gekeyter Core — reuse gültigen
  //    Link, sonst neu. Derselbe Schreibweg wie die Dispatcher-Sends (ein Lead = ein Link).
  const flRes = await ensureCanonicalFlowLinkForLead(leadId, {
    serviceTyp: (gfa.service_typ as string | null) ?? 'komplett',
    sprache: (gfa.sprache as string | null) ?? 'de',
    admin,
  })
  if (!flRes.ok) return { ok: false, error: flRes.error }
  const token = flRes.token
  const wiederverwendet = flRes.wiederverwendet

  // 3. Initial-Link-Versand (best-effort, non-fatal). AAR-956 P2: opts.send=false
  //    (Direkt-Knopf, P3) skippt den Versand — der Client redirectet direkt nach
  //    /flow/[token]. Bei erfolgreichem Send: Versand-State auf flow_links persistieren
  //    (Dispatcher sieht gesendet?/wann/Kanal + entscheidet aktiv ueber Re-Send, P4).
  const url = `${APP_URL}/flow/${token}`
  let kanal: IssueKanal = 'none'
  if (opts?.send ?? true) {
    kanal = await sendeInitialLink({
      anfrageId,
      leadId,
      telefon: (gfa.telefon as string | null) ?? null,
      email: (gfa.email as string | null) ?? null,
      vorname: (gfa.vorname as string | null) ?? null,
      url,
    })
    if (kanal !== 'none') await persistFlowLinkVersand(admin, token, kanal)
  }

  return { ok: true, token, leadId, kanal, wiederverwendet }
}
