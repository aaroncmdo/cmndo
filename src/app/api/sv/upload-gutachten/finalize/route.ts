// CMM-32: Finalize-Endpoint für Direktupload. Client lädt die Datei direkt
// in den fall-dokumente-Bucket via supabase-js und ruft dann diesen
// Endpoint mit den Metadaten — fall_dokumente-Eintrag + auftraege-Update.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    if (!sv) return NextResponse.json({ error: 'no_sv' }, { status: 403 })

    const body = await req.json() as {
      auftragId?: string
      storagePath?: string
      filename?: string
      sizeBytes?: number
      mimeType?: string
      istHauptgutachten?: boolean
    }

    if (!body.auftragId || !body.storagePath || !body.filename) {
      return NextResponse.json({ error: 'auftragId, storagePath, filename required' }, { status: 400 })
    }

    const db = createAdminClient()

    const { data: auftrag } = await db
      .from('auftraege')
      .select('id, fall_id, sv_id, gutachten_url, status, faelle!inner(claim_id)')
      .eq('id', body.auftragId)
      .eq('sv_id', sv.id)
      .single()
    if (!auftrag) return NextResponse.json({ error: 'Auftrag nicht gefunden' }, { status: 404 })

    const claimId = (auftrag as unknown as { faelle: { claim_id: string | null } }).faelle?.claim_id
    if (!claimId) return NextResponse.json({ error: 'Claim nicht gefunden' }, { status: 400 })

    // Pfad-Whitelist: muss unter claim/<claimId>/gutachten/<auftragId>/[nachbesserung/]
    const expectedPrefix = `claim/${claimId}/gutachten/${body.auftragId}/`
    if (!body.storagePath.startsWith(expectedPrefix)) {
      return NextResponse.json({ error: 'Ungültiger Storage-Pfad' }, { status: 400 })
    }

    const { data: publicData } = db.storage.from('fall-dokumente').getPublicUrl(body.storagePath)
    const publicUrl = publicData.publicUrl

    await db.from('fall_dokumente').insert({
      fall_id: auftrag.fall_id,
      dokument_typ: body.istHauptgutachten ? 'gutachten' : 'gutachten_anlage',
      storage_path: body.storagePath,
      original_filename: body.filename,
      groesse_bytes: body.sizeBytes ?? null,
      kategorie: 'gutachten',
      quelle: 'sv-upload',
      sichtbar_fuer: ['kundenbetreuer', 'kanzlei', 'admin'],
      uploaded_by_sv: true,
      hochgeladen_am: new Date().toISOString(),
    })

    if (body.istHauptgutachten || (!auftrag.gutachten_url && (body.mimeType === 'application/pdf' || body.filename.toLowerCase().endsWith('.pdf')))) {
      // CMM-32e: Bei Re-Upload Reject-Marker zurücksetzen (Grund bleibt für Audit)
      await db
        .from('auftraege')
        .update({
          gutachten_url: publicUrl,
          status: 'gutachten',
          zurueckgewiesen_am: null,
        })
        .eq('id', body.auftragId)

      // Wenn das ein Re-Upload nach Reject war: KB benachrichtigen + Timeline
      const { data: auftragMitClaim } = await db
        .from('auftraege')
        .select('id, fall_id, zurueckweisung_grund, faelle!inner(kundenbetreuer_id)')
        .eq('id', body.auftragId)
        .single()
      const kbId = (auftragMitClaim as unknown as { faelle: { kundenbetreuer_id: string | null } } | null)?.faelle?.kundenbetreuer_id
      if (auftrag.gutachten_url && auftragMitClaim?.zurueckweisung_grund) {
        try {
          await db.from('timeline').insert({
            fall_id: auftragMitClaim.fall_id,
            typ: 'gutachten_korrigiert',
            titel: 'Korrigiertes Gutachten eingereicht',
            beschreibung: 'SV hat eine korrigierte Version hochgeladen.',
            erstellt_von: user.id,
          })
        } catch { /* non-critical */ }
        // TODO: KB-Mitteilung wenn createKbMitteilung-Helper existiert (CMM-32 Folge-PR).
        void kbId
      }
    }

    return NextResponse.json({ ok: true, publicUrl })
  } catch (err) {
    console.error('[upload-gutachten/finalize]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
