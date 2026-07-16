import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { extractText, extractFromKfzSchein, extractFin } from '@/lib/ocr/extract'
import { validateFinMatch, validateKennzeichenMatch } from '@/lib/ocr/validation'
import { getStorageUrl } from '@/lib/storage/url'

// KFZ-200: Upload-Foto mit OCR-Pipeline.

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    if (!sv) return NextResponse.json({ error: 'no_sv' }, { status: 403 })

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    const terminId = formData.get('terminId') as string | null
    const fallId = formData.get('fallId') as string | null
    const dokumentTyp = formData.get('dokumentTyp') as string | null
    const schadenPosition = formData.get('schadenPosition') as string | null

    if (!file || !terminId || !fallId || !dokumentTyp) {
      return NextResponse.json({ error: 'file, terminId, fallId, dokumentTyp required' }, { status: 400 })
    }

    const db = createAdminClient()

    // Verify SV owns this termin
    // CMM-49 (sv_id-Drop): assignee_id+typ statt sv_id (value-identisch für SV-Termine);
    // das Select-Feld sv_id war dead (nur Existenz-Check) → gedroppt.
    const { data: termin } = await db
      .from('gutachter_termine')
      .select('id, fall_id')
      .eq('id', terminId)
      .eq('typ', 'sv_begutachtung')
      .eq('assignee_id', sv.id)
      .eq('assignee_typ', 'sachverstaendiger')
      .single()

    if (!termin) return NextResponse.json({ error: 'Termin nicht gefunden' }, { status: 404 })

    // Security (Write-Path-Audit 2026-07-01, F4): terminId ist SV-owned verifiziert,
    // aber fallId war ein unabhaengiges Formfeld -> ein SV mit irgendeinem eigenen
    // Termin konnte ein OCR-Dokument (discrepancy_flag, KB/Kanzlei/Admin-sichtbar) auf
    // einen FREMDEN Claim pflanzen. Der verifizierte Termin muss zum uebergebenen Fall
    // gehoeren. Siehe docs/2026-07-01-claim-write-path-authorization-audit.md.
    if (!termin.fall_id || termin.fall_id !== fallId) {
      return NextResponse.json({ error: 'Termin gehoert nicht zu diesem Fall' }, { status: 403 })
    }

    // Upload to Supabase Storage
    const fileBuffer = await file.arrayBuffer()
    const fileBytes = new Uint8Array(fileBuffer)
    const ext = file.name.split('.').pop() ?? 'jpg'
    const storagePath = `sv-uploads/${fallId}/${terminId}/${dokumentTyp}-${Date.now()}.${ext}`

    const { error: uploadErr } = await db
      .storage
      .from('fall-dokumente')
      .upload(storagePath, fileBytes, {
        contentType: file.type || 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      console.error('[upload-with-ocr] Storage upload error:', uploadErr.message)
      return NextResponse.json({ error: `Upload fehlgeschlagen: ${uploadErr.message}` }, { status: 500 })
    }

    // Storage-URL (Public heute, signed sobald STORAGE_USE_SIGNED_URLS=true).
    const publicUrl = await getStorageUrl(db, 'fall-dokumente', storagePath)
    if (!publicUrl) {
      return NextResponse.json({ error: 'URL-Generierung fehlgeschlagen' }, { status: 500 })
    }

    // Run OCR
    const base64 = Buffer.from(fileBytes).toString('base64')
    let ocrResult: Record<string, unknown> = {}
    let discrepancyFlag = false

    try {
      if (dokumentTyp === 'fahrzeugschein' || dokumentTyp === 'fahrzeugschein_rueck') {
        const kfzData = await extractFromKfzSchein(base64)
        ocrResult = { typ: 'kfz_schein', ...kfzData }

        // Validate against lead data
        // CMM-49 (Entity-Sweep): faelle -> v_claim_full. fin_vin/kennzeichen flach
        // (value-identisch, div=0).
        const { data: fall } = await db
          .from('v_claim_full')
          .select('fin_vin, kennzeichen, lead_id')
          .eq('fall_id', fallId)
          .single()

        if (fall) {
          if (kfzData.fin && fall.fin_vin) {
            const finValidation = validateFinMatch(kfzData.fin, fall.fin_vin)
            ocrResult.fin_validation = finValidation
            if (!finValidation.match) discrepancyFlag = true
          }
          if (kfzData.kennzeichen && fall.kennzeichen) {
            const kzValidation = validateKennzeichenMatch(kfzData.kennzeichen, fall.kennzeichen)
            ocrResult.kennzeichen_validation = kzValidation
            if (!kzValidation.match) discrepancyFlag = true
          }
        }
      } else if (dokumentTyp === 'vin_nummer') {
        const fin = await extractFin(base64)
        ocrResult = { typ: 'vin', fin }

        if (fin) {
          const { data: fall } = await db.from('v_claim_full').select('fin_vin').eq('fall_id', fallId).single()
          if (fall?.fin_vin) {
            const validation = validateFinMatch(fin, fall.fin_vin)
            ocrResult.validation = validation
            if (!validation.match) discrepancyFlag = true
          }
        }
      } else {
        // Generic OCR for other document types
        const { fullText } = await extractText(base64)
        ocrResult = { typ: 'generic', text: fullText.slice(0, 500) }
      }
    } catch (ocrErr) {
      console.error('[upload-with-ocr] OCR error:', ocrErr)
      ocrResult = { error: 'OCR fehlgeschlagen' }
    }

    // Create fall_dokumente row
    const { data: dokRow, error: dokErr } = await db
      .from('fall_dokumente')
      .insert({
        fall_id: fallId,
        dokument_typ: dokumentTyp,
        original_filename: file.name,
        storage_path: storagePath,
        uploaded_by_sv: true,
        uploaded_by_kunde: false,
        ocr_result: ocrResult,
        discrepancy_flag: discrepancyFlag,
        ...(schadenPosition ? { schaden_position: schadenPosition } : {}),
      })
      .select('id')
      .single()

    if (dokErr) {
      console.error('[upload-with-ocr] dokumente insert error:', dokErr.message)
      return NextResponse.json({ error: `Dokument-Speicherung fehlgeschlagen: ${dokErr.message}` }, { status: 500 })
    }

    return NextResponse.json({
      documentId: dokRow.id,
      url: publicUrl,
      ocrResult,
      discrepancyFlag,
    })
  } catch (err) {
    console.error('[upload-with-ocr] Unexpected error:', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
