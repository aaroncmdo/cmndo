'use server'

// AAR-956 §3a: Lead-gekeyte Self-Service-Actions für den datengetriebenen /flow-
// Pfad (termin-loser Lead aus /start). Spiegelt die /anfrage-Actions (speichereQuali/
// ladeMatching/bucheTermin), aber resolved über flow_links-Token → Lead statt über
// gfa.self_service_token. Reuse der Shared-Libs (matchAndSlots, bewerteSchuldfrage).
// Phase C deprecatet /anfrage → diese hier bleiben der kanonische /flow-Pfad.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { qualiFlowOutcome } from '@/lib/self-service/quali-flow-outcome'
import { matchAndSlots, planeTerminOeffentlich, type OeffentlichesSvProfil } from '@/lib/sv-matching-modul'
import { mergeFixerUndAlternativen } from '@/lib/self-service/merge-fixer-alternativen'
import { resolveFlowTerminState } from '@/lib/self-service/flow-resolver'
import { syncKbTerminOut } from '@/lib/termine/kb-termin-sync'
import { planeTermin } from '@/lib/termine/engine'
import { cancelOffeneTermineFuerBezug } from '@/lib/termine/cancel-offene-termine'
import { buildZb1LeadUpdate } from '@/lib/ocr/apply-zb1-to-lead'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { resolveWerkstattFallbackGeo } from './werkstatt-geo-fallback'
import { resolveWunschterminIso } from './wunschtermin'
import { assignReparaturWerkstatt } from '@/lib/werkstatt/vermittlung-server'
import { pruefeWerkstattAuswahl, type BedarfRow } from '@/lib/werkstatt/vermittlung-core'
import { upsertReservierungsRueckruf } from '@/lib/embed/reservierungs-rueckruf'
import { findWerkstattVorschlaegeFuer } from '@/lib/werkstatt/matching/lade-vorschlaege'
import type { WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { createMitteilung } from '@/lib/mitteilungen/create-mitteilung'

/**
 * flow_links-Token → Lead (service_role). Backward-compat: ein Token, das kein
 * flow_links-Eintrag ist, wird als lead_id behandelt (page.tsx-Parität).
 */
async function resolveFlowLead(token: string): Promise<{
  admin: ReturnType<typeof createAdminClient> | null
  leadId: string | null
  error?: string
}> {
  if (!token) return { admin: null, leadId: null, error: 'Kein Token.' }
  const admin = createAdminClient()
  const { data: flowLink } = await admin
    .from('flow_links')
    .select('lead_id, expires_at')
    .eq('token', token)
    .maybeSingle()
  if (flowLink) {
    if (flowLink.expires_at && new Date(flowLink.expires_at as string).getTime() < Date.now()) {
      return { admin, leadId: null, error: 'Dieser Link ist abgelaufen.' }
    }
    return { admin, leadId: (flowLink.lead_id as string | null) ?? null }
  }
  // Backward-compat: Token ist evtl. direkt die lead_id (wie /flow/page.tsx).
  return { admin, leadId: token }
}

/**
 * Teilschuld-Zweig (Aaron 14.07.): Bei ungeklärter Haftung buchen wir keinen Gutachter, sondern
 * einen RÜCKRUF BEIM DISPATCH — die Schuldfrage muss persönlich geklärt werden.
 *
 * Nutzt den bestehenden idempotenten Upsert (genau EIN offener Rückruf pro Lead) → schreibt
 * admin_termine (typ='rueckruf', status='offen') und weist dem Lead-Dispatcher zu. Die Dispatch-Queue
 * (/dispatch/rueckrufe) liest genau das.
 *
 * WICHTIG: Der bisherige Flow-Pfad (aendereTerminFlow) setzte nur `leads.status='rueckruf'` und legte
 * KEINEN admin_termine-Eintrag an — so ein "Rückruf" tauchte in der Dispatch-Queue nie auf.
 */
export async function fordereRueckrufAn(
  token: string,
  wunschzeitIso?: string,
): Promise<{ ok: boolean; error?: string }> {
  const { leadId, error } = await resolveFlowLead(token)
  if (!leadId) return { ok: false, error: error ?? 'Link ungültig.' }

  const res = await upsertReservierungsRueckruf({
    leadId,
    startIso: wunschzeitIso ?? new Date().toISOString(),
    vonKunde: true,
  })
  if (!res.ok) return { ok: false, error: res.error ?? 'Rückruf konnte nicht angelegt werden.' }

  revalidatePath('/dispatch/rueckrufe')
  revalidatePath(`/flow/${token}`)
  return { ok: true }
}

/**
 * Ort-Abfrage im Flow (Aaron 14.07.) — ZWEI VERSCHIEDENE Orte:
 *   'fahrzeug'     → wo steht das Auto?    → Geo-Anker für den WERKSTATT-Finder
 *   'besichtigung' → wo besichtigt der SV? → Geo-Anker für den GUTACHTER-Finder
 *
 * Sie werden nur abgefragt, wenn sie in der DB noch nicht bekannt sind (Step-Bedingung in
 * flow_szenario_steps). Fehlen Koordinaten (Freitext statt Places-Pick), geocoden wir nach — ohne
 * lat/lng ist der Ort als Matching-Anker wertlos.
 */
export async function speichereOrtFlow(
  token: string,
  art: 'fahrzeug' | 'besichtigung',
  ort: {
    adresse: string
    lat?: number | null
    lng?: number | null
    placeId?: string | null
    plz?: string | null
  },
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Link ungültig.' }

  const adresse = (ort.adresse ?? '').trim()
  if (!adresse) return { ok: false, error: 'Bitte eine Adresse angeben.' }

  let lat = ort.lat ?? null
  let lng = ort.lng ?? null
  if (lat == null || lng == null) {
    try {
      const geo = await geocodeAdresse(adresse)
      lat = geo?.lat ?? null
      lng = geo?.lng ?? null
    } catch (err) {
      // Non-critical: die Adresse wird trotzdem gespeichert, das Matching faellt dann auf PLZ zurueck.
      console.error('[speichereOrtFlow] geocode:', err)
    }
  }

  const patch =
    art === 'fahrzeug'
      ? {
          fahrzeug_standort_adresse: adresse,
          fahrzeug_standort_lat: lat,
          fahrzeug_standort_lng: lng,
          fahrzeug_standort_place_id: ort.placeId ?? null,
          fahrzeug_standort_plz: ort.plz ?? null,
        }
      : {
          besichtigungsort_adresse: adresse,
          besichtigungsort_lat: lat,
          besichtigungsort_lng: lng,
          besichtigungsort_place_id: ort.placeId ?? null,
        }

  const { error: updErr } = await admin
    .from('leads')
    .update({ ...patch, updated_at: new Date().toISOString() })
    .eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }

  revalidatePath(`/flow/${token}`)
  return { ok: true }
}

/**
 * Selbst-Quali (Schuldfrage) für den Flow-Lead. Policy identisch zu /anfrage
 * SP-B1: qualiFlowOutcome-Router -> haftpflicht/kasko/selbstzahler (Details im Helfer).
 */
