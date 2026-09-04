'use server'

import { createAdminClient } from '@/lib/supabase/admin'
import { createCase } from '@/lib/intake/create-case'
import { buildWerkstattFinderLeadExtra } from '@/lib/werkstatt/embed-finder-core'
import { ensureCanonicalFlowLinkForLead } from '@/lib/start-link/ensure-flowlink-for-lead'
import { getConsentedGaClientId } from '@/lib/analytics/ga4-conversions'
import { resolvePromoCodeToId } from '@/lib/makler/resolve-promo-code'
import { geocodeAdresse } from '@/lib/mapbox/geocode'
import { reverseGeocodeAddress } from '@/lib/google-geocoding/geocode-address'
import { pruefeEmbedFotos, type EmbedFoto } from '@/lib/werkstatt/bedarf/embed-foto-guard'
import { klassifiziereSchadenbildBase64 } from '@/lib/werkstatt/bedarf/schadenbild-gewerke'
import { klassifiziereSchadenbeschreibung } from '@/lib/werkstatt/bedarf/schadenbeschreibung-gewerke'
import { ladeWerkstattVorschlaege } from '@/lib/werkstatt/matching/lade-vorschlaege'
import { HART_SCHWELLE, type WerkstattVorschlag } from '@/lib/werkstatt/matching/rank-vorschlaege'
import { sanitizeBedarf } from '@/lib/werkstatt/bedarf/sanitize'
import { getStorageUrl } from '@/lib/storage/url'
import { notifyTeamNeuerLead } from '@/lib/leads/notify-team-lead'
import type { Reparaturbedarf, Fit } from '@/lib/werkstatt/bedarf/types'
import { sendOaiqEvent } from '@/lib/analytics/oaiq-capi'

export type WerkstattFinderLeadPayload = {
  vorname?: string | null
  nachname?: string | null
  email: string
  telefon?: string | null
  werkstattId?: string | null
  lat?: number | null
  lng?: number | null
  ort?: string | null
  fotos?: EmbedFoto[]
  bedarf?: Reparaturbedarf
  // Phase 3: db-driven Übergabe der Wizard-Felder
  hersteller?: string | null
  fahrzeugklasse?: string | null
  gewerbe?: boolean | null
  modell?: string | null
  beschreibung?: string | null
  // F1 (Entry-Point-Audit 24.07.) + Unverschuldet-Option (Aaron 04.08.): Schuldfrage-Wahl -> Lead-Szenario.
  // 'gegner' (unverschuldet) -> haftpflicht; 'eigenverantwortung' + eigeneVersicherung -> kasko/selbstzahler.
  schuldfrage?: 'eigenverantwortung' | 'gegner' | null
  eigeneVersicherung?: 'ja' | 'nein' | null
  // §10 Doppel-Lead-Falle: bestehender Flow-Token (Re-Entry) -> UPDATE statt INSERT.
  // Der Token ist die Capability; er wird server-seitig zu lead_id aufgeloest (nie roher leadId).
  flowToken?: string | null
  // E1.1 (Entry-Point-Matrix-Audit): Makler-/Partner-Promo-Code aus ?promo= — wird server-
  // seitig via resolvePromoCodeToId (Format-Guard + aktiv-Gate) zu promotion_code_id aufgeloest.
  promoCode?: string | null
  /** OpenAI-Ads-Kennung aus der Parent-URL (durch die iframe-Grenze gereicht). */
  oppref?: string | null
}

// Re-export fuer den Client (damit er keine extra imports braucht)
// KEINE Type-Re-Exports aus dieser 'use server'-Datei (AAR-664-Klasse): der Server-Actions-Loader
// macht aus JEDEM Export ein Action-Binding -> zur Laufzeit "EmbedFoto is not defined" -> ALLE
// Actions der Datei 500en (prod-Incident 16.07., Embed seit P1-Deploy tot). Types direkt aus
// @/lib/werkstatt/bedarf/{embed-foto-guard,types} importieren.

/**
 * T3: Transiente Schadenfoto-Klassifizierung fuer den Embed-Funnel.
 * Guarded (Abuse-Guard), fail-safe (kein Throw bei KI-Fehler).
 * Gibt Reparaturbedarf zurueck — kein Storage, kein Persistenz (transient).
 */
