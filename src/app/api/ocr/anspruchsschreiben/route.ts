import { NextRequest, NextResponse } from 'next/server'
import { createServiceClient } from '@/lib/supabase/server'

// Position types we look for
const POSITION_PATTERNS: { typ: string; bezeichnung: string; keywords: string[] }[] = [
  { typ: 'reparatur', bezeichnung: 'Reparaturkosten', keywords: ['reparaturkosten', 'reparatur', 'instandsetzung'] },
  { typ: 'wertminderung', bezeichnung: 'Merkantile Wertminderung', keywords: ['wertminderung', 'minderwert', 'merkantil'] },
  { typ: 'nutzungsausfall', bezeichnung: 'Nutzungsausfall', keywords: ['nutzungsausfall', 'nutzungsentschädigung'] },
  { typ: 'mietwagen', bezeichnung: 'Mietwagenkosten', keywords: ['mietwagen', 'mietfahrzeug', 'ersatzfahrzeug'] },
  { typ: 'gutachterkosten', bezeichnung: 'Gutachterkosten', keywords: ['gutachterkosten', 'sachverständigenkosten', 'gutachterhonorar'] },
  { typ: 'abschleppkosten', bezeichnung: 'Abschleppkosten', keywords: ['abschleppkosten', 'abschlepp', 'bergen'] },
  { typ: 'anwaltskosten', bezeichnung: 'Anwaltskosten', keywords: ['anwaltskosten', 'rechtsanwaltskosten', 'rvg', 'geschäftsgebühr', 'rechtsanwaltsgebühr'] },
  { typ: 'kostenpauschale', bezeichnung: 'Kostenpauschale', keywords: ['kostenpauschale', 'unkostenpauschale', 'allgemeine kosten'] },
  { typ: 'schmerzensgeld', bezeichnung: 'Schmerzensgeld', keywords: ['schmerzensgeld', 'schmerzens'] },
  { typ: 'wbw', bezeichnung: 'Wiederbeschaffungswert', keywords: ['wiederbeschaffungswert', 'wiederbeschaffung', 'wbw'] },
  { typ: 'restwert', bezeichnung: 'Restwert', keywords: ['restwert'] },
]

// Extract euro amounts near a keyword
function extractAmount(text: string, keyword: string): number | null {
  const idx = text.toLowerCase().indexOf(keyword.toLowerCase())
  if (idx === -1) return null

  // Look in a window of 200 chars after the keyword
  const window = text.slice(idx, idx + 200)

  // Match patterns like: 1.234,56 EUR | 1234,56 € | EUR 1.234,56
  const match = window.match(/(\d{1,3}(?:\.\d{3})*,\d{2})\s*(?:EUR|€|Euro)/i)
    ?? window.match(/(?:EUR|€|Euro)\s*(\d{1,3}(?:\.\d{3})*,\d{2})/i)
    ?? window.match(/(\d{1,3}(?:\.\d{3})*,\d{2})/i)

  if (!match?.[1]) return null

  // Parse german number: 1.234,56 → 1234.56
  return parseFloat(match[1].replace(/\./g, '').replace(',', '.'))
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { fall_id, pdf_url, quelle } = body as { fall_id: string; pdf_url: string; quelle: string }

    if (!fall_id || !pdf_url) {
      return NextResponse.json({ error: 'fall_id und pdf_url erforderlich' }, { status: 400 })
    }

    // Fetch PDF
    const pdfResponse = await fetch(pdf_url)
    if (!pdfResponse.ok) {
      return NextResponse.json({ error: 'PDF konnte nicht geladen werden' }, { status: 400 })
    }
    const buffer = Buffer.from(await pdfResponse.arrayBuffer())

    // Parse PDF text
    const pdfModule = await import('pdf-parse')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pdfParse = ((pdfModule as any).default ?? pdfModule) as (buffer: Buffer) => Promise<{ text: string }>
    const parsed = await pdfParse(buffer)
    const text = parsed.text

    // Extract positions
    const positions: { typ: string; bezeichnung: string; betrag: number | null }[] = []

    for (const pattern of POSITION_PATTERNS) {
      for (const keyword of pattern.keywords) {
        if (text.toLowerCase().includes(keyword)) {
          const betrag = extractAmount(text, keyword)
          // Avoid duplicates
          if (!positions.some(p => p.typ === pattern.typ)) {
            positions.push({ typ: pattern.typ, bezeichnung: pattern.bezeichnung, betrag })
          }
          break
        }
      }
    }

    // Insert into DB
    const svc = createServiceClient()
    const src = quelle === 'ruegeschreiben' ? 'ruegeschreiben' : 'anspruchsschreiben'

    for (const pos of positions) {
      const insertData: Record<string, unknown> = {
        fall_id,
        typ: pos.typ,
        bezeichnung: pos.bezeichnung,
        quelle: src,
      }

      if (src === 'anspruchsschreiben') {
        insertData.betrag_gefordert = pos.betrag
      } else {
        // Rügeschreiben: update existing position or insert
        const { data: existing } = await svc.from('forderungspositionen')
          .select('id')
          .eq('fall_id', fall_id)
          .eq('typ', pos.typ)
          .single()

        if (existing) {
          await svc.from('forderungspositionen').update({
            betrag_reguliert: pos.betrag,
            betrag_gekuerzt: null, // will be calculated in frontend
          }).eq('id', existing.id)
          continue
        }
        insertData.betrag_reguliert = pos.betrag
      }

      await svc.from('forderungspositionen').insert(insertData)
    }

    return NextResponse.json({
      positionen: positions,
      count: positions.length,
      textLength: text.length,
    })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : 'OCR Fehler' }, { status: 500 })
  }
}