export async function speichereQualiFlow(
  token: string,
  schuldfrage: string,
  ueberEigeneVersicherung?: boolean,
  freieWerkstattwahl?: boolean,
): Promise<{ ok: boolean; ergebnis?: 'weiter' | 'abbruch'; abrechnungsweg?: string | null; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const outcome = qualiFlowOutcome(schuldfrage, ueberEigeneVersicherung ?? null, freieWerkstattwahl ?? null)
  const nowIso = new Date().toISOString()

  if (outcome.disqualifizieren) {
    const { error: updErr } = await admin
      .from('leads')
      .update({
        schuldfrage,
        // SP-B1: abrechnungsweg-Record (kasko). leads.abrechnungsweg type-lagged -> Cast unten.
        abrechnungsweg: outcome.abrechnungsweg,
        ...(freieWerkstattwahl !== undefined ? { freie_werkstattwahl: freieWerkstattwahl } : {}),
        disqualifiziert: true,
        disqualifiziert_am: nowIso,
        // WS2 (Kasko-frei): Kasko-Werkstattbindung korrekt labeln statt pauschal 'eigenverschulden'.
        disqualifiziert_grund_key: outcome.disqualifikationsGrundKey ?? 'eigenverschulden',
        disqualifiziert_grund:
          outcome.disqualifikationsGrundKey === 'werkstattbindung'
            ? 'Kasko mit Werkstattbindung — Reparatur nur in der vom Versicherer vorgeschriebenen Werkstatt, keine Vermittlung moeglich (Self-Service-Quali)'
            : 'Eigenverschulden — Gutachterkosten nicht über die gegnerische Haftpflicht regulierbar (Self-Service-Quali)',
        status: 'disqualifiziert',
      } as never)
      .eq('id', leadId)
    if (updErr) return { ok: false, error: updErr.message }
    await loeseGutachterZuordnung(
      admin,
      leadId,
      `quali_disqualifiziert: ${outcome.disqualifikationsGrundKey ?? 'eigenverschulden'}`,
    )
    revalidatePath('/dispatch/leads')
    return { ok: true, ergebnis: 'abbruch', abrechnungsweg: outcome.abrechnungsweg }
  }

  const update: Record<string, unknown> = { schuldfrage }
  // WS1a (Reduced-Repair-Aktivierung): den rohen VS-Input persistieren (leads.eigene_versicherung,
  // text 'ja'/'nein') — sonst geht er session-lokal verloren und der eigenverantwortung-Fall laesst
  // sich am Konversionspunkt (convert-lead-to-claim) nicht mehr zu kasko/selbstzahler ableiten.
  if (ueberEigeneVersicherung !== undefined) {
    update.eigene_versicherung = ueberEigeneVersicherung ? 'ja' : 'nein'
  }
  // WS2 (Kasko-frei): Werkstattbindung persistieren (leads.freie_werkstattwahl bool).
  if (freieWerkstattwahl !== undefined) update.freie_werkstattwahl = freieWerkstattwahl
  if (outcome.abrechnungsweg) update.abrechnungsweg = outcome.abrechnungsweg
  if (outcome.reparaturwunsch) update.reparaturwunsch = outcome.reparaturwunsch
  if (outcome.ergebnis === 'weiter_mit_flag') {
    update.notiz = `[Self-Service] Schuldfrage „${schuldfrage}" — Dispatcher-Review empfohlen.`
  }
  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }

  // Ops-Test 11.08. (RC-5): reparaturwunsch='reparatur' ist die Reparatur-Abzweigung
  // (selbstzahler bzw. kasko mit freier Werkstattwahl) — dort gibt es bewusst KEIN
  // SV-Gutachten (Aaron 08.07.). Der ueber den Gutachter-Finder bereits reservierte
  // Termin blieb hier trotzdem stehen: der Gutachter hatte einen Phantom-Termin im
  // Kalender fuer einen Auftrag, den er nie bekommt. Das ist der haeufigere Fall als
  // die Disqualifikation oben, weil der Lead ganz normal weiterlaeuft.
  if (outcome.reparaturwunsch === 'reparatur') {
    await loeseGutachterZuordnung(admin, leadId, `quali_reparatur: ${outcome.abrechnungsweg ?? 'unbekannt'}`)
  }

  revalidatePath('/dispatch/leads')
  return { ok: true, ergebnis: 'weiter', abrechnungsweg: outcome.abrechnungsweg }
}

/**
 * Ops-Test 11.08. (RC-5): Loest die Gutachter-Bindung eines Leads, wenn die Quali in einen
 * Zweig OHNE SV-Gutachten fuehrt (Disqualifikation oder Reparatur-Abzweigung).
 *
 * Aaron (Ops-Test): "bei selbstverschulden ... dadurch darf dann kein Gutachter mehr
 * hinterlegt sein." Zwei Dinge muessen weg:
 *   1. der aktive Termin — sonst blockiert er den Kalender-Slot des Gutachters
 *   2. die SV-Zuordnung auf der Finder-Anfrage — sonst zeigt der Dispatcher weiterhin
 *      einen SV zu einem Lead, der keinen bekommen soll
 * Der Wunschtermin bleibt als Historie stehen. Non-critical: der Lead-Update steht bereits,
 * ein Fehler hier darf die Quali-Antwort des Kunden nicht zurueckdrehen.
 */
async function loeseGutachterZuordnung(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
  grund: string,
): Promise<void> {
  await cancelOffeneTermineFuerBezug(admin, 'lead', leadId, grund)
  try {
    const { error } = await admin
      .from('gutachter_finder_anfragen')
      .update({ zugeordneter_sv_id: null, zugeordneter_sv_lead_id: null, termin_id: null })
      .eq('konvertiert_zu_lead_id', leadId)
    if (error) console.error('[quali] gfa-SV-Zuordnung loesen (non-critical):', error.message)
  } catch (err) {
    console.error('[quali] gfa-SV-Zuordnung loesen (non-critical):', err)
  }
}

/**
 * SP-B2: Direct-Reparatur-Abschluss (Selbstzahler ODER Kasko-Direct). Erzeugt aus dem
 * Flow-Lead den PARTIELLEN Claim (kein SV/Gutachten/SA) via convertLeadToClaim ohne
 * svIdFromTermin/signatureUrl. Nur wenn der Lead als Direkt-Reparatur qualifiziert ist
 * (abrechnungsweg='selbstzahler' ODER 'kasko', SP-B1; Kasko seit Aaron 08.07.).
 * Idempotent (convertLeadToClaim). Account-Step + Portal folgen im Wizard.
 */
