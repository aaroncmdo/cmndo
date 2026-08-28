'use server'

// AAR-163 / W3: Dokumente-Actions für die Fallakte.
// - triggerFinCallForFall: ruft Cardentity DAT/Audatex über enrichFallByFin
// - markDokumentNachgereicht: setzt nachgereicht_status auf pflichtdokumente
//   (AAR-163 Nachreichen-Flow)
// AAR-311: requestCardentityTypBForFall — manueller Typ-B-Trigger aus der
// KB-Fallakte (Admin + Kundenbetreuer dürfen).

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireRole } from '@/lib/auth/guards'
import { resolveClaimId } from '@/lib/claims/get-claim-for-role'
import { revalidatePath } from 'next/cache'
import type { CardentityRunResult } from '@/lib/cardentity/run-full'
import { upsertKanzleiFall } from '@/lib/kanzlei-fall/upsert-kanzlei-fall'
import { touchClaimRecency } from '@/lib/claims/touch-recency'

export async function triggerFinCallForFall(
  fallId: string,
): Promise<{ success: boolean; updatedFields?: string[]; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  // Rollen-Check: nur KB/Admin dürfen den (kostenpflichtigen) FIN-Call triggern
  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (rolle !== 'admin' && rolle !== 'kundenbetreuer') {
    return { success: false, error: 'Nur KB/Admin dürfen FIN-Call triggern' }
  }

  // Cardentity scharf: ein Call holt Fahrzeugdaten + Vorschaden, claim/vehicle-gebunden.
  const { runCardentityCheck } = await import('@/lib/cardentity/run-full')
  const result = await runCardentityCheck('fall', fallId)
  if (!result.success) return { success: false, error: result.error }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, updatedFields: result.vehicleFieldsUpdated }
}

/**
 * Nachreichen-Status auf einem Pflichtdokument setzen.
 * Status: 'ausstehend' (default) | 'nachgereicht_angefordert' | 'hochgeladen'
 * Der Reminder-Cron liest diese Spalte und triggert WA-Erinnerungen (W3
 * Cron-Erweiterung folgt wenn die Spalte in allen Consumer-Flows gepflegt
 * wird).
 */
export async function markDokumentNachgereicht(
  pflichtdokId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: pdok } = await supabase
    .from('pflichtdokumente')
    .select('fall_id')
    .eq('id', pflichtdokId)
    .single()
  if (!pdok) return { success: false, error: 'Pflichtdokument nicht gefunden' }

  // Das Status-Feld der Tabelle speichert den Lebenszyklus
  // (ausstehend/hochgeladen/geprueft) — wir ergänzen hier den Zwischenschritt
  // „nachgereicht_angefordert" als Text-Flag, damit die bestehenden
  // Dokumente-UI + Cron-Logik nichts brechen. Echte Migration auf eigene
  // Spalte nachgereicht_status kann folgen sobald klar ist dass mehrere
  // Stellen das Feld brauchen.
  const { error } = await supabase
    .from('pflichtdokumente')
    .update({
      status: 'nachgereicht_angefordert',
      // pflichtdokumente hat keine updated_at-Spalte.
    })
    .eq('id', pflichtdokId)

  if (error) return { success: false, error: error.message }
  revalidatePath(`/faelle/${pdok.fall_id}`)
  return { success: true }
}

/**
 * AAR-542 (C5): Synchronisiert pflichtdokumente-Rows mit der Katalog-Regel-
 * Auswertung. Legt fehlende Rows für „regel_pflicht_ohne_db"-Slots an.
 * Idempotent — bestehende Rows werden nicht verändert.
 * Wird vom „Neu evaluieren"-Button der PflichtDocMatrix getriggert.
 */
