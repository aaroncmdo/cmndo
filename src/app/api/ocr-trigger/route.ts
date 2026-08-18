import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractDokument } from '@/lib/ocr/claude-extract'

// KFZ-172 / Aaron 13.07.: OCR-Trigger fuer fall_dokumente — Claude Vision
// (Opus 4.8, structured outputs) statt Google Cloud Vision. Modell aus
// AI_MODELS.doc_ocr. Kein ANTHROPIC_API_KEY -> ocr_status='failed'
// (kein stiller Stub mehr).

export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const dokumentId: string | undefined = body?.dokument_id
  if (!dokumentId) return NextResponse.json({ error: 'dokument_id fehlt' }, { status: 400 })

  // Admin-Client fuer Storage-Download (umgeht RLS)
  const db = createAdminClient()

  // 1. Dokument laden
  const { data: dok } = await db
    .from('fall_dokumente')
    .select('id, fall_id, dokument_typ, storage_path, mime_type')
    .eq('id', dokumentId)
    .single()

  if (!dok) return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 })

  // Status auf processing
  // Bleibt dieser Marker aus, kann derselbe Lauf parallel erneut getriggert werden.
  const { error: procFehler } = await db.from('fall_dokumente').update({ ocr_status: 'processing' }).eq('id', dokumentId)
  if (procFehler) console.error(`[OCR] Status 'processing' nicht gesetzt (${dokumentId}):`, procFehler.message)

  // Datei aus Storage lesen (Admin-Client umgeht RLS) -> Base64 fuer Claude Vision.
  const { data: fileData, error: fileErr } = await db.storage
    .from('fall-dokumente')
    .download(dok.storage_path)
  if (fileErr || !fileData) {
    // Ohne 'failed' bleibt das Dokument auf 'processing' haengen — es sieht dann
    // dauerhaft "in Bearbeitung" aus, obwohl nichts mehr laeuft.
    const { error: failFehler } = await db.from('fall_dokumente').update({ ocr_status: 'failed' }).eq('id', dokumentId)
    if (failFehler) console.error(`[OCR] Status 'failed' nicht gesetzt (${dokumentId}) — bleibt auf 'processing':`, failFehler.message)
    return NextResponse.json({ error: 'Datei nicht lesbar' }, { status: 500 })
  }
  const base64 = Buffer.from(await fileData.arrayBuffer()).toString('base64')
  const mimeType = (dok.mime_type as string | null) ?? 'application/pdf'

  // Claude-Vision-OCR (Opus 4.8, structured outputs) — ersetzt Google Cloud Vision.
  const ocr = await extractDokument(dok.dokument_typ, base64, mimeType)
  if (!ocr.success) {
    console.error('[OCR] Claude-Vision Fehler:', ocr.error)
    const { error: ocrFailFehler } = await db.from('fall_dokumente').update({ ocr_status: 'failed' }).eq('id', dokumentId)
    if (ocrFailFehler) console.error(`[OCR] Status 'failed' nicht gesetzt (${dokumentId}) — bleibt auf 'processing':`, ocrFailFehler.message)
    return NextResponse.json({ error: ocr.error ?? 'OCR fehlgeschlagen' }, { status: 502 })
  }
  const extractedData: Record<string, unknown> = {
    live: true,
    engine: 'claude-vision',
    dokument_typ: dok.dokument_typ,
    fields_found: ocr.fields_found,
    parsed: ocr.parsed,
  }

  // Ergebnis speichern. ERFOLGSPFAD: das OCR ist gelaufen (und hat gekostet).
  // Still fehlgeschlagen sind die extrahierten Daten weg UND der Status bleibt
  // auf 'processing' — das Dokument sieht dauerhaft "in Bearbeitung" aus.
  const { error: ergebnisFehler } = await db
    .from('fall_dokumente')
    .update({
      ocr_status: 'done',
      ocr_extracted_data: extractedData,
      ocr_processed_at: new Date().toISOString(),
    })
    .eq('id', dokumentId)
  if (ergebnisFehler) {
    console.error(`[OCR] Ergebnis NICHT gespeichert (${dokumentId}) — Daten verloren:`, ergebnisFehler.message)
  }

  // CMM-49 faelle-DROP (CMM-67 / CMM-50 Group C): Geburtsdatum aus Personalausweis-/
  // Fuehrerschein-OCR auf die ist_halter-claim_party -> personen.geburtsdatum schreiben
  // (NICHT mehr faelle.halter_geburtsdatum). v_claim_full.halter_geburtsdatum sourct genau
  // diese Person (halter_p-LATERAL: ist_halter=true, ORDER BY reihenfolge, created_at LIMIT 1).
  // Der fruehere faelle-Write war reader-frei (Display liest vcf=Person) -> das OCR-Geburtsdatum
  // versickerte; jetzt sichtbar UND faelle-frei (letzter direkter faelle.halter_geburtsdatum-
  // Accessor -> DROP-Enabler). H6-Regel ("nur wenn leer") bleibt, jetzt gegen die SSoT (Person)
  // geprueft. ZB1 enthaelt selbst kein Geburtsdatum; Halter=Fahrer im Standardfall.
  if (
    (dok.dokument_typ === 'personalausweis' || dok.dokument_typ === 'fuehrerschein') &&
    dok.fall_id
  ) {
    const parsed = (extractedData as { parsed?: { geburtsdatum?: string | null } }).parsed
    const geb = parsed?.geburtsdatum ? toIsoDate(parsed.geburtsdatum) : null
    if (geb) {
      // fall_id -> claim_id (Bridge) -> ist_halter-Party -> Person (== v_claim_full.halter_p)
      const { data: bridge } = await db
        .from('faelle_claim_bridge')
        .select('claim_id')
        .eq('fall_id', dok.fall_id)
        .maybeSingle()
      const claimId = (bridge as { claim_id?: string | null } | null)?.claim_id ?? null
      if (claimId) {
        const { data: halterParty } = await db
          .from('claim_parties')
          .select('person_id')
          .eq('claim_id', claimId)
          .eq('ist_halter', true)
          .order('reihenfolge', { ascending: true })
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
        const personId = (halterParty as { person_id?: string | null } | null)?.person_id ?? null
        if (personId) {
          const { data: person } = await db
            .from('personen')
            .select('geburtsdatum')
            .eq('id', personId)
            .single()
          if (person && !person.geburtsdatum) {
            await db.from('personen').update({ geburtsdatum: geb }).eq('id', personId)
          }
        }
      }
    }
  }

  return NextResponse.json({ success: true, extracted: extractedData })
}

// DD.MM.YYYY / DD/MM/YYYY → YYYY-MM-DD; bereits-ISO (Claude Vision) passthrough.
function toIsoDate(raw: string): string | null {
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return raw
  const m = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}