export async function erzeugeSelbstzahlerClaim(
  token: string,
): Promise<{ ok: true; claimId: string } | { ok: false; error: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Defensive: nur echte Direkt-Reparatur-Vorgaenge (Selbstzahler ODER Kasko-Direct, Aaron 08.07.).
  // abrechnungsweg ist type-lagged -> select('*')+Cast.
  const { data: leadRow } = await admin.from('leads').select('*').eq('id', leadId).maybeSingle()
  const abrechnungsweg = (leadRow as Record<string, unknown> | null)?.abrechnungsweg as string | null | undefined
  if (abrechnungsweg !== 'selbstzahler' && abrechnungsweg !== 'kasko')
    return { ok: false, error: 'Kein Direkt-Reparatur-Vorgang.' }

  const { convertLeadToClaim } = await import('@/lib/leads/convert-lead-to-claim')
  const conv = await convertLeadToClaim({ leadId })
  if (!conv.ok) return { ok: false, error: conv.error }

  // T2 (AAR-956 Owner-Abschluss): Pflichtdok-Slots auch fuer den Direkt-Reparatur-Weg
  // (Selbstzahler/Kasko) anlegen. Bisher war dieser Pfad der EINZIGE Embed→Claim-Caller ohne
  // createPflicht (Haftpflicht/Admin haben es, #4515) -> ein Selbstzahler/Kasko-Kunde landete
  // slot-los, und der Onboarding-"Dokumente"-Step erscheint nur wenn offene Slots existieren
  // (get-onboarding-steps.ts:57, slot-getrieben — NICHT szenario-hardcoded) -> der Kunde wurde
  // nie nach seinen Belegen gefragt. Der Katalog gatet die Slots per Schaden-Kontext (schadensfotos/
  // unfallfotos/fahrzeugschein + Konditionale); der SV-Termin-Step bleibt fuer den Werkstatt-Weg
  // ausgeblendet (brauchtGutachter=false). Idempotent + non-fatal, identisches Muster wie #4515.
  // fallId (NICHT claimId) — createPflichtdokumenteFromKatalog insertet auf fall_id.
  try {
    const { createPflichtdokumenteFromKatalog } = await import('@/lib/dokumente/create-pflicht')
    await createPflichtdokumenteFromKatalog(admin, conv.fallId, leadRow as Record<string, unknown> | null)
  } catch (err) {
    console.error('[erzeugeSelbstzahlerClaim] Pflichtdok-Slots anlegen fehlgeschlagen (non-fatal):', err)
  }

  // ⚠ Aaron 15.07. — Sichtbarkeit fuer den Dispatch (bisher entstand der Kasko/Selbstzahler-Claim
  // KOMPLETT STILL: nur revalidatePath, keine Mitteilung). Der Dispatcher muss nichts tun — der Kunde
  // geht direkt zur Werkstatt — aber ein neuer Fall soll nicht unsichtbar entstehen.
  // NUR bei frischer Konversion: convertLeadToClaim ist idempotent und liefert bei einem bereits
  // konvertierten Lead claimNummer=null (gleiche Antwort wie beim ersten Mal, aber ohne Nummer). So
  // feuert eine Quali-Wiederholung keine zweite Mitteilung. Non-critical.
  if (conv.claimNummer != null) {
    try {
      const dispId = (leadRow as Record<string, unknown> | null)?.zugewiesen_an as string | null
      if (dispId) {
        await createMitteilung({
          empfaenger_id: dispId,
          empfaenger_rolle: 'admin',
          kategorie: 'update',
          titel:
            abrechnungsweg === 'kasko' ? 'Neuer Kasko-Fall' : 'Neuer Selbstzahler-Fall',
          inhalt: 'Kunde regelt direkt über die Werkstatt (kein Gutachter).',
          kontext_typ: 'fall',
          kontext_id: conv.claimId,
        })
      }
    } catch (err) {
      console.error('[erzeugeSelbstzahlerClaim] Dispatch-Mitteilung fehlgeschlagen (non-fatal):', err)
    }

    // AAR-956 17.07. (Befund 5, Benachrichtigungs-Matrix PR #4490): "Tab zu = Fall weg" —
    // Kasko/Selbstzahler bekam nach dem convert keinerlei Send (account-Step wurde real
    // nie erreicht, s. #4469). Minimal-Netz: Bestaetigungs-Mail mit Flow-Link, non-critical.
    // Interne/Test-Identitaeten werden nicht angemailt (Smoke-Rauschen).
    try {
      const kundenEmail = (leadRow as Record<string, unknown> | null)?.email as string | null | undefined
      const kundenVorname = (leadRow as Record<string, unknown> | null)?.vorname as string | null | undefined
      const { istInterneEmail } = await import('@/lib/testdaten/interne-identitaet')
      if (kundenEmail && !istInterneEmail(kundenEmail)) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://claimondo.de'
        const flowUrl = `${baseUrl}/flow/${token}`
        const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        const anrede = kundenVorname ? `Hallo ${esc(kundenVorname)},` : 'Hallo,'
        const { sendEmail } = await import('@/lib/email/google/client')
        await sendEmail({
          to: kundenEmail,
          subject: 'Ihr Fall bei Claimondo ist angelegt',
          html: `<div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; line-height: 1.5;">
  <p>${anrede}</p>
  <p>Ihr Fall wurde erfolgreich angelegt. Über den folgenden Link kommen Sie jederzeit zurück zu Ihrem Vorgang — auch wenn Sie den Browser-Tab schließen:</p>
  <p style="margin: 20px 0;"><a href="${flowUrl}" style="background: #4573A2; color: #ffffff; padding: 12px 22px; border-radius: 999px; text-decoration: none; font-weight: bold;">Zu meinem Vorgang</a></p>
  <p style="font-size: 13px; color: #555;">Oder direkt: <a href="${flowUrl}">${flowUrl}</a></p>
  <p>Wir kümmern uns ab jetzt um alles und melden uns in Kürze bei Ihnen.</p>
  <p>Mit freundlichen Grüßen<br>Ihr Claimondo-Team</p>
</div>`,
        })
      }
    } catch (err) {
      console.error('[erzeugeSelbstzahlerClaim] Bestaetigungs-Mail fehlgeschlagen (non-fatal):', err)
    }
  }

  revalidatePath('/dispatch/leads')
  return { ok: true, claimId: conv.claimId }
}

/**
 * SV-Matching für den Flow-Lead — kundensichere OeffentlichesSvProfil-Projektion.
 * AAR-956 §4: die Verzweigung (Ort-Gate / Fixer / global) kommt jetzt aus der EINEN
 * Resolver-Quelle `resolveFlowTerminState` statt inline. Das GLOBALE Matching nutzt
 * `planeTerminOeffentlich` (universelle Termin-Engine #2545 — leak-sichere 2+1-Projektion
 * via toOeffentlichesSvProfil, reachability + now-Floor); der FIXER (SV-Embed) bleibt
 * `matchAndSlots` + funnel-seitiger Merge (keine dritte Quelle). `ortFehlt` ersetzt das
 * fragile error-String-Sniffing der Consumer (FlowSlotStep) durch ein Typ-Flag.
 *  - Fixer (gfa-Back-Reference) → Fixer (matchAndSlots) zuerst + globale Alternativen (planeTerminOeffentlich) gemerged.
 *  - sonst → globales Matching via planeTerminOeffentlich (Engine-Ranking findeBestePerson + 2+1).
 */