export async function klassifiziereSchadenfotoEmbed(images: EmbedFoto[]): Promise<Reparaturbedarf> {
  const guard = pruefeEmbedFotos(images)
  if (!guard.ok) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  const { kategorien, confidence } = await klassifiziereSchadenbildBase64(guard.images)
  if (kategorien.length === 0) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  return { kategorien, quelle: 'schadenbild', confidence }
}

// Text-KI-Weg fürs Embed: Freitext-Schadenbeschreibung → Gewerke-Bedarf (Phase-1-Klassifikator,
// fail-safe). Gleiche Output-Form wie klassifiziereSchadenfotoEmbed, quelle='schadenbeschreibung'.
export async function klassifiziereSchadenbeschreibungEmbed(beschreibung: string): Promise<Reparaturbedarf> {
  const text = beschreibung?.trim()
  if (!text) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  const { kategorien, confidence } = await klassifiziereSchadenbeschreibung(text)
  if (kategorien.length === 0) return { kategorien: [], quelle: 'unbekannt', confidence: 0 }
  return { kategorien, quelle: 'schadenbeschreibung', confidence }
}

/**
 * Ab HART_SCHWELLE gilt der Bedarf als sicher genug, um bei 0 Treffern eine
 * "keine Spezialisierte gefunden"-Warnung zu zeigen (Fallback zeigt trotzdem alle — die Engine
 * liefert bei komplett weggefilterten Kriterien lieber die Geo-naechsten als eine leere Liste).
 */
function keineSpezialisierteGefunden(
  werkstaetten: WerkstattVorschlag[],
  bedarf: { kategorien: string[]; confidence: number },
): boolean {
  return (
    bedarf.confidence >= HART_SCHWELLE &&
    bedarf.kategorien.length > 0 &&
    werkstaetten.every((w) => w.gewerkeFit === 'passt_nicht')
  )
}

/**
 * T4 (Phase 1 Task 4, #4359): Werkstatt-Suche auf die gerankte Matching-Engine umgestellt
 * (Marke → Gewerke → Fahrzeug-Gruppe → verifiziert → Distanz zum FAHRZEUGSTANDORT).
 * Phase 2 Task 2: Marke/Fahrzeugklasse kommen jetzt vom Wizard durch (wizardStateZuSuche) —
 * die Engine rankt scharf nach Marke/Fahrzeug-Gruppe statt nur nach Gewerke+Distanz.
 */
export async function sucheEchteWerkstaetten(input: {
  lat?: number
  lng?: number
  plz?: string
  bedarf?: Reparaturbedarf
  marke?: string | null
  fahrzeugklasse?: string | null
}): Promise<{ werkstaetten: WerkstattVorschlag[]; keineSpezialisierte: boolean }> {
  const anker = input.lat != null && input.lng != null ? { lat: input.lat, lng: input.lng } : null
  const b = sanitizeBedarf(input.bedarf)
  const werkstaetten = await ladeWerkstattVorschlaege({
    fahrzeugklasse: input.fahrzeugklasse ?? null,
    marke: input.marke ?? null,
    bedarf: b.kategorien,
    bedarfConfidence: b.confidence,
    anker,
    limit: 5,
    nurEchte: true,
  })
  return { werkstaetten, keineSpezialisierte: keineSpezialisierteGefunden(werkstaetten, b) }
}

/**
 * T4: Standalone-Finder-Suche nach freiem Ort/PLZ-String, ebenfalls auf die gerankte Engine
 * umgestellt. Geocodiert die Eingabe (Mapbox, DE-scoped) weiterhin unveraendert; der Geocode-Treffer
 * wird als Anker (Fahrzeugstandort-Proxy) an die Engine gereicht. center=null => Ort nicht gefunden.
 */
export async function sucheWerkstaettenNachOrt(
  query: string,
  bedarf?: Reparaturbedarf,
): Promise<{
  werkstaetten: WerkstattVorschlag[]
  center: { lat: number; lng: number } | null
  keineSpezialisierte: boolean
}> {
  const geo = await geocodeAdresse(query)
  if (!geo) return { werkstaetten: [], center: null, keineSpezialisierte: false }
  const b = sanitizeBedarf(bedarf)
  const werkstaetten = await ladeWerkstattVorschlaege({
    fahrzeugklasse: null,
    marke: null,
    bedarf: b.kategorien,
    bedarfConfidence: b.confidence,
    anker: { lat: geo.lat, lng: geo.lng },
    limit: 5,
    nurEchte: true,
  })
  return {
    werkstaetten,
    center: { lat: geo.lat, lng: geo.lng },
    keineSpezialisierte: keineSpezialisierteGefunden(werkstaetten, b),
  }
}

