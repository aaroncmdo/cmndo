'use server'

// Self-Dispatch → Fall + Account + Magic-Link.
//
// Aufgerufen direkt nach erstelleGutachterFinderAnfrage wenn SA-Signatur +
// Email vorhanden sind. Konvertiert die Anfrage in einen vollwertigen
// Fall, legt einen Kunden-Account an und schickt Magic-Link → Kunde landet
// nach Klick automatisch in /kunde/faelle/[id].
//
// Pipeline:
//   1. Idempotenz-Check via konvertiert_zu_fall_id
//   2. User anlegen (oder lookup wenn Email schon registriert)
//   3. profiles upsert mit rolle='kunde'
//   4. Lead aus Anfrage erstellen (Felder mappen, OCR-Daten + SA-Signatur)
//   5. convertLeadToClaim — erstellt Claim + Fall mit fall_nummer + KB-Round-Robin
//   6. OCR-Felder (FIN/HSN/TSN/Halter) in claims + faelle nachschreiben
//   7. signInWithOtp → Magic-Link an Email mit redirect zu /kunde/faelle/{fallId}
//   8. Anfrage updaten: konvertiert_zu_*, status='konvertiert'
//
// Fehlerstrategie: bei Fehler in 4-7 wird konvertierung_fehler in der Anfrage
// gespeichert. Dispatch kann manuell re-triggern.

import { createAdminClient } from '@/lib/supabase/admin'
import { convertLeadToClaim } from '@/lib/leads/convert-lead-to-claim'
import { berechneFehlendeFelder } from '@/lib/flow/fehlende-felder'
import { pushMandatToKanzlei } from '@/lib/kanzlei/push-mandat'
import { dispatchMagicLink } from '@/lib/magic-link/dispatch-magic-link'

type Result =
  | { ok: true; fallId: string; userId: string; magicLinkSent: boolean; idempotent: boolean }
  | { ok: false; error: string }

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? 'https://app.claimondo.de'