export async function ladeMatchingFlow(
  token: string,
): Promise<{
  ok: boolean
  svs?: OeffentlichesSvProfil[]
  error?: string
  ortFehlt?: boolean
  // Item 1: bei ortFehlt ein Vorschlag aus unfallort_lat/lng — der Kunde bestaetigt
  // ihn 1-Klick oder waehlt anders (kein silent-use, da Unfallort != Auto-Standort).
  vorschlagOrt?: { adresse: string; lat: number; lng: number }
}> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const { data: lead } = await admin
    .from('leads')
    .select(
      // AAR-956 17.07. (Follow-up 3): + email/vorname/nachname — Betrachter-Identitaet
      // fuer den Test-SV-Angebots-Guard im Fixer-Pfad (istTestSvAngebotBlockiert).
      'besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng, besichtigungsort_adresse, fahrzeug_standort_adresse, unfallort, unfallort_lat, unfallort_lng, wunschtermin, disqualifiziert, werkstatt_id, email, vorname, nachname',
    )
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Vorgang nicht gefunden.' }

  let lat =
    (lead.besichtigungsort_lat as number | null) ??
    (lead.fahrzeug_standort_lat as number | null) ??
    null
  let lng =
    (lead.besichtigungsort_lng as number | null) ??
    (lead.fahrzeug_standort_lng as number | null) ??
    null

  // AAR-956: Text-Adresse vorhanden, aber keine Coords (z.B. Dispatcher-/Import-Lead oder Upstream
  // ohne Geocode) → EINMAL server-seitig geocoden + auf besichtigungsort_* persistieren (Cache, kein
  // Re-Geocode bei jedem Flow-Load, kanonisch fuer die Buchung). So muss der Kunde eine bereits
  // bekannte Adresse nicht neu eintippen, bevor der Resolver auf ort_abfragen faellt. Non-blocking:
  // Geocode-Fail (kein Mapbox-Token / kein Treffer) → lat/lng bleiben null → ort_abfragen wie bisher.
  if (lat == null || lng == null) {
    const adresse =
      (lead.besichtigungsort_adresse as string | null) ??
      (lead.fahrzeug_standort_adresse as string | null) ??
      null
    if (adresse) {
      const geo = await geocodeAdresse(adresse)
      if (geo) {
        lat = geo.lat
        lng = geo.lng
        try {
          // Ohne Geo-Anker findet findBestSV keinen Gutachter — der Fehlschlag ist
          // "nicht kritisch" fuer den Request, aber teuer fuer das Matching.
          const { error: geoFehler } = await admin
            .from('leads')
            .update({
              besichtigungsort_adresse: adresse,
              besichtigungsort_lat: geo.lat,
              besichtigungsort_lng: geo.lng,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId)
          if (geoFehler) {
            console.error(`[ladeMatchingFlow] Besichtigungsort nicht gespeichert (${leadId}):`, geoFehler.message)
          }
        } catch (err) {
          console.error('[ladeMatchingFlow] Geocode-Persist fehlgeschlagen (nicht kritisch):', err)
        }
      }
    }
  }

  // Task 11 — Werkstatt-Geo-Safety-Net (Resume-Pfad): Wenn Coords IMMER NOCH fehlen
  // UND der Lead eine werkstatt_id hat, die Werkstatt-Geo als Besichtigungsort verwenden.
  // Hauptpfad (FinderWizard, Task 10) setzt den Ort bereits vor Lead-Anlage — dieser
  // Block ist NUR das Resume-Safety-Net (z.B. Magic-Link nach Seiten-Refresh).
  // Persist best-effort: Fehler duerfen den Flow nicht unterbrechen.
  if (lat == null || lng == null) {
    const werkstattId = (lead as unknown as { werkstatt_id?: string | null }).werkstatt_id ?? null
    if (werkstattId) {
      const { data: ws } = await admin
        .from('werkstaetten')
        .select('lat, lng, adresse_strasse, adresse_plz, adresse_ort')
        .eq('id', werkstattId)
        .maybeSingle()
      const fallback = resolveWerkstattFallbackGeo(
        lat,
        lng,
        ws
          ? {
              lat: (ws as unknown as { lat: number | null }).lat ?? null,
              lng: (ws as unknown as { lng: number | null }).lng ?? null,
              adresse_strasse: (ws.adresse_strasse as string | null) ?? null,
              adresse_plz: (ws.adresse_plz as string | null) ?? null,
              adresse_ort: (ws.adresse_ort as string | null) ?? null,
            }
          : null,
      )
      if (fallback) {
        lat = fallback.lat
        lng = fallback.lng
        try {
          const { error: wsGeoFehler } = await admin
            .from('leads')
            .update({
              besichtigungsort_adresse: fallback.adresse || null,
              besichtigungsort_lat: fallback.lat,
              besichtigungsort_lng: fallback.lng,
              updated_at: new Date().toISOString(),
            })
            .eq('id', leadId)
          if (wsGeoFehler) {
            console.error(`[ladeMatchingFlow] Werkstatt-Geo nicht gespeichert (${leadId}):`, wsGeoFehler.message)
          }
        } catch (err) {
          console.error('[ladeMatchingFlow] Werkstatt-Geo-Persist fehlgeschlagen (nicht kritisch):', err)
        }
      }
    }
  }

  // Picked-SV liegt auf der gfa (leads hat keine SV-Spalte) — Back-Reference.
  const { data: gfa } = await admin
    .from('gutachter_finder_anfragen')
    .select('zugeordneter_sv_id')
    .eq('konvertiert_zu_lead_id', leadId)
    .maybeSingle()
  const fixerSvId = (gfa?.zugeordneter_sv_id as string | null) ?? null

  // EINE Quelle für die Zustands-Entscheidung (Spec §4). ladeMatchingFlow ist der
  // Buchungs-Pfad → hatTerminMitSv=false (Termin-vorhanden behandelt page.tsx).
  const state = resolveFlowTerminState({
    hatTerminMitSv: false,
    fixerSvId,
    besichtigungsLat: lat,
    besichtigungsLng: lng,
    disqualifiziert: Boolean(lead.disqualifiziert),
  })

  if (state.kind === 'disqualifiziert') {
    return { ok: false, error: 'Für diesen Vorgang ist keine Terminbuchung möglich.' }
  }
  if (state.kind === 'ort_abfragen') {
    // Task 3 ersetzt die telefonisch-Botschaft durch eine Adress-Abfrage im Flow;
    // ortFehlt macht den Zustand für den Consumer typsicher unterscheidbar.
    // Item 1: unfallort als VORSCHLAG mitgeben (NICHT silent als Besichtigungsort gesetzt
    // — der Unfallort ist i.d.R. nicht der Auto-Standort). Der Kunde bestaetigt 1-Klick
    // oder waehlt anders. Schaden-melden-Leads geocoden unfallort -> hier liegen Coords vor.
    const uLat = lead.unfallort_lat as number | null
    const uLng = lead.unfallort_lng as number | null
    const uAdr = (lead.unfallort as string | null)?.trim() || null
    const vorschlagOrt =
      uLat != null && uLng != null && uAdr
        ? { adresse: uAdr, lat: Number(uLat), lng: Number(uLng) }
        : undefined
    return {
      ok: false,
      ortFehlt: true,
      vorschlagOrt,
      error: 'Uns fehlt noch der Besichtigungsort — wir melden uns telefonisch für die Terminvereinbarung.',
    }
  }

  const wunschterminIso = (lead.wunschtermin as string | null) ?? null
  // AAR-956 17.07. (Follow-up 3): Lead-Identitaet fuer den Test-SV-Angebots-Guard —
  // nur der Fixer-Pfad wertet sie aus (Test-SV-Embed bietet nur intern Slots an).
  const kundenIdentitaet = {
    email: (lead as { email?: string | null }).email ?? null,
    name: [
      (lead as { vorname?: string | null }).vorname,
      (lead as { nachname?: string | null }).nachname,
    ].filter(Boolean).join(' ') || null,
  }
  if (state.kind === 'buchen_fixer') {
    // Fixer zuerst + Alternativen (global), Fixer aus den Alternativen rausdedupen.
    const [fixerList, globalList] = await Promise.all([
      matchAndSlots({ lat: Number(lat), lng: Number(lng), wunschterminIso, fixerSvId: state.fixerSvId, kundenIdentitaet }),
      planeTerminOeffentlich({ lat: Number(lat), lng: Number(lng), wunschterminIso, kundenIdentitaet }),
    ])
    return { ok: true, svs: mergeFixerUndAlternativen(fixerList, globalList, state.fixerSvId) }
  }

  // 'buchen_global' (zeige_termin ist hier unerreichbar: hatTerminMitSv=false).
  const svs = await planeTerminOeffentlich({ lat: Number(lat), lng: Number(lng), wunschterminIso, kundenIdentitaet })
  return { ok: true, svs }
}

/**
 * Self-Service-Termin reservieren (Flow-Lead). Setzt NUR lead_id auf
 * gutachter_termine (signSAandCreateFall findet via lead_id). KEIN `typ` →
 * NULL (vom CHECK toleriert); NIE reserviereSlot (typ:'vor_ort' = CHECK-Verletzung).
 * Konflikt-Check (Race) + Idempotenz (alte Reservierung dieses Leads stornieren).
 */