/** Hilfsfunktion: Dateiendung aus media_type ableiten. */
function extFromMediaType(mediaType: string): string {
  if (mediaType === 'image/jpeg') return 'jpg'
  if (mediaType === 'image/png') return 'png'
  if (mediaType === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Oeffentlicher Embed-Finder: legt einen Lead an (Reparateur-Zuweisung nur wenn gewaehlt
 * UND Test-Guard passt, sonst Supply-Gate=ohne Werkstatt) und liefert einen FlowLink-Token,
 * mit dem der Kunde in den bestehenden /flow einsteigt (dieser verzweigt die Strecke).
 *
 * T5: Optional fotos + bedarf → nicht-kritisch bei Conversion persistiert:
 * - Fotos → fall-dokumente Storage unter leads/{leadId}/schadensfoto_{ts}_{rand}.{ext}
 * - URLs → leads.schadensfoto_urls
 * - Bedarf → leads.bedarf_kategorien / bedarf_quelle / bedarf_confidence / bedarf_ermittelt_am
 */
export async function erstelleWerkstattFinderLead(
  payload: WerkstattFinderLeadPayload,
): Promise<{ ok: true; token: string } | { ok: false; error: string }> {
  if (!payload.email?.trim()) return { ok: false, error: 'E-Mail fehlt' }

  const admin = createAdminClient()

  // Werkstatt-Email fuer den Test-Guard (nur wenn eine Werkstatt gewaehlt wurde).
  let werkstattEmail: string | null = null
  if (payload.werkstattId) {
    const { data: ws } = await admin
      .from('werkstaetten')
      .select('email')
      .eq('id', payload.werkstattId)
      .maybeSingle()
    werkstattEmail = (ws?.email as string | null) ?? null
  }

  const gaClientId = await getConsentedGaClientId()

  const extra = buildWerkstattFinderLeadExtra({
    werkstattId: payload.werkstattId ?? null,
    werkstattEmail,
    kundeEmail: payload.email,
    lat: payload.lat ?? null,
    lng: payload.lng ?? null,
    ort: payload.ort ?? null,
    hersteller: payload.hersteller ?? null,
    fahrzeugklasse: payload.fahrzeugklasse ?? null,
    gewerbe: payload.gewerbe ?? null,
    modell: payload.modell ?? null,
    beschreibung: payload.beschreibung ?? null,
    schuldfrage: payload.schuldfrage ?? null,
    eigeneVersicherung: payload.eigeneVersicherung ?? null,
  })
  if (gaClientId) (extra as Record<string, unknown>).ga_client_id = gaClientId
  // OpenAI-Ads-Attribution — dieselbe Zeile eins hoeher, nur fuer das andere Werbenetz.
  // Kommt als URL-Parameter durch die iframe-Grenze: das __oppref-Cookie gehoert
  // claimondo.de und ist hier auf app.claimondo.de nicht lesbar.
  if (payload.oppref) (extra as Record<string, unknown>).oppref = payload.oppref
  // E1.1: Promo-Attribution (Provision-Spur). resolver liefert nur fuer gueltige AKTIVE
  // MK-Codes eine id — Muell/inaktiv -> null -> Feld bleibt weg (auch im UPDATE-Pfad, der
  // null-Werte strippt: eine bestehende Attribution wird nie durch Re-Entry geloescht).
  const promotionCodeId = await resolvePromoCodeToId(payload.promoCode)
  if (promotionCodeId) (extra as Record<string, unknown>).promotion_code_id = promotionCodeId

  // §10 Doppel-Lead-Falle (Mirror des Gutachter-Musters, gutachter-finder/actions.ts:248ff):
  // Kommt der Embed mit einem bestehenden Flow-Token (Re-Entry), wird der BESTEHENDE Lead
  // aktualisiert statt ein zweiter angelegt. Ungueltiger/abgelaufener Token = "Entry ohne
  // Lead" -> normaler INSERT (robuster als eine Sackgasse; genau die Spec-§10-Semantik).
  let leadId: string | null = null
  const flowToken = payload.flowToken?.trim()
  if (flowToken) {
    const { data: fl } = await admin
      .from('flow_links')
      .select('lead_id')
      .eq('token', flowToken)
      .maybeSingle()
    const bestehend = (fl?.lead_id as string | null) ?? null
    if (bestehend) {
      // Nur BELEGTE Werte uebernehmen: null/undefined strippen (ein Re-Entry darf vorhandene
      // Lead-Daten nicht mit Luecken ueberschreiben) — false/0 sind WERTE und bleiben
      // (gewerbe_flag=false = "privat", eine echte Antwort).
      const update: Record<string, unknown> = {}
      for (const [k, v] of Object.entries(extra)) {
        if (v !== null && v !== undefined) update[k] = v
      }
      if (payload.vorname?.trim()) update.vorname = payload.vorname.trim()
      if (payload.nachname?.trim()) update.nachname = payload.nachname.trim()
      if (payload.telefon?.trim()) update.telefon = payload.telefon.trim()
      update.email = payload.email.trim()
      const { error: updErr } = await admin.from('leads').update(update).eq('id', bestehend)
      if (updErr) return { ok: false, error: updErr.message }
      leadId = bestehend
    }
  }

  // C2b (Fundament B-1): Neu-Lead ueber createCase statt createLead — EIN Intake-Pfad mit
  // garantierten Nachwirkungen (FlowLink immer + Dedup). Der Re-Entry-Pfad oben (bestehender
  // Lead via FlowLink-Token) bleibt unveraendert: dort wird aktualisiert, nicht angelegt.
  // triggerByUserId entfaellt (public Embed, kein User; mode='lead-first' braucht ihn nicht).
  let flowTokenAusIntake: string | null = null
  if (!leadId) {
    const result = await createCase(admin, {
      mode: 'lead-first',
      base: {
        vorname: payload.vorname ?? null,
        nachname: payload.nachname ?? null,
        email: payload.email,
        telefon: payload.telefon ?? null,
        source_channel: 'werkstatt_finder',
        status: 'neu',
      },
      extra,
      dedup: {
        telefon: payload.telefon ?? null,
        email: payload.email,
        // Der Finder erhebt kein Kennzeichen -> dedupKeyIsUsable() ist false und createCase
        // ueberspringt den Dedup. Bewusst mitgegeben, damit der Key automatisch greift,
        // sobald der Finder das Kennzeichen erhebt (kein zweiter Eingriff noetig).
        kennzeichen: (extra as Record<string, unknown>).kennzeichen as string | null ?? null,
      },
    })
    if (!result.ok) return { ok: false, error: result.error }
    leadId = result.leadId
    flowTokenAusIntake = result.flowLinkToken

    // Team-WA bei NEUEM Lead (Audit 23.08.: dieser Eintrittspunkt war stumm —
    // ein Kunde meldete hier einen Schaden und niemand erfuhr davon). Bewusst
    // nur im !leadId-Zweig: der Re-Entry ueber einen bestehenden FlowLink-Token
    // ist kein neuer Interessent und wuerde sonst bei jedem Schritt melden.
    await notifyTeamNeuerLead({
      leadId,
      quelle: 'Werkstatt-Finder',
      name: [payload.vorname, payload.nachname].filter(Boolean).join(' '),
      telefon: payload.telefon ?? null,
      email: payload.email,
    })

    // OpenAI Ads: lead_created. Im selben Zweig wie die Team-Meldung — ein
    // Re-Entry ueber denselben FlowLink ist kein zweiter Interessent und darf
    // auch keine zweite Conversion sein.
    // Nicht awaited: der Kunde wartet gerade auf sein Suchergebnis (Muster wie
    // `void trackServerConversion(...)` im GA4-Pfad).
    if (payload.oppref) {
      void sendOaiqEvent({ oppref: payload.oppref, eventId: leadId, eventName: 'lead_created' })
    }
  }

  // T5: Foto + Bedarf nicht-kritisch persistieren (vor FlowLink-Return).
  // Ein Fehler hier bricht den Lead-Anlage-Return NICHT.
  try {
    const neueUrls: string[] = []

    // Security: den transienten Abuse-Guard auch im Persist-Pfad anwenden.
    // Auf dem PUBLIC fall-dokumente-Bucket verhindert das (a) Storage-Spam durch
    // anon Caller (Count-Cap 3, Size-Cap 5MB) und (b) client-kontrollierten
    // contentType (nur jpeg/png/webp durch die Media-Type-Whitelist).
    const guard = pruefeEmbedFotos(payload.fotos ?? [])
    const sichereFotos = guard.ok ? guard.images : []

    // Fotos hochladen (je Foto nicht-fatal).
    for (const foto of sichereFotos) {
      try {
        const buffer = Buffer.from(foto.data, 'base64')
        const ext = extFromMediaType(foto.media_type)
        const rand = Math.random().toString(36).slice(2, 8)
        const path = `leads/${leadId}/schadensfoto_${Date.now()}_${rand}.${ext}`
        const { error: uploadErr } = await admin.storage
          .from('fall-dokumente')
          .upload(path, buffer, { contentType: foto.media_type })
        if (uploadErr) {
          console.error('[werkstatt-finder] Foto-Upload fehlgeschlagen (non-fatal):', uploadErr.message)
          continue
        }
        const url = await getStorageUrl(admin, 'fall-dokumente', path)
        if (url) neueUrls.push(url)
      } catch (err) {
        console.error('[werkstatt-finder] Foto-Upload-Schleife fehlgeschlagen (non-fatal):', err)
      }
    }

    // Leads-Update: schadensfoto_urls + bedarf (kombiniert).
    const updatePayload: Record<string, unknown> = {}
    if (neueUrls.length > 0) {
      updatePayload.schadensfoto_urls = neueUrls
    }
    if (payload.bedarf) {
      // Sanitize: schuetzt u.a. das int2-bedarf_confidence-Update vor Overflow
      // und filtert nicht-Gewerk-Kategorien / ungueltige quelle.
      const b = sanitizeBedarf(payload.bedarf)
      updatePayload.bedarf_kategorien = b.kategorien
      updatePayload.bedarf_quelle = b.quelle
      updatePayload.bedarf_confidence = b.confidence
      updatePayload.bedarf_ermittelt_am = new Date().toISOString()
    }
    if (Object.keys(updatePayload).length > 0) {
      // Das try faengt den Write nicht. Ohne ihn fehlen Fotos und ermittelter Bedarf
      // am Lead — die Werkstatt-Vermittlung liefe dann auf leerer Grundlage.
      const { error: bedarfFehler } = await admin.from('leads').update(updatePayload as never).eq('id', leadId)
      if (bedarfFehler) {
        console.error(`[werkstatt-finder] Foto/Bedarf nicht gespeichert (Lead ${leadId}):`, bedarfFehler.message)
      }
    }
  } catch (err) {
    console.error('[werkstatt-finder] Foto/Bedarf-Persistenz fehlgeschlagen (non-fatal):', err)
  }

  // FlowLink. C2b: im Neu-Lead-Pfad hat createCase ihn bereits erzeugt (FlowLink-immer-Garantie)
  // -> Token direkt verwenden statt ein zweites Mal zu erzeugen. Der explizite Call bleibt fuer
  // den Re-Entry-Pfad (bestehender Lead) und als Fallback, falls createCase's non-fataler
  // FlowLink-Schritt fehlschlug. ensureCanonicalFlowLinkForLead ist idempotent.
  if (flowTokenAusIntake) return { ok: true, token: flowTokenAusIntake }
  try {
    const link = await ensureCanonicalFlowLinkForLead(leadId)
    if (link.ok) return { ok: true, token: link.token }
    return { ok: false, error: link.error }
  } catch (err) {
    console.error('[werkstatt-finder] FlowLink fehlgeschlagen', err)
    return { ok: false, error: 'Flow-Link konnte nicht erstellt werden' }
  }
}

// „Aktuellen Standort verwenden": Client liefert Browser-Koordinaten, wir liefern die Adresse zurück.
// Fällt Reverse-Geocoding aus, reichen dem Anker die Koordinaten (Client zeigt „Aktueller Standort").
export async function holeAdresseFuerStandort(
  lat: number,
  lng: number,
): Promise<{ ok: true; adresse: string; lat: number; lng: number } | { ok: false; error: string }> {
  const r = await reverseGeocodeAddress(lat, lng)
  if (!r.ok) return { ok: false, error: r.error }
  return { ok: true, adresse: r.data.formatted_address, lat, lng }
}