export async function syncPflichtdokumenteForFall(
  fallId: string,
): Promise<{ success: boolean; error?: string; created?: number }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nur KB/Admin dürfen die Matrix synchronisieren' }
  }

  // CMM-44 SP-B PR2c: zeugen_vorhanden lebt auf claims (SSoT) — via claims-Embed.
  // CMM-44 SP-H PR2: technische_stellungnahme_status lebt auf auftraege (aktueller
  // Auftrag) — via Nested-Embed unter claims. Pre-launch <=1 Auftrag pro Claim,
  // daher reicht der Embed ohne explizite reihenfolge-Ordnung.
  // CMM-49 + CMM-64: vorschaden_erkannt ist claims-SSoT (cardentity-Writer lib/cardentity/run-full.ts:196
  // schreibt claims; v_claim_full liest c.vorschaden_erkannt). faelle.vorschaden_erkannt = stale Legacy
  // (kein Writer mehr). bridge-Anchor (RLS-Client, admin/KB-gated) + claims-Embed; lead_id claims div=0;
  // id=bridge.fall_id. zeugen_vorhanden/auftraege wie bisher unter claims.
  const { data: fallRow } = await supabase
    .from('faelle_claim_bridge')
    .select('fall_id, claims:claims!fk_bridge_claim!inner(lead_id, vorschaden_erkannt, zeugen_vorhanden, auftraege(technische_stellungnahme_status))')
    .eq('fall_id', fallId)
    .single()
  if (!fallRow) return { success: false, error: 'Fall nicht gefunden' }
  const fallClaim = Array.isArray(fallRow.claims) ? fallRow.claims[0] : fallRow.claims
  const fall = {
    id: fallRow.fall_id,
    lead_id: (fallClaim as { lead_id?: string | null } | null)?.lead_id ?? null,
    // claims-SSoT null (cardentity nie gelaufen) -> false, reproduziert exakt den faelle-INSERT-Default
    // (faelle.vorschaden_erkannt war immer false, kein Writer); true nur wenn cardentity erkannt hat.
    vorschaden_erkannt: (fallClaim as { vorschaden_erkannt?: boolean | null } | null)?.vorschaden_erkannt ?? false,
  }
  const fallAuftraege = Array.isArray(
    (fallClaim as { auftraege?: unknown } | null)?.auftraege,
  )
    ? ((fallClaim as { auftraege: unknown[] }).auftraege)
    : ((fallClaim as { auftraege?: unknown } | null)?.auftraege
        ? [(fallClaim as { auftraege: unknown }).auftraege]
        : [])
  const aktAuftrag =
    (fallAuftraege[0] as { technische_stellungnahme_status?: string | null } | undefined) ?? null

  const { data: lead } = fall.lead_id
    ? await supabase.from('leads').select('*').eq('id', fall.lead_id).single()
    : { data: null }

  const { getAlleSlots } = await import('@/lib/dokumente/katalog')
  const { evaluatePflichtdocs } = await import('@/lib/dokumente/pflicht-evaluator')

  const [katalog, existing] = await Promise.all([
    getAlleSlots(supabase),
    supabase
      .from('pflichtdokumente')
      .select('id, dokument_typ, status, pflicht')
      .eq('fall_id', fallId),
  ])

  // CMM-44 SP-B PR2c: zeugen_vorhanden aus claims-Embed in das fall-Objekt mergen,
  // damit evaluatePflichtdocs weiterhin auf fall.zeugen_vorhanden zugreifen kann.
  // CMM-44 SP-H PR2: technische_stellungnahme_status aus dem auftraege-Embed mergen.
  const fallMerged: Record<string, unknown> = {
    ...(fall as unknown as Record<string, unknown>),
    zeugen_vorhanden: (fallClaim as { zeugen_vorhanden?: boolean | null } | null)?.zeugen_vorhanden ?? null,
    technische_stellungnahme_status: aktAuftrag?.technische_stellungnahme_status ?? null,
  }
  const matrix = evaluatePflichtdocs({
    katalog,
    fall: fallMerged,
    lead: (lead ?? null) as Record<string, unknown> | null,
    pflichtdokumente: (existing.data ?? []) as Array<{
      id: string
      dokument_typ: string
      status: string | null
      pflicht: boolean | null
    }>,
  })

  const fehlend = matrix.filter((e) => e.inkonsistenz === 'regel_pflicht_ohne_db')
  if (fehlend.length === 0) {
    return { success: true, created: 0 }
  }

  const rows = fehlend.map((e) => ({
    fall_id: fallId,
    dokument_typ: e.slot_id,
    pflicht: true,
    status: 'ausstehend',
    quelle: 'system-regel-sync',
  }))

  const { error } = await supabase.from('pflichtdokumente').insert(rows)
  if (error) return { success: false, error: error.message }

  revalidatePath(`/faelle/${fallId}`)
  return { success: true, created: fehlend.length }
}

export async function requestCardentityTypBForFall(
  fallId: string,
): Promise<CardentityRunResult> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const rolle = profile?.rolle as string | undefined
  if (!['admin', 'kundenbetreuer'].includes(rolle ?? '')) {
    return { success: false, error: 'Nur KB/Admin dürfen die Cardentity-Abfrage triggern' }
  }

  const { runCardentityCheck } = await import('@/lib/cardentity/run-full')
  const result = await runCardentityCheck('fall', fallId)
  if (result.success) revalidatePath(`/faelle/${fallId}`)
  return result
}

