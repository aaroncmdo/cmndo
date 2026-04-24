// AAR-761 Phase 1: Generischer Beleg-OCR-Endpoint.
// POST /api/ocr-beleg mit body { fall_id, typ, image_base64 }.
// Ruft lib/ocr-beleg/extract auf, schreibt Rohdaten in `fall_dokumente`
// (Kategorie 'rechnung' + beleg_typ + ocr_extracted jsonb).
// Auto-Write der extrahierten Werte in `faelle` erfolgt NICHT automatisch —
// das macht KB nach Review (Phase 2).

import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { extractBeleg } from '@/lib/ocr-beleg/extract'
import type { BelegTyp } from '@/lib/ocr-beleg/types'

const VALID_TYPS: BelegTyp[] = [
  'mietwagen_rechnung',
  'werkstatt_rechnung',
  'abschlepp_rechnung',
  'attest',
  'sonstiges',
]

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) {
      return NextResponse.json({ success: false, error: 'Nicht angemeldet' }, { status: 401 })
    }

    const body = (await request.json()) as {
      fall_id?: string
      typ?: string
      image_base64?: string
      image_url?: string
    }

    if (!body.fall_id) {
      return NextResponse.json({ success: false, error: 'fall_id fehlt' }, { status: 400 })
    }
    if (!body.typ || !VALID_TYPS.includes(body.typ as BelegTyp)) {
      return NextResponse.json(
        { success: false, error: `Ungültiger typ. Erlaubt: ${VALID_TYPS.join(', ')}` },
        { status: 400 },
      )
    }
    if (!body.image_base64 && !body.image_url) {
      return NextResponse.json(
        { success: false, error: 'image_base64 oder image_url erforderlich' },
        { status: 400 },
      )
    }

    // AAR-752 Permission-Check: User muss auf den Fall zugreifen können
    const { data: fall } = await supabase
      .from('faelle')
      .select('id')
      .eq('id', body.fall_id)
      .maybeSingle()
    if (!fall) {
      return NextResponse.json({ success: false, error: 'Fall nicht zugänglich' }, { status: 403 })
    }

    const result = await extractBeleg({
      typ: body.typ as BelegTyp,
      image: body.image_base64 ?? body.image_url!,
    })

    if (!result.success) {
      return NextResponse.json(result, { status: 502 })
    }

    // Persistenz: fall_dokumente-Row mit OCR-Blob anlegen.
    // storage_path ist NOT NULL — bei URL-Upload nehmen wir die URL,
    // bei Base64-Only-Extrakt setzen wir einen synthetischen Platzhalter
    // damit die Row schreibbar ist (Follow-up: Base64 erst in Storage
    // speichern, dann Real-Path setzen).
    const admin = createAdminClient()
    const storagePath = body.image_url ?? `ocr-extrakt/${body.fall_id}/${Date.now()}-inline`
    const { error: insErr } = await admin.from('fall_dokumente').insert({
      fall_id: body.fall_id,
      dokument_typ: body.typ,
      kategorie: 'rechnung',
      storage_path: storagePath,
      original_filename: null,
      quelle: 'kunde_upload_ocr',
      uploaded_by_kunde: true,
      ocr_extracted_data: result.extracted as unknown as Record<string, unknown>,
      ocr_processed_at: new Date().toISOString(),
      sichtbar_fuer: ['admin', 'kundenbetreuer'],
    })
    if (insErr) {
      console.error('[AAR-761] fall_dokumente insert fehlgeschlagen:', insErr.message)
      // Non-blocking: OCR-Result wird trotzdem zurückgegeben, Review kann
      // später manuell erfolgen
    }

    return NextResponse.json(result)
  } catch (err) {
    console.error('[AAR-761] Unerwarteter Fehler:', err)
    return NextResponse.json(
      { success: false, error: err instanceof Error ? err.message : 'unknown' },
      { status: 500 },
    )
  }
}