export async function bucheTerminFlow(
  token: string,
  svId: string,
  startIso: string,
  endIso: string,
): Promise<{ ok: boolean; terminId?: string; error?: string }> {
  if (!svId || !startIso || !endIso) return { ok: false, error: 'Termin-Daten fehlen.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // AAR-956 Booking-Repoint: Idempotenz (eine aktive Reservierung pro Lead) bleibt
  // funnel-seitig — storniert alte Lead-Reservierungen vor der neuen Buchung. Dual-
  // Lookup (Engine #2576), damit auch engine-reservierte (bezug) Termine getroffen werden.
  const { error: stornoFehler } = await admin
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'gegenvorschlag', 'abgelehnt'])
  // Genau hier haengt die zugesagte Idempotenz ("eine aktive Reservierung pro Lead").
  // Still fehlgeschlagen bleiben ZWEI aktive Reservierungen stehen — Doppelbelegung
  // im SV-Kalender, ohne dass irgendwo etwas rot wird.
  if (stornoFehler) {
    console.error(`[flow] Alt-Reservierungen nicht storniert (lead ${leadId}) — Doppelbuchung moeglich:`, stornoFehler.message)
  }

  // Reservierung über die Termin-Engine: race-safe via EXCLUSION-Constraint
  // gutachter_termine_no_assignee_overlap (DB-Level, kein App-TOCTOU-Pre-Check mehr).
  // FIX-Assignee (vom Kunden gewählter SV) + naheZeitpunkt → reserviere; die Engine
  // berechnet `bis` aus dauerMin. bezug_typ='lead' → Auto-Confirm bei SA liest via
  // findeTerminFuerLead (Dual-Lookup). endIso bleibt nur Eingabe-Guard (Engine-bis).
  const res = await planeTermin({
    bezug: { typ: 'lead', id: leadId },
    quelle: 'self_service',
    assigneeTyp: 'sachverstaendiger',
    assignee: { typ: 'sachverstaendiger', id: svId },
    wunschzeit: { naheZeitpunkt: startIso },
    modus: 'buchen',
    kanal: 'vor_ort',
  })
  if (res.ok && res.kind === 'gebucht') {
    revalidatePath('/dispatch/leads')
    return { ok: true, terminId: res.terminId }
  }
  if (!res.ok && res.code === 'belegt') {
    return { ok: false, error: 'Dieser Termin ist leider gerade vergeben. Bitte wählen Sie einen anderen.' }
  }
  return { ok: false, error: (!res.ok && res.error) || 'Termin konnte nicht reserviert werden.' }
}

/**
 * AAR-956 18.06. (Aaron): Termin/Gutachter im FlowLink selbst ändern. Der Kunde ist
 * NICHT mehr an seine Reservierung gebunden (vorher: read-only zeige_termin).
 *  - bestätigter Termin (SV ggf. committed) → NICHT still stornieren, sondern Rückruf-
 *    Flag + Notiz für Dispatch (modus='dispatch_anfrage'); der Termin bleibt bestehen.
 *  - reservierter Termin ODER Wunschtermin-pending → gfa-Pick + Wunschtermin lösen, sodass
 *    ladeMatchingFlow auf buchen_global fällt (NEUER Gutachter wählbar). KEIN Pre-Storno:
 *    bucheTerminFlow storniert die alte reservierte Buchung beim Neu-Buchen atomar
 *    (Idempotenz) → kein Fenster ohne Termin; ein Abbruch behält den alten Termin (er
 *    bleibt 'reserviert', terminMitSv bleibt true → zeige_termin). Der gelöste Pick
 *    verhindert zudem das falsche „≠ Wunsch"-Divergenz-Badge nach der Neuwahl.
 *  (modus='neu_waehlen' → der Consumer zeigt den Slot-Step inline.)
 */
export async function aendereTerminFlow(
  token: string,
): Promise<{ ok: boolean; modus?: 'neu_waehlen' | 'dispatch_anfrage'; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Aktueller harter Termin (Dual-Lookup) — der Status entscheidet den Pfad.
  const { data: termin } = await admin
    .from('gutachter_termine')
    .select('id, status')
    .or(`lead_id.eq.${leadId},and(bezug_typ.eq.lead,bezug_id.eq.${leadId})`)
    .in('status', ['reserviert', 'bestaetigt'])
    .order('start_zeit', { ascending: false })
    .limit(1)
    .maybeSingle()

  const { data: leadRow } = await admin.from('leads').select('notiz').eq('id', leadId).maybeSingle()
  const nowIso = new Date().toISOString()
  const bestehend = (leadRow?.notiz as string | null) ?? null

  // Bestätigter Termin → SV ggf. committed → an Dispatch (Rückruf), nicht still stornieren.
  if (termin?.status === 'bestaetigt') {
    const notiz = `[Self-Service ${nowIso.slice(0, 10)}] Kunde möchte Termin/Gutachter ändern — bestätigter Termin, bitte Rückruf/Umbuchung.${bestehend ? `\n${bestehend}` : ''}`
    const { error: updErr } = await admin
      .from('leads')
      .update({ status: 'rueckruf', notiz, updated_at: nowIso })
      .eq('id', leadId)
    if (updErr) return { ok: false, error: updErr.message }
    revalidatePath('/dispatch/leads')
    return { ok: true, modus: 'dispatch_anfrage' }
  }

  // reserviert ODER Wunschtermin-pending → Pick lösen (→ buchen_global) + Wunschtermin leeren.
  await admin
    .from('gutachter_finder_anfragen')
    .update({ zugeordneter_sv_id: null, termin_id: null })
    .eq('konvertiert_zu_lead_id', leadId)

  const notiz = `[Self-Service ${nowIso.slice(0, 10)}] Kunde hat Termin/Gutachter abgebrochen — wählt neu.${bestehend ? `\n${bestehend}` : ''}`
  const { error: updErr } = await admin
    .from('leads')
    .update({ wunschtermin: null, notiz, updated_at: nowIso })
    .eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true, modus: 'neu_waehlen' }
}

/**
 * AAR-956 §4 / Task 3: Besichtigungsort im Flow nachreichen (statt „wir melden uns
 * telefonisch"). Schreibt besichtigungsort_adresse/lat/lng auf den Lead; danach ruft
 * der Consumer (FlowSlotStep) erneut ladeMatchingFlow → der Resolver verlaesst den
 * ort_abfragen-Zustand. lat/lng kommen direkt aus GooglePlaceAutocomplete (kein
 * Server-Geocode noetig — nur eine Pflicht-Validierung gegen Freitext ohne Auswahl).
 */