export async function konvertiereAnfrageZuFall(anfrageId: string): Promise<Result> {
  if (!anfrageId) return { ok: false, error: 'anfrage_id fehlt' }

  const admin = createAdminClient()

  // ─── 1. Anfrage laden + Idempotenz-Check ──────────────────────────────
  const { data: anfrage, error: loadErr } = await admin
    .from('gutachter_finder_anfragen')
    .select('*')
    .eq('id', anfrageId)
    .single()

  if (loadErr || !anfrage) {
    return { ok: false, error: 'Anfrage nicht gefunden' }
  }

  if (anfrage.konvertiert_zu_fall_id) {
    // Schon konvertiert — Magic-Link bei Bedarf erneut senden, aber kein
    // doppelter Fall.
    return {
      ok: true,
      fallId: anfrage.konvertiert_zu_fall_id as string,
      userId: anfrage.konvertiert_zu_user_id as string,
      magicLinkSent: false,
      idempotent: true,
    }
  }

  if (!anfrage.email) {
    return { ok: false, error: 'Email fehlt — Konvertierung nicht möglich' }
  }
  if (!anfrage.sa_unterzeichnet_am) {
    return { ok: false, error: 'SA-Vollmacht nicht unterzeichnet' }
  }

  const email = (anfrage.email as string).toLowerCase().trim()
  const vorname = (anfrage.vorname as string | null) ?? ''
  const nachname = (anfrage.nachname as string | null) ?? ''

  // ─── 2. User anlegen oder lookup ─────────────────────────────────────
  // createUser mit email_confirm=true damit der Magic-Link ohne extra
  // Bestätigungsschritt landet. Bei "User already exists" -> per
  // listUsers Email-Filter den existierenden ID suchen.
  let userId: string | null = null

  const { data: createResp, error: createErr } = await admin.auth.admin.createUser({
    email,
    email_confirm: true,
    user_metadata: {
      vorname,
      nachname,
      anzeigename: `${vorname} ${nachname}`.trim() || email,
      rolle: 'kunde',
      via: 'gutachter-finder-self-dispatch',
    },
  })

  if (createErr) {
    const msg = createErr.message.toLowerCase()
    if (msg.includes('already') || msg.includes('exists') || msg.includes('registered')) {
      // Email existiert bereits — per profiles-Lookup ID finden.
      const { data: existing } = await admin
        .from('profiles')
        .select('id')
        .eq('email', email)
        .maybeSingle()
      if (existing?.id) {
        userId = existing.id as string
      } else {
        // Fallback: Auth-User existiert, aber kein profiles-Eintrag.
        // Über admin.auth.admin.listUsers nach Email filtern.
        const { data: list } = await admin.auth.admin.listUsers({ perPage: 1 })
        const found = list?.users?.find((u) => u.email?.toLowerCase() === email)
        if (found) userId = found.id
      }
      if (!userId) {
        await admin
          .from('gutachter_finder_anfragen')
          .update({ konvertierung_fehler: `User-Lookup fehlgeschlagen: ${createErr.message}` })
          .eq('id', anfrageId)
        return { ok: false, error: `Email existiert, aber User-Lookup fehlgeschlagen: ${createErr.message}` }
      }
    } else {
      await admin
        .from('gutachter_finder_anfragen')
        .update({ konvertierung_fehler: `User-Anlage: ${createErr.message}` })
        .eq('id', anfrageId)
      return { ok: false, error: `User konnte nicht angelegt werden: ${createErr.message}` }
    }
  } else if (createResp?.user) {
    userId = createResp.user.id
  }

  if (!userId) {
    return { ok: false, error: 'User-ID konnte nicht ermittelt werden' }
  }

  // ─── 3. profiles upsert ──────────────────────────────────────────────
  await admin.from('profiles').upsert(
    {
      id: userId,
      rolle: 'kunde',
      email,
      vorname: vorname || null,
      nachname: nachname || null,
      anzeigename: `${vorname} ${nachname}`.trim() || email,
      telefon: anfrage.telefon ?? null,
    },
    { onConflict: 'id' },
  )

  // ─── 4. Lead aus Anfrage erstellen ───────────────────────────────────
  const { data: lead, error: leadErr } = await admin
    .from('leads')
    .insert({
      vorname,
      nachname,
      email,
      telefon: (anfrage.telefon as string | null) ?? null,
      kunde_id: userId,
      // leads_schadentyp_check: nur spurwechsel|auffahrunfall|vorfahrtsverletzung|
      // parkplatz|sonstiges. Anfrage-schadentyp default ist 'unbekannt' — wird auf
      // 'sonstiges' gemappt, sonst CHECK-Violation.
      schadentyp: (() => {
        const ALLOWED = new Set(['spurwechsel', 'auffahrunfall', 'vorfahrtsverletzung', 'parkplatz', 'sonstiges'])
        const val = (anfrage.schadentyp as string | null) ?? 'sonstiges'
        return ALLOWED.has(val) ? val : 'sonstiges'
      })(),
      schadens_hergang: (anfrage.schadenort as string | null) ?? null,
      // Standort aus GPS — Anfrage hatte schadenort_lat/lng, das ist auch
      // der Fahrzeug-Standort fuer den Self-Dispatch (Kunde wird abgeholt
      // wo er gerade ist).
      fahrzeug_standort_lat: (anfrage.schadenort_lat as number | null) ?? null,
      fahrzeug_standort_lng: (anfrage.schadenort_lng as number | null) ?? null,
      fahrzeug_standort_adresse: (anfrage.schadenort as string | null) ?? null,
      // OCR-Felder aus ZB1 (wenn der Kunde im Erfolg-Screen den Schein gescannt hat)
      fin: (anfrage.fin_vin as string | null) ?? null,
      kennzeichen: (anfrage.kennzeichen as string | null) ?? null,
      hsn: (anfrage.hsn as string | null) ?? null,
      tsn: (anfrage.tsn as string | null) ?? null,
      fahrzeug_hersteller: (anfrage.fahrzeug_hersteller as string | null) ?? null,
      fahrzeug_modell: (anfrage.fahrzeug_modell as string | null) ?? null,
      fahrzeug_baujahr: (anfrage.fahrzeug_baujahr as number | null) ?? null,
      halter_vorname: (anfrage.halter_vorname as string | null) ?? null,
      halter_nachname: (anfrage.halter_nachname as string | null) ?? null,
      halter_strasse: (anfrage.halter_strasse as string | null) ?? null,
      halter_plz: (anfrage.halter_plz as string | null) ?? null,
      // SA-Status: leads hat nur Flag-Spalten (sa_unterschrieben + sa_unterschrieben_am),
      // KEINE data-URL-Spalte. Die Signatur-Datei selbst wird via signatureUrl
      // an convertLeadToClaim weitergereicht und dort als Storage-Upload
      // persistiert. (2026-05-13: vorher unbekannte Spalten sa_signatur_data_url
      // / sa_unterzeichnet_am im leads-Insert → blockierte alle Konvertierungen).
      sa_unterschrieben: !!anfrage.sa_unterzeichnet_am,
      sa_unterschrieben_am: anfrage.sa_unterzeichnet_am,
      // Self-Dispatch-Fix: Wunschtermin aus dem Wizard-Slot-Picker auf den Lead
      // propagieren. Ohne dieses Mapping ging der Termin verloren — Dispatch
      // sah einen Lead ohne Termin-Kontext und musste den Kunden erneut anrufen.
      wunschtermin: (anfrage.wunschtermin as string | null) ?? null,
      // Quelle markiert dass das aus dem Self-Dispatch kommt
      source_channel: 'gutachter_finder_self_dispatch',
      qualifizierungs_phase: 'erstkontakt',
      // lead_status-Enum-Werte: neu | rueckruf | quali-offen | flow-gesendet |
      // umgewandelt | umgewandelt-sv | disqualifiziert | kalt. 'qualifiziert'
      // gab es nie — der Lead ist bereit für Quali → 'quali-offen'.
      status: 'quali-offen',
      sprache: 'de',
    })
    .select('id')
    .single()

  if (leadErr || !lead) {
    await admin
      .from('gutachter_finder_anfragen')
      .update({ konvertierung_fehler: `Lead-Insert: ${leadErr?.message}` })
      .eq('id', anfrageId)
    return { ok: false, error: `Lead konnte nicht angelegt werden: ${leadErr?.message}` }
  }

  // fehlende_felder_jsonb berechnen damit Onboarding gleich weiss was
  // der Kunde noch nachreichen muss.
  const fehlendeFelder = berechneFehlendeFelder({
    schadentyp: (anfrage.schadentyp as string | null) ?? null,
    vorname,
    nachname,
    email,
    telefon: (anfrage.telefon as string | null) ?? null,
    fin: (anfrage.fin_vin as string | null) ?? null,
    kennzeichen: (anfrage.kennzeichen as string | null) ?? null,
    hsn: (anfrage.hsn as string | null) ?? null,
    tsn: (anfrage.tsn as string | null) ?? null,
  })
  if (fehlendeFelder.length > 0) {
    await admin
      .from('leads')
      .update({ fehlende_felder_jsonb: fehlendeFelder })
      .eq('id', lead.id)
  }

  // ─── 5. Lead → Claim + Fall ──────────────────────────────────────────
  const conv = await convertLeadToClaim({
    leadId: lead.id as string,
    triggerByUserId: userId,
    kundeUserIdOverride: userId,
    svIdFromTermin: (anfrage.zugeordneter_sv_id as string | null) ?? null,
    signatureUrl:
      (anfrage.unterschrift_data_url as string | null)
      ?? (anfrage.sa_signatur_data_url as string | null)
      ?? undefined,
  })

  if (!conv.ok) {
    await admin
      .from('gutachter_finder_anfragen')
      .update({ konvertierung_fehler: `convertLeadToClaim: ${conv.error}` })
      .eq('id', anfrageId)
    return { ok: false, error: `Konvertierung fehlgeschlagen: ${conv.error}` }
  }

  // Bug-Fix 2026-05-15: Anfrage-Update SOFORT nach convertLeadToClaim
  // statt erst am Ende der Funktion. Vorher wurde der Verweis (konvertiert_zu_*,
  // status='konvertiert') erst nach Magic-Link-Versand, CarDentity-Trigger,
  // pushMandatToKanzlei etc. gesetzt — wenn dazwischen ein Function-Timeout
  // griff (Next.js Server-Action ~30s), entstanden Lead+Fall+Claim, aber die
  // Anfrage blieb auf status='entwurf' und konvertiert_zu_lead_id=null. Smoke
  // 2026-05-15 hat das mehrfach reproduziert (CLM-2026-00128). Atomarer Marker:
  // sobald convertLeadToClaim erfolgreich war, ist die Anfrage konvertiert
  // — magic_link_gesendet_am wird später separat upgedated falls Send klappt.
  const { error: convertMarkerErr } = await admin
    .from('gutachter_finder_anfragen')
    .update({
      konvertiert_zu_user_id: userId,
      konvertiert_zu_lead_id: lead.id,
      konvertiert_zu_fall_id: conv.fallId,
      konvertiert_am: new Date().toISOString(),
      status: 'konvertiert',
      konvertierung_fehler: null,
    })
    .eq('id', anfrageId)
  if (convertMarkerErr) {
    console.error('[konvertiereAnfrageZuFall] Anfrage-Convert-Marker fail:', convertMarkerErr)
  }

  // ─── 5b. Service-Typ + Kanzlei-Wunsch aus Wizard-Wahl auf Fall+Claim setzen ─
  // regulierungs_modus='vollstaendig' → service_typ='komplett' (Anwalt + Gutachter)
  // regulierungs_modus='nur_gutachten' → service_typ='nur_gutachter'
  // null/undefined → default 'komplett' (Anfragen vor PR #668 hatten noch
  // keinen Modus, aber SA-Signatur impliziert Vollregulierung)
  // Bug-Fix 2026-05-15: Wizard speichert option-value 'nur_gutachter'
  // (mit 'r' am Ende, siehe onboarding_felder für service_typ). Das
  // alte Mapping prüfte 'nur_gutachten' (ohne r) und matchte nie →
  // jeder „Nur-Gutachten"-Kunde landete im 'komplett'-Default und löste
  // pushMandatToKanzlei(LexDrive) aus = Kanzlei-Spam. Beide Schreibweisen
  // akzeptieren, weil staging/prod ggf. Legacy-Werte halten.
  const serviceTyp =
    anfrage.regulierungs_modus === 'nur_gutachten' ||
    anfrage.regulierungs_modus === 'nur_gutachter'
      ? 'nur_gutachter'
      : 'komplett'
  await admin
    .from('faelle')
    .update({ service_typ: serviceTyp })
    .eq('id', conv.fallId)

  // 2026-05-12 Funnel v3 PR #7: kanzlei_wunsch aus dem Wizard auf den Claim
  // propagieren — Plan v3 will Komplett+Partnerkanzlei-Wahl bereits im
  // Lead-Pfad. Ohne dieses Update bliebe claims.kanzlei_wunsch auf null,
  // pushMandatToKanzlei wuerde wegen istPartnerkanzlei=false skippen.
  //
  // Default-Fallback fuer service_typ='komplett' ohne explizite Wahl:
  // 'partnerkanzlei' (LexDrive). Das ist konsistent mit Plan v3 (Komplett
  // = Partnerkanzlei) und bewahrt Backward-Compat fuer Anfragen ohne
  // Wizard-Kanzlei-Phase.
  if (serviceTyp === 'komplett') {
    const kanzleiWunsch =
      ((anfrage.kanzlei_wunsch as string | null | undefined) ?? 'partnerkanzlei') as
        | 'partnerkanzlei' | 'eigene_kanzlei' | 'keine_kanzlei'
    // claim_id aus faelle lesen
    const { data: fallRow } = await admin
      .from('faelle')
      .select('claim_id')
      .eq('id', conv.fallId)
      .maybeSingle()
    if (fallRow?.claim_id) {
      await admin
        .from('claims')
        .update({ kanzlei_wunsch: kanzleiWunsch, kanzlei_wunsch_gefragt_am: new Date().toISOString() })
        .eq('id', fallRow.claim_id as string)
    }
  }

  // ─── 5c. LexDrive Mandant-Push (fire-and-forget) ─────────────────────
  // Bei service_typ='komplett' + kanzlei_wunsch='partnerkanzlei' bekommt die
  // Partner-Kanzlei den Mandanten gepusht. pushMandatToKanzlei prueft beides
  // selber + Feature-Flag KANZLEI_API_ENABLED + schreibt bei Fehler eine
  // Timeline-Warnung. Fehler hier duerfen die Konvertierung NICHT blockieren.
  //
  // Bug-Fix 2026-05-15: Aaron-Beschwerde „ich habe trotzdem eine Nachricht
  // bekommen" — vorher reichte `serviceTyp === 'komplett'` allein, der
  // Kanzlei-Wunsch wurde nicht geprüft. Bei `eigene_kanzlei`/`keine_kanzlei`
  // wurde LexDrive trotzdem getriggert. Jetzt strikt: NUR partnerkanzlei.
  const istPartnerkanzlei =
    (anfrage.kanzlei_wunsch as string | null) === 'partnerkanzlei'
  if (serviceTyp === 'komplett' && istPartnerkanzlei) {
    pushMandatToKanzlei(conv.fallId)
      .then((res) => {
        if (!res.success && !res.skipped) {
          console.warn('[konvertiereAnfrageZuFall] LexDrive-Push fehlgeschlagen:', res.error)
        }
      })
      .catch((err) => {
        console.warn('[konvertiereAnfrageZuFall] LexDrive-Push Exception:', err)
      })
  }

  // ─── 5d. CarDentity Typ-A Trigger (fire-and-forget) ──────────────────
  // Wenn ZB1-OCR im Self-Dispatch eine FIN extrahiert hat, jetzt den
  // Vorschaden-Check anstossen. Endpoint nutzt admin client + schreibt
  // das Ergebnis nach faelle/vehicles inkl. Timeline-Eintrag. Onboarding-
  // Wizard zeigt dann conditional die altschaden_fotos + altes_gutachten
  // Slots wenn vorschaden_check_status='vorschaden_erkannt'.
  if (anfrage.fin_vin) {
    fetch(`${APP_URL}/api/cardentity/typ-a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fall_id: conv.fallId,
        fin_vin: anfrage.fin_vin as string,
      }),
    })
      .then(async (r) => {
        if (!r.ok) {
          console.warn(
            '[konvertiereAnfrageZuFall] CarDentity-Trigger fehlgeschlagen:',
            r.status,
          )
        }
      })
      .catch((err) => {
        console.warn('[konvertiereAnfrageZuFall] CarDentity-Trigger Exception:', err)
      })
  }

  // ─── 6. Magic-Link via flow_links + dispatchMagicLink (WA + Email-Fallback)
  // Self-Dispatch-Fix: vorher wurde nur Supabase auth.admin.generateLink
  // gerufen — das versendete keinen WA-Trigger via Baileys und legte
  // keine flow_links-Row an. Konsistent mit dem Mini-Wizard-Pfad
  // (create-lead-from-mini-wizard.ts:120-152) erstellen wir jetzt einen
  // flow_link mit Token + rufen dispatchMagicLink (WA bevorzugt, Email-
  // Fallback). Lokal ohne BAILEYS_BASE_URL fällt sauber auf Email.
  let magicLinkSent = false
  try {
    const { data: flowLink, error: flowErr } = await admin
      .from('flow_links')
      .insert({
        lead_id: lead.id as string,
        expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
        service_typ: serviceTyp,
        sprache: 'de',
      })
      .select('token')
      .single()

    if (flowErr || !flowLink) {
      console.error('[konvertiereAnfrageZuFall] flow_links-Insert fail:', flowErr)
    } else {
      const flowUrl = `${APP_URL}/flow/${flowLink.token as string}`
      const dispatched = await dispatchMagicLink({
        leadId: lead.id as string,
        telefon: (anfrage.telefon as string | null) ?? '',
        email,
        vorname,
        flowUrl,
      })
      if (dispatched.sent) {
        magicLinkSent = true
      } else {
        console.error('[konvertiereAnfrageZuFall] dispatchMagicLink fail:', dispatched.detail)
      }
    }
  } catch (e) {
    console.error('[konvertiereAnfrageZuFall] Magic-Link-Exception:', e)
  }

  // ─── 7. Magic-Link-Timestamp updaten (isolierter Update) ────────────
  // Konvertiert-Marker ist schon oben gesetzt — hier nur magic_link_gesendet_am
  // upgedaten wenn dispatchMagicLink erfolgreich war. Falls dieser Update auch
  // ein Function-Timeout-Opfer wird, ist die Anfrage trotzdem schon
  // konvertiert + Dispatcher sieht Lead/Fall/Claim.
  if (magicLinkSent) {
    const { error: mlErr } = await admin
      .from('gutachter_finder_anfragen')
      .update({ magic_link_gesendet_am: new Date().toISOString() })
      .eq('id', anfrageId)
    if (mlErr) {
      console.error('[konvertiereAnfrageZuFall] Magic-Link-Timestamp-Update fail:', mlErr)
    }
  }

  // 2026-05-12 Funnel v3 Backlog: Conversion-Event fire-and-forget
  try {
    const { trackConversionEvent } = await import('@/lib/analytics/track-conversion')
    void trackConversionEvent({
      flow_key: 'gutachter-finden',
      phase_key: 'submit',
      event_type: 'konvertiert',
      anfrage_id: anfrageId,
      service_typ: serviceTyp,
      kanzlei_wunsch: (anfrage.kanzlei_wunsch as string | null) ?? null,
    })
  } catch { /* silent */ }

  return {
    ok: true,
    fallId: conv.fallId,
    userId,
    magicLinkSent,
    idempotent: false,
  }
}
