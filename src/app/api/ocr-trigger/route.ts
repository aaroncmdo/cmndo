import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// KFZ-172 Phase 3: OCR-Trigger-Route.
// Ruft die Supabase Edge Function 'ocr-extract' auf oder fuehrt den
// OCR-Stub inline aus wenn die Edge Function nicht erreichbar ist.

export async function POST(request: Request) {
  const supabase = await createClient()
  const user = (await supabase.auth.getUser())?.data?.user ?? null
  if (!user) return NextResponse.json({ error: 'Nicht angemeldet' }, { status: 401 })

  const body = await request.json().catch(() => null)
  const dokumentId: string | undefined = body?.dokument_id
  if (!dokumentId) return NextResponse.json({ error: 'dokument_id fehlt' }, { status: 400 })

  // Versuche die Supabase Edge Function aufzurufen
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (supabaseUrl && anonKey) {
    try {
      const resp = await fetch(`${supabaseUrl}/functions/v1/ocr-extract`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${anonKey}`,
        },
        body: JSON.stringify({ dokument_id: dokumentId }),
      })
      if (resp.ok) {
        const data = await resp.json()
        return NextResponse.json(data)
      }
    } catch {
      // Edge Function nicht deployed — Inline-Stub
    }
  }

  // Fallback: Inline-Stub (setzt ocr_status='done' mit Stub-Daten)
  const { data: dok } = await supabase
    .from('fall_dokumente')
    .select('id, dokument_typ')
    .eq('id', dokumentId)
    .single()

  if (!dok) return NextResponse.json({ error: 'Dokument nicht gefunden' }, { status: 404 })

  const stubData = {
    stub: true,
    dokument_typ: dok.dokument_typ,
    hinweis: 'OCR Edge Function nicht deployed. Stub-Daten.',
    parsed: getStubData(dok.dokument_typ),
  }

  await supabase
    .from('fall_dokumente')
    .update({
      ocr_status: 'done',
      ocr_extracted_data: stubData,
      ocr_processed_at: new Date().toISOString(),
    })
    .eq('id', dokumentId)

  return NextResponse.json({ success: true, extracted: stubData })
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
