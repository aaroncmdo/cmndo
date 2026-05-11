import { NextRequest, NextResponse } from 'next/server'
import { runZB1Ocr } from '@/lib/ocr/zb1-parser'
import { createClient } from '@/lib/supabase/server'

// AAR-475 C9: Lead-seitige ZB1-OCR. Spiegelt /api/ocr-fahrzeugschein (das auf
// faelle schreibt), aber für den Self-Service-Flow: schreibt in leads.
// Wiederverwendet `runZB1Ocr` aus @/lib/ocr/zb1-parser (Google Vision).
// Bild wird zuätzlich im `fall-dokumente`-Bucket unter leads/{leadId}/zb1/ persistiert.

const BUCKET = 'fall-dokumente'

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')
    const leadId = formData.get('leadId')

    if (!(file instanceof File) || typeof leadId !== 'string' || !leadId) {
      return NextResponse.json(
        { success: false, error: 'Fehlende Daten (file + leadId erforderlich)' },
        { status: 400 },
      )
    }

    if (!file.type.startsWith('image/')) {
      return NextResponse.json(
        { success: false, error: 'Nur Bild-Dateien (JPG/PNG/WEBP) erlaubt' },
        { status: 400 },
      )
    }

    const supabase = await createClient()
    const buffer = Buffer.from(await file.arrayBuffer())

    // 1) Bild in Storage ablegen (Audit/Debug). Fehler sind nicht kritisch.
    const uuid = crypto.randomUUID()
    const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg'
    const path = `leads/${leadId}/zb1/${uuid}.${ext}`
    const { error: uploadError } = await supabase.storage
      .from(BUCKET)
      .upload(path, buffer, { contentType: file.type, upsert: false })
    if (uploadError) {
      console.error('[AAR-475] ZB1 Bild-Upload fehlgeschlagen:', uploadError.message)
    }

    // 2) OCR via Shared-Parser
    const base64 = buffer.toString('base64')
    const ocr = await runZB1Ocr(base64)
    if ('error' in ocr) {
      return NextResponse.json(
        { success: false, error: ocr.error },
        { status: ocr.status ?? 502 },
      )
    }
    const { fullText, extracted } = ocr

    if (!fullText) {
      return NextResponse.json({
        success: true,
        lowConfidence: true,
        extracted: null,
        message: 'Kein Text im Bild erkannt. Bitte manuell eingeben.',
      })
    }

    // 3) Confidence-Heuristik: wie viele Kern-Felder erkannt?
    const core = [
      extracted.fin_vin,
      extracted.hsn,
      extracted.tsn,
      extracted.kennzeichen,
      extracted.erstzulassung,
    ]
    const found = core.filter(Boolean).length
    const confidence = found / core.length

    // 4) Bei genug Daten: direkt in leads schreiben (inkl. Halter-Felder für ist_fahrzeughalter=false)
    const zb1Token = crypto.randomUUID()
    if (confidence >= 0.8) {
      // Prüfen ob Halter-Daten gebraucht werden (ist_fahrzeughalter=false am Lead)
      const { data: leadRow } = await supabase
        .from('leads')
        .select('ist_fahrzeughalter')
        .eq('id', leadId)
        .single()

      const halterUpdate =
        leadRow?.ist_fahrzeughalter === false
          ? {
              halter_vorname: extracted.halter_vorname ?? null,
              halter_nachname: extracted.halter_nachname ?? null,
              halter_strasse: extracted.halter_strasse ?? null,
              halter_plz: extracted.halter_plz ?? null,
              halter_stadt: extracted.halter_stadt ?? null,
            }
          : {}

      const { error: updateError } = await supabase
        .from('leads')
        .update({
          zb1_token: zb1Token,
          zb1_ocr_daten: {
            raw_text: fullText,
            extracted,
            confidence,
            scanned_at: new Date().toISOString(),
          },
          hsn: extracted.hsn ?? null,
          tsn: extracted.tsn ?? null,
          fin: extracted.fin_vin ?? null,
          kennzeichen: extracted.kennzeichen ?? null,
          erstzulassung: extracted.erstzulassung ?? null,
          fahrzeug_baujahr: extracted.fahrzeug_baujahr ?? null,
          fahrzeug_hersteller: extracted.fahrzeug_hersteller ?? null,
          fahrzeug_modell: extracted.fahrzeug_modell ?? null,
          fahrzeug_farbe: extracted.fahrzeug_farbe ?? null,
          brn: extracted.brn ?? null,
        })
        .eq('id', leadId)
      if (updateError) {
        console.error('[AAR-475] Lead-Update nach OCR fehlgeschlagen:', updateError.message)
      }
    }

    return NextResponse.json({
      success: true,
      extracted,
      confidence,
      zb1Token,
      lowConfidence: confidence < 0.8,
    })
  } catch (err) {
    console.error('[AAR-475] Unerwarteter Fehler ZB1-Scan:', err)
    return NextResponse.json(
      {
        success: false,
        error: err instanceof Error ? err.message : 'Unbekannter Fehler',
      },
      { status: 500 },
    )
  }
}
