import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'

// FIN/VIN pattern: 17 alphanumeric chars, typically starts with W (German vehicles)
const FIN_REGEX = /\b([A-HJ-NPR-Z0-9]{17})\b/gi

export async function POST(request: Request) {
  try {
    const { fall_id, datei_url } = await request.json()
    if (!fall_id) {
      return NextResponse.json({ error: 'fall_id erforderlich' }, { status: 400 })
    }

    const supabase = await createClient()

    // For now: FIN extraction is a placeholder.
    // In production, use tesseract.js or a dedicated OCR service.
    // The FIN will be entered manually until OCR is set up.
    const extractedFin: string | null = null

    // If a URL is provided, we could download and OCR it.
    // For now, return a hint that manual entry is needed.
    if (!extractedFin) {
      return NextResponse.json({
        success: false,
        message: 'OCR konnte keine FIN extrahieren. Bitte manuell eingeben.',
        fin: null,
      })
    }

    // If we found a FIN, save it
    await supabase
      .from('faelle')
      .update({
        fin_vin: extractedFin,
        fin_quelle: 'fahrzeugschein_ocr',
        fin_extrahiert_am: new Date().toISOString(),
      })
      .eq('id', fall_id)

    // Trigger CarDentity Typ-A check
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    fetch(`${baseUrl}/api/cardentity/typ-a`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fall_id, fin_vin: extractedFin }),
    }).catch(() => {})

    return NextResponse.json({ success: true, fin: extractedFin })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Unbekannter Fehler' },
      { status: 500 }
    )
  }
}
