'use server'

// AAR-956 §3a: Lead-gekeyte Self-Service-Actions für den datengetriebenen /flow-
// Pfad (termin-loser Lead aus /start). Spiegelt die /anfrage-Actions (speichereQuali/
// ladeMatching/bucheTermin), aber resolved über flow_links-Token → Lead statt über
// gfa.self_service_token. Reuse der Shared-Libs (matchAndSlots, bewerteSchuldfrage).
// Phase C deprecatet /anfrage → diese hier bleiben der kanonische /flow-Pfad.

import { revalidatePath } from 'next/cache'
import { createAdminClient } from '@/lib/supabase/admin'
import { bewerteSchuldfrage } from '@/lib/self-service/quali-gate'
import { matchAndSlots, planeTerminOeffentlich, type OeffentlichesSvProfil } from '@/lib/sv-matching-modul'
import { mergeFixerUndAlternativen } from '@/lib/self-service/merge-fixer-alternativen'
import { resolveFlowTerminState } from '@/lib/self-service/flow-resolver'

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
 * Selbst-Quali (Schuldfrage) für den Flow-Lead. Policy identisch zu /anfrage
 * speichereQuali: nur Eigenverschulden disqualifiziert (KEIN Termin).
 */
export async function speichereQualiFlow(
  token: string,
  schuldfrage: string,
): Promise<{ ok: boolean; ergebnis?: 'weiter' | 'abbruch'; error?: string }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const ergebnis = bewerteSchuldfrage(schuldfrage)
  const nowIso = new Date().toISOString()

  if (ergebnis === 'abbruch') {
    const { error: updErr } = await admin
      .from('leads')
      .update({
        schuldfrage,
        disqualifiziert: true,
        disqualifiziert_am: nowIso,
        disqualifiziert_grund_key: 'eigenverschulden',
        disqualifiziert_grund:
          'Eigenverschulden — Gutachterkosten nicht über die gegnerische Haftpflicht regulierbar (Self-Service-Quali)',
        status: 'disqualifiziert',
      })
      .eq('id', leadId)
    if (updErr) return { ok: false, error: updErr.message }
    revalidatePath('/dispatch/leads')
    return { ok: true, ergebnis: 'abbruch' }
  }

  const update: Record<string, unknown> = { schuldfrage }
  if (ergebnis === 'weiter_mit_flag') {
    update.notiz = `[Self-Service] Schuldfrage „${schuldfrage}" — Dispatcher-Review empfohlen.`
  }
  const { error: updErr } = await admin.from('leads').update(update).eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
  revalidatePath('/dispatch/leads')
  return { ok: true, ergebnis: 'weiter' }
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
): Promise<{ ok: boolean; svs?: OeffentlichesSvProfil[]; error?: string; ortFehlt?: boolean }> {
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const { data: lead } = await admin
    .from('leads')
    .select(
      'besichtigungsort_lat, besichtigungsort_lng, fahrzeug_standort_lat, fahrzeug_standort_lng, wunschtermin, disqualifiziert',
    )
    .eq('id', leadId)
    .maybeSingle()
  if (!lead) return { ok: false, error: 'Vorgang nicht gefunden.' }

  const lat =
    (lead.besichtigungsort_lat as number | null) ??
    (lead.fahrzeug_standort_lat as number | null) ??
    null
  const lng =
    (lead.besichtigungsort_lng as number | null) ??
    (lead.fahrzeug_standort_lng as number | null) ??
    null

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
    return {
      ok: false,
      ortFehlt: true,
      error: 'Uns fehlt noch der Besichtigungsort — wir melden uns telefonisch für die Terminvereinbarung.',
    }
  }

  const wunschterminIso = (lead.wunschtermin as string | null) ?? null
  if (state.kind === 'buchen_fixer') {
    // Fixer zuerst + Alternativen (global), Fixer aus den Alternativen rausdedupen.
    const [fixerList, globalList] = await Promise.all([
      matchAndSlots({ lat: Number(lat), lng: Number(lng), wunschterminIso, fixerSvId: state.fixerSvId }),
      planeTerminOeffentlich({ lat: Number(lat), lng: Number(lng), wunschterminIso }),
    ])
    return { ok: true, svs: mergeFixerUndAlternativen(fixerList, globalList, state.fixerSvId) }
  }

  // 'buchen_global' (zeige_termin ist hier unerreichbar: hatTerminMitSv=false).
  const svs = await planeTerminOeffentlich({ lat: Number(lat), lng: Number(lng), wunschterminIso })
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

  const { data: konflikt } = await admin
    .from('gutachter_termine')
    .select('id')
    .eq('sv_id', svId)
    .not('status', 'in', '("storniert","abgelehnt","abgesagt","no_show")')
    .lt('start_zeit', endIso)
    .gt('end_zeit', startIso)
    .limit(1)
  if (konflikt && konflikt.length > 0) {
    return { ok: false, error: 'Dieser Termin ist leider gerade vergeben. Bitte wählen Sie einen anderen.' }
  }

  await admin
    .from('gutachter_termine')
    .update({ status: 'storniert' })
    .eq('lead_id', leadId)
    .in('status', ['reserviert', 'gegenvorschlag', 'abgelehnt'])

  const { data: inserted, error: insErr } = await admin
    .from('gutachter_termine')
    .insert({
      lead_id: leadId,
      sv_id: svId,
      start_zeit: startIso,
      end_zeit: endIso,
      status: 'reserviert',
    })
    .select('id')
    .single()
  if (insErr || !inserted) {
    return { ok: false, error: insErr?.message ?? 'Termin konnte nicht reserviert werden.' }
  }

  revalidatePath('/dispatch/leads')
  return { ok: true, terminId: inserted.id as string }
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
): Promise<{ ok: boolean; error?: string }> {
  if (!ort || typeof ort.lat !== 'number' || typeof ort.lng !== 'number') {
    return { ok: false, error: 'Bitte wählen Sie eine Adresse aus den Vorschlägen.' }
  }
  const { admin, leadId, error } = await resolveFlowLead(token)
  if (!admin || !leadId) return { ok: false, error: error ?? 'Dieser Link ist ungültig.' }

  const { error: updErr } = await admin
    .from('leads')
    .update({
      besichtigungsort_adresse: ort.adresse,
      besichtigungsort_lat: ort.lat,
      besichtigungsort_lng: ort.lng,
      updated_at: new Date().toISOString(),
    })
    .eq('id', leadId)
  if (updErr) return { ok: false, error: updErr.message }
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
    await admin
      .from('leads')
      .update({ zb1_status: 'fehlgeschlagen', zb1_url: publicUrl, zb1_upload_versuche: versuche, updated_at: new Date().toISOString() })
      .eq('id', leadId)
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
  const setIfEmpty = (field: string, value: string | number | null | undefined) => {
    if (value == null) return
    const current = (lead as Record<string, unknown>)[field]
    if (current == null || current === '') update[field] = value
  }
  setIfEmpty('fin', extracted.fin_vin)
  setIfEmpty('kennzeichen', extracted.kennzeichen)
  setIfEmpty('fahrzeug_hersteller', extracted.fahrzeug_hersteller)
  setIfEmpty('fahrzeug_modell', extracted.fahrzeug_modell)
  setIfEmpty('fahrzeug_baujahr', extracted.fahrzeug_baujahr)
  setIfEmpty('erstzulassung', extracted.erstzulassung)
  setIfEmpty('halter_vorname', extracted.halter_vorname)
  setIfEmpty('halter_nachname', extracted.halter_nachname)
  setIfEmpty('halter_strasse', extracted.halter_strasse)
  setIfEmpty('halter_plz', extracted.halter_plz)
  setIfEmpty('halter_stadt', extracted.halter_stadt)
  setIfEmpty('hsn', extracted.hsn)
  setIfEmpty('tsn', extracted.tsn)
  setIfEmpty('fahrzeug_farbe', extracted.fahrzeug_farbe)
  setIfEmpty('brn', extracted.brn)
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
