// CMM-32: Finalize-Endpoint für Direktupload. Client lädt die Datei direkt
// in den fall-dokumente-Bucket via supabase-js und ruft dann diesen
// Endpoint mit den Metadaten — fall_dokumente-Eintrag + auftraege-Update.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'
import { getStorageUrl } from '@/lib/storage/url'

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

    // AAR-862: Pfad-Whitelist auf claims/<claimId>/gutachten/<auftragId>/[nachbesserung/]
    // Legacy `claim/` (Singular) wird während der Übergangs-Phase auch akzeptiert
    // (Backfill-Job migriert alle alten Files, danach kann der Legacy-Check entfallen).
    const expectedPrefix = `claims/${claimId}/gutachten/${body.auftragId}/`
    const legacyPrefix = `claim/${claimId}/gutachten/${body.auftragId}/`
    if (!body.storagePath.startsWith(expectedPrefix) && !body.storagePath.startsWith(legacyPrefix)) {
      return NextResponse.json({ error: 'Ungültiger Storage-Pfad' }, { status: 400 })
    }

    const publicUrl = await getStorageUrl(db, 'fall-dokumente', body.storagePath)
    if (!publicUrl) {
      return NextResponse.json({ error: 'URL-Generierung fehlgeschlagen' }, { status: 500 })
    }

    await db.from('fall_dokumente').insert({
      fall_id: auftrag.fall_id,
      dokument_typ: body.istHauptgutachten ? 'gutachten' : 'gutachten_anlage',
      storage_path: body.storagePath,
      original_filename: body.filename,
      groesse_bytes: body.sizeBytes ?? null,
      kategorie: 'gutachten',
      quelle: 'sv-upload',
      sichtbar_fuer: ['sachverstaendiger', 'kundenbetreuer', 'kanzlei', 'admin'],
      uploaded_by_sv: true,
      hochgeladen_am: new Date().toISOString(),
    })

    // CMM-32e: finalize updated nur noch fall_dokumente. Der explizite Submit-
    // Button löst die QC-Pipeline aus (siehe gutachtenAbgeben in lib/auftrag/qc).
    void user.id
    void auftrag

    return NextResponse.json({ ok: true, publicUrl })
  } catch (err) {
    console.error('[upload-gutachten/finalize]', err)
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