export async function speichereBesichtigungsortFlow(
  token: string,
  ort: { adresse: string; lat: number; lng: number },
  wunschterminLokal?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  if (!ort || typeof ort.lat !== 'number' || typeof ort.lng !== 'number') {
    return { ok: false, error: 'Bitte wählen Sie eine Adresse aus den Vorschlägen.' }
  }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const update: {
    besichtigungsort_adresse: string
    besichtigungsort_lat: number
    besichtigungsort_lng: number
    updated_at: string
    wunschtermin?: string | null
  } = {
    besichtigungsort_adresse: ort.adresse,
    besichtigungsort_lat: ort.lat,
    besichtigungsort_lng: ort.lng,
    updated_at: new Date().toISOString(),
  }
  // AAR-956: optionaler Wunschtermin aus dem /flow-Slot-Step (Berlin-Wall-Clock -> UTC-ISO).
  // Nur setzen, wenn der Caller den Parameter uebergibt (undefined = alte Caller, unberuehrt).
  // ladeMatchingFlow liest lead.wunschtermin und rankt die Slots danach.
  if (wunschterminLokal !== undefined) {
    update.wunschtermin = resolveWunschterminIso(wunschterminLokal)
  }

  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

/**
 * Reparaturwunsch/Werkstatt: die bis zu 5 PASSENDSTEN Partner-Werkstaetten zum Flow-Lead laden.
 * Token-scoped (resolveFlowLead) — kein Client-leadId.
 *
 * Spec B/C (Aaron 14.07.): nicht mehr nur "die 5 naechsten", sondern gerankt nach
 *   Marke ("BMW markengebunden schlaegt freie Werkstatt") > Gewerke-Fit > Fahrzeug-Gruppe >
 *   verifiziert > Entfernung zum FAHRZEUGSTANDORT
 * mit sichtbaren Gruenden je Vorschlag (vorschlag.gruende). Harte Filter: Fahrzeug-Gruppe (eine
 * PKW-Werkstatt taucht bei einem LKW nicht auf) + Gewerke (ab bedarf_confidence 60).
 *
 * ⚠ Der Anker ist der FAHRZEUGSTANDORT (wo das Auto steht) — vorher wurde am BESICHTIGUNGSort
 * gesucht (dort kommt der Gutachter hin, nicht die Werkstatt).
 */
export async function ladeWerkstaettenFlow(
  token: string,
): Promise<{ ok: true; werkstaetten: WerkstattVorschlag[] } | { ok: false; error: string }> {
  const { leadId, error } = await resolveFlowLead(token)
  if (!leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const werkstaetten = await findWerkstattVorschlaegeFuer({
    target: 'lead',
    id: leadId,
    nurEchte: true,
  })
  return { ok: true, werkstaetten }
}

/**
 * Kunde waehlt im Flow eine Partner-Werkstatt (quelle='kunde'). Token-scoped: schreibt NUR
 * die zum Token gehoerende Lead-Zeile (leadId aus resolveFlowLead, NIE aus Client-Input) —
 * verhindert Ownership-Hijack (vgl. F1-Flow-Token-Binding-Haertung).
 */
export async function waehleWerkstattFlow(
  token: string,
  werkstattId: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!werkstattId) return { ok: false, error: 'Keine Werkstatt gewählt.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // Gate/Idempotenz: nur zuweisen, wenn der Lead wirklich eine Vermittlung braucht
  // (Reparatur-Intent, noch keine Werkstatt, Status offen). Verhindert Assign bei
  // falschem Intent + Re-Assign-Overwrite.
  const { data: leadRow } = await admin
    .from('leads')
    .select('reparaturwunsch, reparatur_werkstatt_id, werkstatt_id, reparatur_vermittlung_status')
    .eq('id', leadId)
    .maybeSingle()
  if (!leadRow) return { ok: false, error: 'Dieser Link ist ungültig.' }
  const row = leadRow as BedarfRow

  // Die Werkstattwahl IST die Antwort auf "Wie möchtest du den Schaden abrechnen?".
  // Wer die Frage überspringt, bekam den Step trotzdem angeboten — und jede Auswahl endete
  // in "Für diesen Vorgang ist keine Werkstatt-Auswahl möglich." (prod-verifiziert 28.08.).
  // Den Step wegzukonfigurieren geht NICHT (Sequenz beim Mount fixiert, `reparaturwunsch`
  // wird erst mitten im Flow erhoben) — also wird er hier bedienbar gemacht.
  // Entscheidungslogik + Begründung: pruefeWerkstattAuswahl in vermittlung-core.ts.
  const { erlaubt, wunschNachtragen } = pruefeWerkstattAuswahl(row)
  if (!erlaubt) {
    return { ok: false, error: 'Für diesen Vorgang ist keine Werkstatt-Auswahl möglich.' }
  }

  if (wunschNachtragen) {
    // Ergebnis prüfen: supabase-js wirft nicht, und ein stiller Fehlschlag hier hiesse,
    // dass der Abrechnungsweg unbestimmt bleibt, obwohl der Kunde eine Werkstatt hat.
    const { error: wunschErr } = await admin
      .from('leads')
      .update({ reparaturwunsch: 'reparatur' })
      .eq('id', leadId)
    if (wunschErr) {
      return { ok: false, error: `Abrechnungsweg konnte nicht gesetzt werden: ${wunschErr.message}` }
    }
  }

  // Nur eine der tatsächlich angebotenen zulassen — ein manipulierter Request darf keine beliebige
  // Werkstatt setzen. Die Quelle MUSS deckungsgleich mit ladeWerkstaettenFlow sein (gleiche Funktion,
  // gleiches nurEchte) — sonst wird eine angebotene Werkstatt beim Auswählen abgelehnt (oder eine
  // nicht angebotene durchgelassen). Beide gehen daher über findWerkstattVorschlaegeFuer.
  const angeboten = await findWerkstattVorschlaegeFuer({ target: 'lead', id: leadId, nurEchte: true })
  if (!angeboten.some((w) => w.id === werkstattId)) {
    return { ok: false, error: 'Bitte wählen Sie eine der angebotenen Werkstätten.' }
  }

  const res = await assignReparaturWerkstatt({
    target: 'lead',
    id: leadId,
    werkstattId,
    quelle: 'kunde',
    actorUserId: null,
  })
  if (!res.ok) return res
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

/**
 * AAR-956 §4 / Part 2: ZB1-Foto-Upload im FlowLink (flow_links-Token → Lead, anon,
 * pre-Konversion). Spiegelt runZb1OcrAndUpdate (/upload/dokumente), resolved aber über
 * den Flow-Token statt dokument_upload_anfragen — denselben OCR-Parser + H6-Konfliktregel
 * (nur leere Felder). KEINE neue OCR-Quelle (reuse runZB1Ocr). Füllt die Fahrzeug-/Halter-
 * Felder, die der ①-Feststellungs-Step bewusst auslässt ("kommen via ZB1-Foto in ②").
 * extracted-Shape inline — 'use server'-Files dürfen nur async Funktionen exportieren
 * (keine Types, AAR-664); der Consumer FlowZb1Upload spiegelt die Shape lokal.
 */
export async function uploadZb1Flow(
  token: string,
  imageBase64: string,
  contentType: string = 'image/jpeg',
): Promise<{
  ok: boolean
  error?: string
  extracted?: {
    kennzeichen: string | null
    fahrzeug_hersteller: string | null
    fahrzeug_modell: string | null
    halter_name: string | null
    // AAR-956 15.06.: strukturierte Halter-Felder für den Client-Merge (Halter-
    // Step vorausfüllen + ist_fahrzeughalter Name-Match) statt nur Anzeige.
    halter_vorname: string | null
    halter_nachname: string | null
    halter_strasse: string | null
    halter_plz: string | null
    halter_stadt: string | null
  }
}> {
  if (!imageBase64 || imageBase64.length < 100) return { ok: false, error: 'Bild fehlt oder zu klein.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  // H6: aktuellen Lead-Stand laden — nur leere Felder werden vom OCR überschrieben.
  const { data: lead } = await admin
    .from('leads')
    .select(
      'fahrzeug_hersteller, fahrzeug_modell, fahrzeug_baujahr, fahrzeug_farbe, kennzeichen, fin, erstzulassung, halter_vorname, halter_nachname, halter_strasse, halter_plz, halter_stadt, hsn, tsn, zb1_upload_versuche',
    )
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Vorgang nicht gefunden.' }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `leads/${leadId}/zb1_flow_${Date.now()}.${ext}`
  const buf = Buffer.from(imageBase64, 'base64')
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType, upsert: false })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }
  const { getStorageUrl } = await import('@/lib/storage/url')
  const publicUrl = await getStorageUrl(admin, 'fall-dokumente', path)

  const versuche = ((lead.zb1_upload_versuche as number | null) ?? 0) + 1
  const fehlgeschlagen = async (msg: string) => {
    const { error: zb1FehlStatus } = await admin
      .from('leads')
      .update({ zb1_status: 'fehlgeschlagen', zb1_url: publicUrl, zb1_upload_versuche: versuche, updated_at: new Date().toISOString() })
      .eq('id', leadId)
    if (zb1FehlStatus) console.error(`[flow] ZB1-Fehlstatus nicht gesetzt (${leadId}):`, zb1FehlStatus.message)
    return { ok: false as const, error: msg }
  }

  let ocr: { fullText: string; extracted: import('@/lib/ocr/zb1-parser').ZB1ExtractedData } | { error: string; status?: number }
  try {
    const { runZB1Ocr } = await import('@/lib/ocr/zb1-parser')
    ocr = await runZB1Ocr(imageBase64)
  } catch (err) {
    console.error('[uploadZb1Flow] OCR-Crash:', err instanceof Error ? err.message : err)
    return fehlgeschlagen('OCR-Fehler — bitte erneut versuchen.')
  }
  if ('error' in ocr) {
    console.error('[uploadZb1Flow] OCR fehlgeschlagen:', ocr.error)
    return fehlgeschlagen('Daten konnten nicht ausgelesen werden — bitte erneut versuchen.')
  }

  const { extracted } = ocr
  const update: Record<string, unknown> = {
    zb1_status: 'hochgeladen',
    zb1_url: publicUrl,
    zb1_hochgeladen_am: new Date().toISOString(),
    zb1_ocr_daten: { raw_text: ocr.fullText, extracted, ts: new Date().toISOString() },
    zb1_upload_versuche: versuche,
    updated_at: new Date().toISOString(),
  }
  Object.assign(update, buildZb1LeadUpdate(extracted, lead as Record<string, unknown>))
  const { error: updErr2 } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr2) return { ok: false, error: updErr2.message }
  revalidatePath('/dispatch/leads')

  return {
    ok: true,
    extracted: {
      kennzeichen: extracted.kennzeichen ?? null,
      fahrzeug_hersteller: extracted.fahrzeug_hersteller ?? null,
      fahrzeug_modell: extracted.fahrzeug_modell ?? null,
      halter_name: [extracted.halter_vorname, extracted.halter_nachname].filter(Boolean).join(' ') || null,
      halter_vorname: extracted.halter_vorname ?? null,
      halter_nachname: extracted.halter_nachname ?? null,
      halter_strasse: extracted.halter_strasse ?? null,
      halter_plz: extracted.halter_plz ?? null,
      halter_stadt: extracted.halter_stadt ?? null,
    },
  }
}