// AAR-684 Phase 2: Datei-Uploads + Anschlussschreiben-OCR + Pflichtdok-Status.

const KATEGORIE_SICHTBARKEIT: Record<string, string[]> = {
  kundendokument: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  schadensfoto: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
  gutachten: ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde', 'kanzlei'],
  'gutachter-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger'],
  kanzlei: ['admin', 'kundenbetreuer', 'kunde', 'kanzlei'],
  unterschrift: ['admin', 'kundenbetreuer', 'kanzlei'],
  sonstiges: ['admin', 'kundenbetreuer'],
  'whatsapp-foto': ['admin', 'kundenbetreuer', 'sachverstaendiger', 'kunde'],
}

export async function uploadDatei(
  fallId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return { success: false, error: 'Nicht angemeldet' }

  const file = formData.get('file') as File | null
  if (!file || !(file instanceof File)) return { success: false, error: 'Keine Datei ausgewählt' }

  const kategorie = (formData.get('kategorie') as string) || 'sonstiges'

  const { data: profile } = await supabase
    .from('profiles')
    .select('rolle')
    .eq('id', user.id)
    .single()
  const hochgeladen_von_rolle = profile?.rolle ?? 'admin'

  const sichtbar_fuer = KATEGORIE_SICHTBARKEIT[kategorie] ?? ['admin', 'kundenbetreuer']

  // AAR-553: fall-dokumente-Bucket
  const ext = file.name.split('.').pop() ?? 'bin'
  const timestamp = Date.now()
  const storagePath = `admin/${fallId}/${timestamp}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('fall-dokumente')
    .upload(storagePath, file, { contentType: file.type })
  if (uploadErr) return { success: false, error: uploadErr.message }

  const { error: insertErr } = await supabase.from('fall_dokumente').insert({
    fall_id: fallId,
    dokument_typ: kategorie,
    storage_path: storagePath,
    original_filename: file.name,
    groesse_bytes: file.size,
    mime_type: file.type || null,
    kategorie,
    hochgeladen_von_user_id: user.id,
    uploaded_by_sv: hochgeladen_von_rolle === 'sachverstaendiger',
    uploaded_by_kunde: hochgeladen_von_rolle === 'kunde',
    quelle: 'admin',
    sichtbar_fuer,
  })

  if (insertErr) return { success: false, error: insertErr.message }

  revalidatePath(`/faelle/${fallId}`)
  revalidatePath('/admin/faelle')
  return { success: true }
}

// uploadPflichtdokument (fallId, pflichtdokumentId, url) ENTFERNT — Storage-RLS-Rest.
// Einziger Caller war DokumenteTab.handleFileUpload, der jetzt den kanonischen
// Server-Helper `uploadDokumentToOutbox` nutzt (Storage + fall_dokumente + OCR +
// pflichtdokumente-Sync). Die Action war zudem zweifach kaputt:
//   - sie schrieb eine vom CLIENT uebergebene URL ungeprueft in
//     `pflichtdokumente.dokument_url` — alle anderen Writer legen dort den
//     storage_path ab (upload-dokument.ts:76, zuordnung.ts:107);
//   - als 'use server'-Export war sie ein offener POST-Endpunkt ohne Fall-Bezug:
//     jeder eingeloggte User konnte dokument_url einer BELIEBIGEN
//     pflichtdokumente-Row auf einen beliebigen String setzen (OWASP A01).
// Die Kunde-/Onboarding-Variante (@/app/kunde/onboarding/actions) bleibt — sie
// ist der Pfad, den PflichtdokumenteSection nutzt.

// KFZ-113: Anschlussschreiben-Upload mit OCR-Extraktion (Sendedatum + Signatur)
//
// Storage-RLS-Rest: Die Action nimmt jetzt die DATEI (FormData) statt einer
// fertigen URL. Der frühere Vertrag `(fallId, fileUrl, fileName)` war an drei
// Stellen kaputt, sobald STORAGE_USE_SIGNED_URLS=true gilt:
//   1. Der Browser-Caller signte die URL selbst — auf dem privaten Bucket
//      liefert createSignedUrl im Browser `null`, der Upload brach still ab.
//   2. Der storage_path wurde aus der URL zurückgeparst, mit einem Regex der
//      NUR `/object/public/` matcht. Eine signierte URL heißt `/object/sign/`
//      → kein Match → storage_path fiel auf den blanken Dateinamen zurück.
//   3. Die URL kam vom Client und wurde ungeprüft in die DB geschrieben —
//      eine signierte URL hat zudem eine TTL und wäre nach Ablauf tot.
// Die Datei server-seitig entgegenzunehmen löst alle drei: der Pfad ist
// bekannt statt geraten, und OCR liest die Bytes direkt statt die eigene
// Datei per HTTP zurückzuholen.
export async function uploadAnschlussschreiben(
  fallId: string,
  formData: FormData,
): Promise<{ success: boolean; error?: string }> {
  // Auth-Gate: spiegelt die Oberfläche (src/app/faelle/layout.tsx:47) — eine
  // Server-Action ist ein eigenständiger POST-Endpunkt, der Layout-Guard
  // schützt sie NICHT.
  const guard = await requireRole(['admin', 'kundenbetreuer', 'kanzlei', 'dispatch'])
  if (!guard.success) return { success: false, error: guard.error }
  const { supabase, user } = guard

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) {
    return { success: false, error: 'Keine Datei übergeben' }
  }
  if (file.size > 10 * 1024 * 1024) {
    return { success: false, error: 'Datei zu groß (max 10 MB)' }
  }
  if (file.type !== 'application/pdf') {
    return { success: false, error: 'Nur PDF erlaubt' }
  }

  const fileName = file.name
  const storagePath = `faelle/${fallId}/anschlussschreiben_${Date.now()}.pdf`

  // Claim VOR dem Upload aufloesen. Vorher lief der Upload zuerst und
  // upsertKanzleiFall brach danach mit 'no_claim_id' ab — die Datei blieb
  // verwaist im Bucket liegen.
  const claimIdForAs = await resolveClaimId(supabase, fallId)
  if (!claimIdForAs) {
    return { success: false, error: 'Kein Claim zum Fall gefunden' }
  }

  // Upload ueber den Service-Client. Der frühere Kommentar hier nahm an, "die
  // Storage-INSERT-Policy ist das Gate" — diese Annahme ist seit Migration
  // 20260513220337_aar_storage_buckets_lock ungueltig: Es gibt fuer
  // 'fall-dokumente' KEINE INSERT-Policy mehr, sondern nur noch
  // `locked_buckets_block_authenticated`, die den Bucket fuer JEDEN
  // eingeloggten Nutzer sperrt. Auf dem User-Client scheiterte der Upload
  // deshalb ausnahmslos mit "new row violates row-level security policy" —
  // gemessen 28.08. auf prod an CLM-2026-00837, der seit dem 16.07. genau
  // hier haengt ("Phase laeuft ohne Fortschritt seit 30 Werktagen").
  // Das Gate ist der requireRole-Guard oben; hier wird kein Recht erweitert.
  const admin = createAdminClient()
  const { error: upErr } = await admin.storage
    .from('fall-dokumente')
    .upload(storagePath, file, { contentType: 'application/pdf', upsert: false })
  if (upErr) return { success: false, error: `Upload fehlgeschlagen: ${upErr.message}` }

  // CMM-44 SP-I2 PR2: anschlussschreiben_url lebt auf kanzlei_faelle (1:1).
  // Inhalt ist der storage_path — dieselbe Konvention wie
  // pflichtdokumente.dokument_url (upload-dokument.ts:76, zuordnung.ts:107).
  // Signiert wird beim Lesen (getAnschlussschreibenUrl).
  const asUrlRes = await upsertKanzleiFall(supabase, claimIdForAs, {
    anschlussschreiben_url: storagePath,
  })
  if (!asUrlRes.ok) {
    return { success: false, error: asUrlRes.error ?? 'Anschlussschreiben-URL konnte nicht gespeichert werden' }
  }
  // CMM-65: Recency-Bump auf claims (SSoT) statt faelle.updated_at.
  await touchClaimRecency(supabase, claimIdForAs)

  // AAR-553: fall_dokumente statt dokumente. storage_path ist jetzt exakt
  // bekannt — kein Rückparsen aus einer URL mehr.
  //
  // claim_id explizit mitgeben: die BEFORE-INSERT-Trigger
  // (sync_fall_dokumente_claim_id / derive_claim_id_from_fall) leiten ihn zwar
  // aus fall_id ab, aber die generierten Supabase-Typen kennen keine Trigger
  // und fordern die NOT-NULL-Spalte. Wir haben die claim_id ohnehin — explizit
  // ist ehrlicher als ein `as`-Cast. (Sichtbar wurde das erst, weil die Action
  // jetzt den streng typisierten Guard-Client nutzt; createClient() aus
  // supabase/server.ts ist ohne <Database>-Generic und pruefte Inserts nie.)
  //
  // Fehler wird jetzt GEPRUEFT — vorher war der Insert ein nacktes `await`.
  // Ohne diese Zeile findet getAnschlussschreibenUrl spaeter kein Dokument.
  // Ebenfalls Service-Client: die INSERT-Policy `fall_dokumente__b1ins_au`
  // erlaubt nur den Kunden (uploaded_by_kunde am eigenen Claim) und den
  // zugewiesenen SV — weder KB noch Admin. Mit dem User-Client waere der
  // Storage-Upload oben also nur der erste von zwei Blockern gewesen.
  const { error: dokErr } = await admin.from('fall_dokumente').insert({
    fall_id: fallId,
    claim_id: claimIdForAs,
    dokument_typ: 'anschlussschreiben',
    storage_path: storagePath,
    original_filename: fileName,
    mime_type: 'application/pdf',
    kategorie: 'kanzlei',
    quelle: 'admin-upload',
    hochgeladen_von_user_id: user.id,
    sichtbar_fuer: ['admin', 'kundenbetreuer', 'kanzlei'],
  })
  if (dokErr) {
    return { success: false, error: `Dokument-Eintrag fehlgeschlagen: ${dokErr.message}` }
  }

  // OCR (non-critical) — Bytes direkt aus der Datei, kein HTTP-Re-Fetch.
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const pdfModule = await import('pdf-parse')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((pdfModule as any).default ?? pdfModule) as (buffer: Buffer) => Promise<{ text: string }>
    const parsed = await pdfParse(buffer)
    const text = parsed.text

    const sendedatum = extractSendedatum(text)
    const hatUnterschrift = checkUnterschrift(text)

    // CMM-44 SP-I2 PR2: AS-OCR-Felder auf kanzlei_faelle (1:1).
    await upsertKanzleiFall(supabase, claimIdForAs, {
      anschlussschreiben_sendedatum: sendedatum,
      anschlussschreiben_unterschrift: hatUnterschrift,
      anschlussschreiben_ocr_am: new Date().toISOString(),
    })
  } catch { /* OCR ist nicht kritisch */ }

  await supabase.from('timeline').insert({
    fall_id: fallId,
    typ: 'system',
    titel: 'Anschlussschreiben hochgeladen',
    beschreibung: `Datei: ${fileName}. OCR-Extraktion durchgeführt.`,
    erstellt_von: user.id,
  })

  revalidatePath(`/faelle/${fallId}`)
  return { success: true }
}

function extractSendedatum(text: string): string | null {
  const patterns = [
    /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/,
    /(\d{1,2})\.\s*(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i,
  ]
  const monateMap: Record<string, string> = {
    januar: '01', februar: '02', 'märz': '03', april: '04', mai: '05', juni: '06',
    juli: '07', august: '08', september: '09', oktober: '10', november: '11', dezember: '12',
  }

  const keywords = ['datum', 'sendedatum', 'gesendet am', 'versandt am', 'unser zeichen', 'ihr zeichen', 'berlin', 'münchen', 'köln', 'hamburg']
  for (const kw of keywords) {
    const idx = text.toLowerCase().indexOf(kw)
    if (idx === -1) continue
    const window = text.slice(Math.max(0, idx - 50), idx + 200)
    for (const pattern of patterns) {
      const match = window.match(pattern)
      if (match) {
        if (match[2] && monateMap[match[2].toLowerCase()]) {
          return `${match[3]}-${monateMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`
        }
        return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
      }
    }
  }

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match) {
      if (match[2] && monateMap[match[2].toLowerCase()]) {
        return `${match[3]}-${monateMap[match[2].toLowerCase()]}-${match[1].padStart(2, '0')}`
      }
      return `${match[3]}-${match[2].padStart(2, '0')}-${match[1].padStart(2, '0')}`
    }
  }
  return null
}

function checkUnterschrift(text: string): boolean {
  const keywords = ['unterschrift', 'unterzeichnet', 'gez.', 'mit freundlichen', 'hochachtungsvoll', 'rechtsanwalt', 'rechtsanwältin']
  const lower = text.toLowerCase()
  return keywords.some(kw => lower.includes(kw))
}
