// Signed Upload URL fuer den SV-Gutachten-Direktupload.
//
// WARUM: Der Banner laedt bewusst DIREKT aus dem Browser in den Storage (Drag&Drop am
// Claim, kein API-Body -> kein Body-Limit bei grossen Gutachten-PDFs). Er tat das bisher
// mit dem USER-Client — der Bucket `fall-dokumente` ist aber per RLS gesperrt:
//
//   locked_buckets_block_authenticated (authenticated) ALL
//     bucket_id <> ALL ('fall-dokumente','gutachten','schadensfotos','unterschriften')
//
// Nur `service_role` darf dort schreiben. Jeder SV-Upload scheiterte deshalb mit
// „new row violates row-level security policy" — belegt: 962 Objekte im Bucket, davon 0
// im SV-Pfad. Marker: broadcast-sv-gutachten-upload-scheitert-an-storage-rls.
//
// LOESUNG: Der Server (Admin-Client) erzeugt eine signierte Upload-URL; der Client laedt
// damit direkt hoch (`uploadToSignedUrl`). Direktupload bleibt erhalten, RLS wird nicht
// aufgeweicht — die locked-buckets-Policy bleibt unveraendert scharf.
//
// SICHERHEIT: Der Pfad wird hier SERVERSEITIG gebaut, nicht vom Client uebernommen.
// Damit kann ein SV keine Signatur fuer einen fremden Claim/Auftrag erschleichen. Die
// Auth-Kette ist dieselbe wie in ../finalize: eingeloggt -> ist SV -> Auftrag gehoert ihm.
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getGutachterForUser } from '@/lib/gutachter'

export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const user = (await supabase.auth.getUser())?.data?.user ?? null
    if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

    const sv = await getGutachterForUser<{ id: string }>(supabase, user.id, 'id')
    if (!sv) return NextResponse.json({ error: 'no_sv' }, { status: 403 })

    const body = (await req.json()) as { auftragId?: string; filename?: string }
    if (!body.auftragId || !body.filename) {
      return NextResponse.json({ error: 'auftragId, filename required' }, { status: 400 })
    }

    const db = createAdminClient()

    // Ownership: der Auftrag muss DIESEM SV gehoeren (gleiche Query wie in finalize).
    const { data: auftrag } = await db
      .from('auftraege')
      .select('id, claim_id, zurueckgewiesen_am')
      .eq('id', body.auftragId)
      .eq('sv_id', sv.id)
      .single()
    if (!auftrag) return NextResponse.json({ error: 'Auftrag nicht gefunden' }, { status: 404 })

    const claimId = auftrag.claim_id
    if (!claimId) return NextResponse.json({ error: 'Claim nicht gefunden' }, { status: 400 })

    // Pfad serverseitig bauen — identisches Schema wie die finalize-Whitelist
    // (`claims/<claimId>/gutachten/<auftragId>/[nachbesserung/]`). Der
    // nachbesserung/-Subfolder wird aus dem Auftrag abgeleitet (nicht vom Client
    // uebernommen), damit beide Seiten dieselbe Quelle haben.
    const safeName = body.filename.replace(/[^a-z0-9._-]/gi, '_')
    const subfolder = auftrag.zurueckgewiesen_am ? 'nachbesserung/' : ''
    const storagePath = `claims/${claimId}/gutachten/${body.auftragId}/${subfolder}${Date.now()}-${safeName}`

    const { data: signed, error } = await db.storage
      .from('fall-dokumente')
      .createSignedUploadUrl(storagePath)

    if (error || !signed) {
      console.error('[upload-gutachten/signed-url]', error?.message)
      return NextResponse.json({ error: error?.message ?? 'Signatur fehlgeschlagen' }, { status: 500 })
    }

    // `path` + `token` reichen dem Client fuer uploadToSignedUrl(); den Pfad gibt er
    // anschliessend unveraendert an finalize weiter (dessen Whitelist ihn erneut prueft).
    return NextResponse.json({ path: storagePath, token: signed.token })
  } catch (err) {
    console.error('[upload-gutachten/signed-url]', err)
    return NextResponse.json({ error: 'Serverfehler' }, { status: 500 })
  }
}