/**
 * AAR-956 Gebiet-3 (Funnel): Polizeibericht-Upload im FlowLink (flow_links-Token -> Lead, anon,
 * pre-Konversion). Erscheint clientseitig nur, wenn "Polizei vor Ort" = Ja. KEIN OCR — reiner
 * Dokument-Upload (Foto/PDF) in denselben Bucket wie uploadZb1Flow; setzt polizeibericht_url/
 * _status/_hochgeladen_am. Ueberspringbar (Client). service_role wie die anderen Flow-Uploads.
 */
export async function uploadPolizeiberichtFlow(
  token: string,
  fileBase64: string,
  contentType: string = 'image/jpeg',
): Promise<{ ok: boolean; error?: string }> {
  if (!fileBase64 || fileBase64.length < 100) return { ok: false, error: 'Datei fehlt oder zu klein.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const ext =
    contentType === 'application/pdf'
      ? 'pdf'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg'
  const path = `leads/${leadId}/polizeibericht_flow_${Date.now()}.${ext}`
  const buf = Buffer.from(fileBase64, 'base64')
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType, upsert: false })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }
  const { getStorageUrl } = await import('@/lib/storage/url')
  const publicUrl = await getStorageUrl(admin, 'fall-dokumente', path)

  const { error: updErr } = await admin
    .from('leads')
    .update({
      polizeibericht_url: publicUrl,
      polizeibericht_status: 'hochgeladen',
      polizeibericht_hochgeladen_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }

  // AAR-956 16.06. (Aaron): BKAT-Auslese aus dem Polizeibericht (Claude Vision via inferBkat)
  // — Aktenzeichen + abgeleitete bkat_unfallart. Best-effort/non-critical (ANTHROPIC_API_KEY
  // noetig; ohne Key No-op). H6: nur leere Lead-Felder fuellen. Polizei war vor Ort (Upload
  // nur dann sichtbar). getStorageUrl liefert eine (signierte) URL → Claude kann sie fetchen.
  try {
    const { inferBkat } = await import('@/lib/bkat/inference')
    const { data: leadVor } = await admin
      .from('leads')
      .select('unfallhergang, polizei_aktenzeichen, bkat_unfallart')
      .eq('id', leadId)
      .maybeSingle()
    const bkat = await inferBkat({
      polizeibericht_urls: publicUrl ? [publicUrl] : [],
      unfallhergang: (leadVor?.unfallhergang as string | null) ?? null,
    })
    const bkatUpdate: Record<string, unknown> = {}
    if (bkat.unfallart && !leadVor?.bkat_unfallart) bkatUpdate.bkat_unfallart = bkat.unfallart
    if (bkat.aktenzeichen && !leadVor?.polizei_aktenzeichen) bkatUpdate.polizei_aktenzeichen = bkat.aktenzeichen
    if (Object.keys(bkatUpdate).length > 0) {
      bkatUpdate.updated_at = new Date().toISOString()
      const { error: bkatFehler } = await admin.from('leads').update(bkatUpdate).eq('id', leadId)
      if (bkatFehler) console.error(`[uploadPolizeiberichtFlow] BKAT-Daten nicht gespeichert (${leadId}):`, bkatFehler.message)
    }
  } catch (err) {
    console.error('[uploadPolizeiberichtFlow] BKAT-Auslese fehlgeschlagen (non-critical):', err)
  }

  revalidatePath('/dispatch/leads')
  return { ok: true }
}

// ─── Task 2: Beratungstermin-Actions (AAR-956 Auto-Beratungstermin) ─────────
// Token-basierte Self-Service-Actions fuer den kb_beratung-Termin im /flow.
// Der Termin wird durch einen DB-Trigger automatisch angelegt (Task 1) und
// kann vom Kunden hier geladen, bestaetigt oder verschoben werden.

const BERATUNG_DAUER_MIN = 30

async function ladeAktivenBeratungstermin(
  admin: ReturnType<typeof createAdminClient>,
  leadId: string,
): Promise<{ id: string; status: string } | null> {
  // Termin-Engine-Contract: gutachter_termine NICHT direkt mit Legacy-Filtern querien —
  // der sanktionierte Dual-Lookup-Helper (findet auch bezug-native Termine, #2580).
  const { findeBeratungsterminFuerLead } = await import('@/lib/termine/finde-termin-fuer-lead')
  const t = await findeBeratungsterminFuerLead(admin, leadId)
  return t ? { id: t.id, status: t.status } : null
}

