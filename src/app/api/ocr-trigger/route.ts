import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import {
  parseFahrzeugschein,
  parseVersicherungsschein,
  parseFuehrerschein,
  parseUnfallbericht,
} from '@/lib/dokumente/ocr-patterns'

// KFZ-172: OCR-Trigger — ruft Google Cloud Vision API direkt auf.
// Env-Var: GOOGLE_VISION_API_KEY (in Vercel setzen).
// Wenn kein Key: Stub-Daten fuer Tests.

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
  await db.from('fall_dokumente').update({ ocr_status: 'processing' }).eq('id', dokumentId)

  const apiKey = process.env.GOOGLE_VISION_API_KEY
  let extractedData: Record<string, unknown>

  if (apiKey) {
    // ─── LIVE: Google Cloud Vision API ──────────────────────────────
    try {
      // Datei aus Storage lesen
      const { data: fileData, error: fileErr } = await db.storage
        .from('fall-dokumente')
        .download(dok.storage_path)

      if (fileErr || !fileData) {
        await db.from('fall_dokumente').update({ ocr_status: 'failed' }).eq('id', dokumentId)
        return NextResponse.json({ error: 'Datei nicht lesbar' }, { status: 500 })
      }

      // Base64 konvertieren
      const arrayBuffer = await fileData.arrayBuffer()
      const base64 = Buffer.from(arrayBuffer).toString('base64')

      // Vision API aufrufen
      const visionResp = await fetch(
        `https://vision.googleapis.com/v1/images:annotate?key=${apiKey}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            requests: [{
              image: { content: base64 },
              features: [{ type: 'TEXT_DETECTION', maxResults: 1 }],
            }],
          }),
        },
      )

      if (!visionResp.ok) {
        const errBody = await visionResp.text().catch(() => '')
        console.error('[OCR] Vision API Error:', visionResp.status, errBody)
        await db.from('fall_dokumente').update({ ocr_status: 'failed' }).eq('id', dokumentId)
        return NextResponse.json({ error: `Vision API ${visionResp.status}` }, { status: 502 })
      }

      const visionData = await visionResp.json()
      const fullText: string = visionData?.responses?.[0]?.fullTextAnnotation?.text ?? ''

      // Parse basierend auf dokument_typ
      const parsed = parseByType(dok.dokument_typ, fullText)

      extractedData = {
        live: true,
        dokument_typ: dok.dokument_typ,
        raw_text: fullText.slice(0, 2000),
        parsed,
      }
    } catch (err) {
      console.error('[OCR] Exception:', err)
      await db.from('fall_dokumente').update({ ocr_status: 'failed' }).eq('id', dokumentId)
      return NextResponse.json({ error: String(err) }, { status: 500 })
    }
  } else {
    // ─── STUB: kein API Key ──────────────────────────────────────────
    extractedData = {
      stub: true,
      dokument_typ: dok.dokument_typ,
      hinweis: 'GOOGLE_VISION_API_KEY nicht gesetzt. Stub-Daten.',
      parsed: getStubData(dok.dokument_typ),
    }
  }

  // Ergebnis speichern
  await db
    .from('fall_dokumente')
    .update({
      ocr_status: 'done',
      ocr_extracted_data: extractedData,
      ocr_processed_at: new Date().toISOString(),
    })
    .eq('id', dokumentId)

  // AAR-CMM: Geburtsdatum aus Personalausweis/Führerschein-OCR nach
  // faelle.halter_geburtsdatum schreiben — H6-Regel: nur wenn Feld leer.
  // ZB1 enthält selbst kein Geburtsdatum, daher kommt es aus den
  // Personendokumenten und befüllt das Halter-Feld (Halter=Fahrer im
  // Standardfall, sonst korrigiert der Dispatcher manuell).
  if (
    (dok.dokument_typ === 'personalausweis' || dok.dokument_typ === 'fuehrerschein') &&
    dok.fall_id
  ) {
    const parsed = (extractedData as { parsed?: { geburtsdatum?: string | null } }).parsed
    const geb = parsed?.geburtsdatum ? toIsoDate(parsed.geburtsdatum) : null
    if (geb) {
      const { data: fall } = await db
        .from('faelle')
        .select('halter_geburtsdatum')
        .eq('id', dok.fall_id)
        .single()
      if (fall && !fall.halter_geburtsdatum) {
        await db
          .from('faelle')
          .update({ halter_geburtsdatum: geb })
          .eq('id', dok.fall_id)
      }
    }
  }

  return NextResponse.json({ success: true, extracted: extractedData })
}

// DD.MM.YYYY oder DD/MM/YYYY → YYYY-MM-DD (Postgres-date-Format)
function toIsoDate(raw: string): string | null {
  const m = raw.match(/^(\d{2})[./](\d{2})[./](\d{4})$/)
  if (!m) return null
  const [, dd, mm, yyyy] = m
  return `${yyyy}-${mm}-${dd}`
}

// ─── Typ-spezifisches Parsing ──────────────────────────────────────────────

function parseByType(typ: string, text: string): Record<string, string | null> {
  switch (typ) {
    case 'fahrzeugschein':
      return parseFahrzeugschein(text) as unknown as Record<string, string | null>
    case 'versicherungsschein_eigener':
      return parseVersicherungsschein(text) as unknown as Record<string, string | null>
    case 'personalausweis':
    case 'fuehrerschein':
      return parseFuehrerschein(text) as unknown as Record<string, string | null>
    case 'unfallbericht_polizei':
      return parseUnfallbericht(text) as unknown as Record<string, string | null>
    default:
      return { raw_excerpt: text.slice(0, 500) }
  }
}

function getStubData(typ: string): Record<string, string | null> {
  switch (typ) {
    case 'fahrzeugschein':
      return { fin: 'WBAPH5C55BA123456', kennzeichen: 'K-AB 1234', erstzulassung: '01.06.2020', hersteller: 'BMW', modell: '320d' }
    case 'versicherungsschein_eigener':
      return { versicherer: 'HUK-COBURG', vsnummer: 'VS-2024-987654', versicherter: 'Max Mustermann' }
    case 'personalausweis':
      return { vorname: 'Max', nachname: 'Mustermann', geburtsdatum: '15.03.1985' }
    default:
      return { info: `Stub fuer ${typ}` }
  }
}