/** „Passt mir" — bestaetigt den Beratungstermin. */
export async function bestaetigeBeratungsterminFlow(
  token: string,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const termin = await ladeAktivenBeratungstermin(admin, leadId)
  if (!termin) return { ok: false, error: 'Kein Beratungstermin gefunden.' }
  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({ status: 'bestaetigt' })
    .eq('id', termin.id)
  if (updErr) return { ok: false, error: updErr.message }
  // SP2c: bestaetigter Beratungstermin in den externen KB-Kalender syncen. Fail-soft.
  await syncKbTerminOut(termin.id)
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

/** „Verschieben" — freier In-Place-Move (Kunde ist Koenig, keine Verfuegbarkeitspruefung). */
export async function verschiebeBeratungsterminFlow(
  token: string,
  neuStartIso: string,
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }
  const start = new Date(neuStartIso)
  if (Number.isNaN(start.getTime())) return { ok: false, error: 'Ungültige Zeit.' }
  if (start.getTime() < Date.now()) return { ok: false, error: 'Bitte einen Termin in der Zukunft wählen.' }
  const termin = await ladeAktivenBeratungstermin(admin, leadId)
  if (!termin) return { ok: false, error: 'Kein Beratungstermin gefunden.' }
  const end = new Date(start.getTime() + BERATUNG_DAUER_MIN * 60 * 1000)
  const { error: updErr } = await admin
    .from('gutachter_termine')
    .update({
      start_zeit: start.toISOString(),
      end_zeit: end.toISOString(),
      status: 'bestaetigt',
      verlegung_initiator_kunde: true,
    })
    .eq('id', termin.id)
  if (updErr) return { ok: false, error: updErr.message }
  // SP2c: verschobenen Beratungstermin im externen KB-Kalender nachziehen. Fail-soft.
  await syncKbTerminOut(termin.id)
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

// ─── Ende Task 2 ────────────────────────────────────────────────────────────

/**
 * AAR-956 16.06. (Aaron): Zeugenaussage-Upload im Flow (Polizei-&-Zeugen-Schritt, nur wenn
 * Zeugen='Ja'). Spiegelt uploadPolizeiberichtFlow — Foto/PDF in fall-dokumente, KEIN OCR.
 */
export async function uploadZeugenaussageFlow(
  token: string,
  fileBase64: string,
  contentType: string = 'image/jpeg',
): Promise<{ ok: boolean; error?: string }> {
  if (!fileBase64 || fileBase64.length < 100) return { ok: false, error: 'Datei fehlt oder zu klein.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const ext =
    contentType === 'application/pdf'
      ? 'pdf'
      : contentType === 'image/png'
        ? 'png'
        : contentType === 'image/webp'
          ? 'webp'
          : 'jpg'
  const path = `leads/${leadId}/zeugenaussage_flow_${Date.now()}.${ext}`
  const buf = Buffer.from(fileBase64, 'base64')
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType, upsert: false })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }
  const { getStorageUrl } = await import('@/lib/storage/url')
  const publicUrl = await getStorageUrl(admin, 'fall-dokumente', path)

  const { error: updErr } = await admin
    .from('leads')
    .update({
      zeugenaussage_url: publicUrl,
      zeugenaussage_status: 'hochgeladen',
      zeugenaussage_hochgeladen_am: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

/**
 * AAR-956 §4 / Part 2: manuelle Korrektur der per OCR ausgelesenen Fahrzeug-Felder
 * (der „manuell"-Weg). ANDERS als der OCR-H6-Fill: hier überschreibt der Kunde bewusst
 * (er korrigiert eine Fehl-Auslesung) → nur die übergebenen, nicht-leeren Felder setzen.
 */
export async function speichereZb1KorrekturFlow(
  token: string,
  korrektur: { kennzeichen?: string; fahrzeug_hersteller?: string; fahrzeug_modell?: string },
): Promise<{ ok: boolean; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const update: Record<string, unknown> = {}
  for (const key of ['kennzeichen', 'fahrzeug_hersteller', 'fahrzeug_modell'] as const) {
    const v = korrektur[key]
    if (typeof v === 'string' && v.trim()) update[key] = v.trim()
  }
  if (Object.keys(update).length === 0) return { ok: true }

  update.updated_at = new Date().toISOString()
  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true }
}

// ─── SP2 Task 3: Reparatur-Wunschtermin im Flow ─────────────────────────────

/**
 * SP2 Task 3: Kunden-Wunschtermin fuer die Reparatur speichern (optional).
 * Erscheint im FlowWerkstattStep sobald eine Werkstatt hinterlegt ist.
 * Schreibt leads.reparatur_wunschtermin (timestamptz, UTC).
 * Token-scoped via resolveFlowLead — kein Client-leadId vertraut.
 */
export async function speichereReparaturWunschterminFlow(
  token: string,
  wunschterminLokal: string,
): Promise<{ ok: boolean; error?: string }> {
  if (!token || !wunschterminLokal) {
    return { ok: false, error: 'Token und Wunschtermin sind erforderlich.' }
  }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Ungültiger Link.' }

  let utc: string | null
  try {
    utc = resolveWunschterminIso(wunschterminLokal)
  } catch {
    return { ok: false, error: 'Ungültiger Wunschtermin.' }
  }
  if (!utc) return { ok: false, error: 'Ungültiger Wunschtermin.' }

  const { error: updErr } = await admin
    .from('leads')
    .update({ reparatur_wunschtermin: utc })
    .eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath(`/flow/${token}`)
  return { ok: true }
}

/**
 * KI-Intake Phase 2 (Foto-Vision): Unfallfoto aus dem KI-Dialog entgegennehmen.
 *
 * Geschwister zu uploadZb1Flow — gleicher Token-Auth-Weg (resolveFlowLead), gleicher
 * Bucket. Die eigentliche Auswertung ist BESTAND: appendUnfallfotoAndAnalyze haengt die
 * URL an leads.schadensfoto_urls, laesst Haiku die sichtbaren Fahrzeugschaeden
 * beschreiben (-> leads.fahrzeugschaden_beschreibung) und setzt schaden_sichtbar.
 *
 * Warum nur der Lead-Mirror und kein fall_dokumente-Insert: vor der SA existiert noch
 * kein Fall — der Insert waere ein No-op. convert-lead-to-fall liest schadensfoto_urls
 * und zieht die Fotos bei der Konversion in die Akte nach. Der Lead-Weg ist also der
 * vollstaendige, nicht der halbe.
 *
 * Bewusst AWAIT (nicht fire-and-forget wie im Dokumente-Upload): der Chat sagt dem
 * Kunden, was die Assistentin auf dem Foto sieht — dafuer brauchen wir die Beschreibung.
 */
export async function uploadUnfallfotoFlow(
  token: string,
  imageBase64: string,
  contentType: string = 'image/jpeg',
): Promise<{ ok: boolean; error?: string; beschreibung?: string }> {
  if (!imageBase64 || imageBase64.length < 100) return { ok: false, error: 'Bild fehlt oder zu klein.' }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const ext = contentType === 'image/png' ? 'png' : contentType === 'image/webp' ? 'webp' : 'jpg'
  const path = `leads/${leadId}/unfallfoto_flow_${Date.now()}.${ext}`
  const buf = Buffer.from(imageBase64, 'base64')
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(path, buf, { contentType, upsert: false })
  if (upErr) return { ok: false, error: `Upload fehlgeschlagen: ${upErr.message}` }

  const { getStorageUrl } = await import('@/lib/storage/url')
  const publicUrl = await getStorageUrl(admin, 'fall-dokumente', path)
  if (!publicUrl) return { ok: false, error: 'URL-Generierung fehlgeschlagen.' }

  try {
    const { appendUnfallfotoAndAnalyze } = await import('@/lib/ai/vision/analyze-unfallfotos')
    await appendUnfallfotoAndAnalyze(leadId, publicUrl)
  } catch (err) {
    // Foto liegt im Storage + der Lead-Mirror wird im naechsten Versuch nachgezogen —
    // eine gescheiterte Analyse darf den Dialog nicht abbrechen.
    console.error('[flow-intake] Foto-Analyse fehlgeschlagen:', err)
    return { ok: true }
  }

  const { data } = await admin
    .from('leads')
    .select('fahrzeugschaden_beschreibung')
    .eq('id', leadId)
    .maybeSingle()
  const beschreibung = (data?.fahrzeugschaden_beschreibung as string | null) ?? undefined
  revalidatePath(`/flow/${token}`)
  return { ok: true, beschreibung }
}
